/* ══════════════════════════════════════════════════════════
   AIOS — Resource Mapper  (Phase 42 Foundation / Phase 44 Links)

   Maps veteran profile fields → resource categories.
   Provides a structured lookup that the AI layer and
   dashboard can use to surface relevant federal, state,
   local, and online resources.

   Each category carries:
     id          — machine-readable identifier
     label       — human-readable display name
     scope       — 'federal' | 'state' | 'online'
     destination — best internal page URL (relative)
     actionText  — short verb phrase for CTAs ("Explore VA healthcare")
     triggers    — function(profile) → boolean

   Public API:
     window.AIOS.Resources.getCategories(profile) → string[]
     window.AIOS.Resources.getPriority(profile)
       → { category, label, scope, actionText, weight }[]
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ── Resource category definitions ────────────────────── */
  var CATEGORIES = {
    DISABILITY_COMPENSATION: {
      id:          'disability_compensation',
      label:       'VA Disability Compensation',
      scope:       'federal',
      destination: 'index.html?resume=1',   // no dedicated internal page; AI-guided
      actionText:  'Start or continue your VA claim',
      triggers: function(p) {
        return p.dischargeStatus === 'Honorable' ||
               p.dischargeStatus === 'General'  ||
               p.vaRating !== null;
      }
    },
    HEALTHCARE: {
      id:          'healthcare',
      label:       'VA Healthcare Enrollment',
      scope:       'federal',
      destination: 'medical-help.html',
      actionText:  'Explore VA healthcare options',
      triggers: function(p) {
        return p.dischargeStatus && p.dischargeStatus !== 'Dishonorable';
      }
    },
    EDUCATION: {
      id:          'education',
      label:       'Education & Training Benefits',
      scope:       'federal',
      destination: 'education.html',
      actionText:  'Explore GI Bill and education benefits',
      triggers: function(p) {
        return p.dischargeStatus === 'Honorable' || !!p.serviceEra;
      }
    },
    EMPLOYMENT: {
      id:          'employment',
      label:       'Employment & Career Transition',
      scope:       'federal',
      destination: 'resources.html',        // partner orgs include employment programs
      actionText:  'Find career and employment resources',
      triggers: function(p) {
        return p.employmentStatus === 'unemployed'    ||
               p.employmentStatus === 'job searching' ||
               (p.currentGoals && /job|career|work|employ/i.test(p.currentGoals));
      }
    },
    HOUSING: {
      id:          'housing',
      label:       'Housing & VA Home Loan',
      scope:       'federal',
      destination: 'grants-scholarships.html',  // covers housing grants + VA home loan links
      actionText:  'View housing assistance and home loan options',
      triggers: function(p) {
        return p.dischargeStatus === 'Honorable' ||
               p.dischargeStatus === 'General'  ||
               (p.currentGoals && /hous|home|rent|mortgage/i.test(p.currentGoals));
      }
    },
    STATE_BENEFITS: {
      id:          'state_benefits',
      label:       'State Veterans Benefits',
      scope:       'state',
      destination: 'state-benefits.html',
      actionText:  'View your state-specific veteran benefits',
      triggers: function(p) { return !!p.state; }
    },
    CRISIS_SUPPORT: {
      id:          'crisis_support',
      label:       'Crisis & Mental Health Support',
      scope:       'federal',
      destination: 'hotlines-escalation.html',
      actionText:  'Get immediate crisis and mental health support',
      triggers: function() { return true; } // Always available
    },
    FAMILY_SURVIVOR: {
      id:          'family_survivor',
      label:       'Family & Survivor Benefits',
      scope:       'federal',
      destination: 'families-support.html',
      actionText:  'Explore benefits for family and survivors',
      triggers: function(p) {
        return p.dependents && p.dependents !== 'no dependents';
      }
    },
    LEGAL: {
      id:          'legal',
      label:       'Legal Assistance & Document Prep',
      scope:       'federal',
      destination: 'document-templates.html',
      actionText:  'Access free legal document templates',
      triggers: function(p) {
        return (p.currentGoals && /legal|power of attorney|will|claim|appeal/i.test(p.currentGoals)) ||
               p.dischargeStatus === 'Other Than Honorable' ||
               p.dischargeStatus === 'Bad Conduct';
      }
    },
    TDIU: {
      id:          'tdiu',
      label:       'Total Disability / Individual Unemployability',
      scope:       'federal',
      destination: 'index.html?resume=1',   // requires AI-guided conversation
      actionText:  'Explore TDIU eligibility with your AI navigator',
      triggers: function(p) {
        return p.vaRating !== null && p.vaRating >= 60 &&
               (p.employmentStatus === 'unemployed' || p.employmentStatus === 'disabled');
      }
    },
    OUTDOOR_RECREATION: {
      id:          'outdoor_recreation',
      label:       'Outdoor Recreation & Discounts',
      scope:       'mixed',
      destination: 'outdoor-recreation.html',
      actionText:  'Explore free park passes, hunting licenses, and outdoor discounts',
      triggers: function(p) {
        return true;  // Available to all veterans
      }
    }
  };

  /* ── Priority scoring ─────────────────────────────────── */
  var PRIORITY_RULES = [
    { category: 'crisis_support',          weight: 100, condition: function()  { return false; } }, // Manual escalation only
    { category: 'disability_compensation', weight: 90,  condition: function(p) { return p.vaRating === null && !!p.dischargeStatus; } },
    { category: 'tdiu',                    weight: 85,  condition: function(p) { return p.vaRating >= 60 && (p.employmentStatus === 'unemployed' || p.employmentStatus === 'disabled'); } },
    { category: 'healthcare',              weight: 80,  condition: function(p) { return !!p.dischargeStatus && p.vaRating === null; } },
    { category: 'employment',              weight: 70,  condition: function(p) { return p.employmentStatus === 'unemployed' || p.employmentStatus === 'job searching'; } },
    { category: 'housing',                 weight: 60,  condition: function(p) { return !!(p.currentGoals && /hous|home|rent/i.test(p.currentGoals)); } },
    { category: 'education',               weight: 50,  condition: function(p) { return !!(p.currentGoals && /school|degree|gi bill|education|training/i.test(p.currentGoals)); } },
    { category: 'state_benefits',          weight: 40,  condition: function(p) { return !!p.state; } },
    { category: 'family_survivor',         weight: 35,  condition: function(p) { return !!(p.dependents && p.dependents !== 'no dependents'); } },
    { category: 'legal',                   weight: 30,  condition: function(p) { return p.dischargeStatus === 'Other Than Honorable' || p.dischargeStatus === 'Bad Conduct'; } },
    { category: 'outdoor_recreation',       weight: 20,  condition: function(p) { return true; } }
  ];

  /* ── Internal helpers ─────────────────────────────────── */

  /** Look up a CATEGORIES entry by its id string. */
  function _getCatById(id) {
    var keys = Object.keys(CATEGORIES);
    for (var k = 0; k < keys.length; k++) {
      if (CATEGORIES[keys[k]].id === id) return CATEGORIES[keys[k]];
    }
    return null;
  }

  /* ── Public API ───────────────────────────────────────── */

  var ResourceMapper = {

    /**
     * Get all resource categories that apply to this veteran's profile.
     * @param {Object} profile — AIOS.Memory.getProfile() output
     * @returns {string[]} List of matching category IDs
     */
    getCategories: function(profile) {
      var p = profile || {};
      var matches = [];
      var keys = Object.keys(CATEGORIES);
      for (var i = 0; i < keys.length; i++) {
        var cat = CATEGORIES[keys[i]];
        try {
          if (cat.triggers(p)) matches.push(cat.id);
        } catch(e) { /* skip broken trigger */ }
      }
      return matches;
    },

    /**
     * Get prioritized resource recommendations.
     * Returns an ordered list of enriched resource objects, highest weight first.
     *
     * Each object contains:
     *   category    {string}  — category id
     *   label       {string}  — display name
     *   scope       {string}  — 'federal' | 'state' | 'online'
     *   actionText  {string}  — short CTA phrase
     *   weight      {number}  — priority score (higher = more urgent)
     *
     * Navigation/routing is handled by resource-matcher.js openResourcePage(),
     * which reads canonical destinations from ISSUE_TO_RESOURCES in action-engine.js.
     *
     * @param {Object} profile — AIOS.Memory.getProfile() output
     * @returns {Array}
     */
    getPriority: function(profile) {
      var p = profile || {};
      var results = [];
      for (var i = 0; i < PRIORITY_RULES.length; i++) {
        var rule = PRIORITY_RULES[i];
        try {
          if (rule.condition(p)) {
            var cat = _getCatById(rule.category);
            if (cat) {
              results.push({
                category:    cat.id,
                label:       cat.label,
                scope:       cat.scope,
                actionText:  cat.actionText  || 'Learn more',
                weight:      rule.weight
              });
            }
          }
        } catch(e) { /* skip */ }
      }
      results.sort(function(a, b) { return b.weight - a.weight; });
      return results;
    },

    /** Expose category definitions for external use. */
    CATEGORIES: CATEGORIES
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Resources = ResourceMapper;

})();
