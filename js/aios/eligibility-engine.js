/* ══════════════════════════════════════════════════════════
   AIOS — Eligibility Engine  (Phase 23)
   Produces confidence-style relevance scores for veteran
   benefit categories from structured memory profile fields.

   IMPORTANT DESIGN CONSTRAINTS:
   - Scores are RELEVANCE estimates, NOT legal eligibility determinations.
   - No score ever reaches 1.0 — incomplete profiles cannot guarantee certainty.
   - Rules are transparent, deterministic, and easy to update in one place.
   - Low-information profiles produce low-confidence scores (not false certainty).
   - This module never modifies memory, never touches the DOM, never fires events.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Internal helpers
     ──────────────────────────────────────────────────────── */

  /** Discharges that unlock most VA benefits. */
  var HONORABLE_TYPES = ['Honorable', 'General', 'Medical'];

  /** Returns true if the given discharge status qualifies for most VA benefits. */
  function _honorable(discharge) {
    if (!discharge) return false;
    for (var i = 0; i < HONORABLE_TYPES.length; i++) {
      if (discharge === HONORABLE_TYPES[i]) return true;
    }
    return false;
  }

  /** Returns true if at least one key scoring field is present. */
  function _hasSignal(profile) {
    if (!profile) return false;
    return !!(
      profile.dischargeStatus ||
      profile.branch          ||
      (profile.vaRating !== null && profile.vaRating !== undefined) ||
      profile.state           ||
      profile.employmentStatus
    );
  }

  /** Clamp value to [0, max]. */
  function _clamp(val, max) {
    return Math.min(max, Math.max(0, Math.round(val * 100) / 100));
  }

  /** Safe lowercase check for goal/mission text. */
  function _goalContains(profile, terms) {
    var text = ((profile.currentGoals || '') + ' ' + (profile.activeMissions || '')).toLowerCase();
    for (var i = 0; i < terms.length; i++) {
      if (text.indexOf(terms[i]) !== -1) return true;
    }
    return false;
  }


  /* ────────────────────────────────────────────────────────
     Scoring Config
     Each entry defines one benefit category.
       id:     machine key on the returned scores map
       label:  human-readable name used in prompt injection
       base:   starting relevance for a completely unknown profile
       max:    ceiling (never 1.0 — no false certainty)
       boosts: array of { desc, test(profile)→bool, amount }
               Applied in order; amounts are additive.
     ──────────────────────────────────────────────────────── */
  var SCORING_CONFIG = [

    {
      id: 'VA_DISABILITY',
      label: 'VA Disability Claim',
      base: 0.10,
      max:  0.90,
      boosts: [
        {
          desc: 'known veteran (branch, discharge, or era provided)',
          test: function(p) { return !!(p.branch || p.dischargeStatus || p.serviceEra); },
          amount: 0.15
        },
        {
          desc: 'honorable, general, or medical discharge (eligible to file)',
          test: function(p) { return _honorable(p.dischargeStatus); },
          amount: 0.25
        },
        {
          desc: 'existing VA rating above zero (may want to increase)',
          test: function(p) { return p.vaRating !== null && p.vaRating !== undefined && p.vaRating > 0; },
          amount: 0.35
        },
        {
          desc: 'VA rating is exactly zero (may be worth challenging)',
          test: function(p) { return p.vaRating === 0; },
          amount: 0.15
        },
        {
          desc: 'disability prevents employment',
          test: function(p) { return p.employmentStatus === 'disabled'; },
          amount: 0.15
        }
      ]
    },

    {
      id: 'VA_HEALTHCARE',
      label: 'VA Healthcare',
      base: 0.10,
      max:  0.88,
      boosts: [
        {
          desc: 'known veteran',
          test: function(p) { return !!(p.branch || p.dischargeStatus || p.serviceEra); },
          amount: 0.15
        },
        {
          desc: 'honorable discharge (near-universal VA healthcare eligibility)',
          test: function(p) { return _honorable(p.dischargeStatus); },
          amount: 0.35
        },
        {
          desc: 'high VA rating (priority group 1 or 2)',
          test: function(p) { return p.vaRating !== null && p.vaRating !== undefined && p.vaRating >= 50; },
          amount: 0.25
        },
        {
          desc: 'VA rating present but under 50%',
          test: function(p) { return p.vaRating !== null && p.vaRating !== undefined && p.vaRating > 0 && p.vaRating < 50; },
          amount: 0.10
        }
      ]
    },

    {
      id: 'GI_BILL',
      label: 'GI Bill / Education',
      base: 0.05,
      max:  0.80,
      boosts: [
        {
          desc: 'known veteran',
          test: function(p) { return !!(p.branch || p.dischargeStatus || p.serviceEra); },
          amount: 0.10
        },
        {
          desc: 'honorable discharge (primary GI Bill eligibility gate)',
          test: function(p) { return _honorable(p.dischargeStatus); },
          amount: 0.20
        },
        {
          desc: 'military branch known (served, likely has some entitlement)',
          test: function(p) { return !!p.branch; },
          amount: 0.10
        },
        {
          desc: 'goals mention education',
          test: function(p) { return _goalContains(p, ['school', 'college', 'degree', 'educat', 'university', 'certif', 'learn']); },
          amount: 0.35
        }
      ]
    },

    {
      id: 'VR_E',
      label: 'Vocational Rehab (VR&E)',
      base: 0.05,
      max:  0.85,
      boosts: [
        {
          desc: 'known veteran',
          test: function(p) { return !!(p.branch || p.dischargeStatus || p.serviceEra); },
          amount: 0.10
        },
        {
          desc: 'VA rating at or above 10% (meets basic VR&E threshold)',
          test: function(p) { return p.vaRating !== null && p.vaRating !== undefined && p.vaRating >= 10; },
          amount: 0.45
        },
        {
          desc: 'VA rating present but below 10% (may still qualify via serious employment handicap)',
          test: function(p) { return p.vaRating !== null && p.vaRating !== undefined && p.vaRating > 0 && p.vaRating < 10; },
          amount: 0.20
        },
        {
          desc: 'disability prevents employment',
          test: function(p) { return p.employmentStatus === 'disabled'; },
          amount: 0.20
        },
        {
          desc: 'actively seeking employment',
          test: function(p) { return p.employmentStatus === 'unemployed' || p.employmentStatus === 'job searching'; },
          amount: 0.10
        }
      ]
    },

    {
      id: 'STATE_BENEFITS',
      label: 'State Veterans Benefits',
      base: 0.05,
      max:  0.80,
      boosts: [
        {
          desc: 'known veteran',
          test: function(p) { return !!(p.branch || p.dischargeStatus || p.serviceEra); },
          amount: 0.10
        },
        {
          desc: 'state known (state-specific programs now determinable)',
          test: function(p) { return !!p.state; },
          amount: 0.50
        },
        {
          desc: 'honorable discharge (unlocks most state benefit programs)',
          test: function(p) { return _honorable(p.dischargeStatus); },
          amount: 0.15
        }
      ]
    },

    {
      id: 'HOUSING_SUPPORT',
      label: 'VA Housing / Home Loan',
      base: 0.05,
      max:  0.80,
      boosts: [
        {
          desc: 'known veteran',
          test: function(p) { return !!(p.branch || p.dischargeStatus || p.serviceEra); },
          amount: 0.10
        },
        {
          desc: 'honorable discharge (VA Home Loan Certificate of Eligibility)',
          test: function(p) { return _honorable(p.dischargeStatus); },
          amount: 0.20
        },
        {
          desc: 'goals mention housing or mortgage',
          test: function(p) { return _goalContains(p, ['house', 'home', 'mortgage', 'housing', 'apartment', 'rent', 'buy']); },
          amount: 0.40
        }
      ]
    },

    {
      id: 'EMPLOYMENT_SUPPORT',
      label: 'Employment Support',
      base: 0.05,
      max:  0.80,
      boosts: [
        {
          desc: 'known veteran',
          test: function(p) { return !!(p.branch || p.dischargeStatus || p.serviceEra); },
          amount: 0.10
        },
        {
          desc: 'currently unemployed or job searching (primary trigger)',
          test: function(p) { return p.employmentStatus === 'unemployed' || p.employmentStatus === 'job searching'; },
          amount: 0.50
        },
        {
          desc: 'disability prevents employment',
          test: function(p) { return p.employmentStatus === 'disabled'; },
          amount: 0.30
        },
        {
          desc: 'recently retired / transitioning',
          test: function(p) { return p.employmentStatus === 'retired'; },
          amount: 0.20
        },
        {
          desc: 'goals mention employment or career',
          test: function(p) { return _goalContains(p, ['job', 'work', 'career', 'employ', 'resume', 'hire', 'hiring']); },
          amount: 0.25
        }
      ]
    }

  ]; // end SCORING_CONFIG


  /* ────────────────────────────────────────────────────────
     EligibilityEngine — public API
     ──────────────────────────────────────────────────────── */

  var EligibilityEngine = {

    /**
     * Score all benefit categories against the given profile.
     *
     * @param {Object} profile — veteran memory profile snapshot
     * @returns {Object} Map of { categoryId: score (0.0–max) }
     *   Example: { VA_DISABILITY: 0.85, VA_HEALTHCARE: 0.60, ... }
     */
    score: function(profile) {
      var p = profile || {};
      var scores = {};

      for (var i = 0; i < SCORING_CONFIG.length; i++) {
        var cat = SCORING_CONFIG[i];
        var val = cat.base;

        for (var j = 0; j < cat.boosts.length; j++) {
          var boost = cat.boosts[j];
          if (boost.test(p)) {
            val += boost.amount;
          }
        }

        scores[cat.id] = _clamp(val, cat.max);
      }

      return scores;
    },


    /**
     * Returns true if the profile has at least one field that produces
     * meaningful differentiation in scores.  Empty or all-null profiles
     * would yield only base values — not worth injecting.
     *
     * @param {Object} profile
     * @returns {boolean}
     */
    hasUsefulSignal: function(profile) {
      return _hasSignal(profile);
    },


    /**
     * Build a compact, prompt-safe eligibility summary string.
     * Only includes categories above the given confidence threshold.
     * Returns null when nothing is above threshold (caller should omit injection).
     *
     * @param {Object}  scores    — output of EligibilityEngine.score()
     * @param {number}  threshold — minimum score to include (default 0.5)
     * @returns {string|null}
     *
     * Example output:
     *   "## ELIGIBILITY CONTEXT\n- High relevance: VA Healthcare, VA Disability Claim\n- Moderate: State Benefits"
     */
    buildSummary: function(scores, threshold) {
      var floor = (typeof threshold === 'number') ? threshold : 0.50;
      var high = [];
      var moderate = [];

      // Build label map from SCORING_CONFIG for display
      var labelMap = {};
      for (var i = 0; i < SCORING_CONFIG.length; i++) {
        labelMap[SCORING_CONFIG[i].id] = SCORING_CONFIG[i].label;
      }

      // Sort by score descending and bucket into high / moderate
      var ids = Object.keys(scores).sort(function(a, b) { return scores[b] - scores[a]; });

      for (var j = 0; j < ids.length; j++) {
        var id  = ids[j];
        var val = scores[id];
        var lbl = labelMap[id] || id;
        if (val >= 0.72) {
          high.push(lbl);
        } else if (val >= floor) {
          moderate.push(lbl);
        }
      }

      if (high.length === 0 && moderate.length === 0) return null;

      var lines = ['## ELIGIBILITY CONTEXT'];
      if (high.length > 0)     lines.push('- High relevance: '     + high.join(', '));
      if (moderate.length > 0) lines.push('- Moderate relevance: ' + moderate.join(', '));
      lines.push('- Note: Scores are relevance estimates only — not legal determinations.');

      return lines.join('\n');
    },


    /**
     * Expose the scoring config for inspection / testing.
     * Read-only — never mutate this in production code.
     */
    SCORING_CONFIG: SCORING_CONFIG

  };


  window.AIOS = window.AIOS || {};
  window.AIOS.Eligibility = EligibilityEngine;

})();
