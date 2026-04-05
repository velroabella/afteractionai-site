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
       → { category, label, scope, destination, actionText, weight }[]
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
    { category: 'legal',                   weight: 30,  condition: function(p) { return p.dischargeStatus === 'Other Than Honorable' || p.dischargeStatus === 'Bad Conduct'; } }
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

  /**
   * Phase 46 Part 3: Build a query string from the veteran profile so that
   * destination pages can auto-filter/pre-populate based on known data.
   *
   * Only includes params that are non-null and meaningful.
   * Never includes PII (name, email, SSN).
   *
   * @param {Object} p  — AIOS.Memory.getProfile() output
   * @param {string} categoryId
   * @returns {string}  — e.g. "?state=FL&rating=70&branch=Army" or ""
   */
  function _buildDeepLinkParams(p, categoryId) {
    if (!p) return '';
    var parts = [];

    // State is universally useful for benefit lookups
    if (p.state) parts.push('state=' + encodeURIComponent(p.state));

    // VA rating — numeric band relevant for compensation/TDIU/healthcare priority
    if (p.vaRating !== null && p.vaRating !== undefined) {
      parts.push('rating=' + encodeURIComponent(String(p.vaRating)));
    }

    // Branch — affects benefit eligibility on some pages
    if (p.branch) parts.push('branch=' + encodeURIComponent(p.branch));

    // Discharge status — relevant for education, housing, legal
    if (p.dischargeStatus && categoryId !== 'crisis_support') {
      parts.push('discharge=' + encodeURIComponent(p.dischargeStatus));
    }

    // Dependents flag — family/survivor pages
    if (categoryId === 'family_survivor' && p.dependents && p.dependents !== 'no dependents') {
      parts.push('dependents=1');
    }

    // Employment status — employment resources
    if (categoryId === 'employment' && p.employmentStatus) {
      parts.push('status=' + encodeURIComponent(p.employmentStatus));
    }

    // Mission type hint — helps destination pages surface the right content
    if (p.missionType) parts.push('mission=' + encodeURIComponent(p.missionType));

    return parts.length > 0 ? '?' + parts.join('&') : '';
  }

  /**
   * Phase 55: Map a resource-mapper category ID to the matching
   * resources.html filter category value. Returns null if no direct mapping.
   */
  function _mapToResourceCategory(catId) {
    var map = {
      'employment':              'employment',
      'education':               'education',
      'healthcare':              'medical',
      'housing':                 'housing',
      'legal':                   'legal',
      'family_survivor':         'community',
      'disability_compensation': 'benefits',
      'state_benefits':          'benefits'
    };
    return map[catId] || null;
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
     *   destination {string}  — relative URL to best internal page
     *   actionText  {string}  — short CTA phrase
     *   weight      {number}  — priority score (higher = more urgent)
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
              // Phase 46 Part 3: Build deep-link destination with profile query params
              var _baseDest = cat.destination || 'index.html?resume=1';
              var _deepParams = '';
              // Only append params to real internal pages (not AI-guided flows)
              if (_baseDest.indexOf('?resume=1') === -1) {
                _deepParams = _buildDeepLinkParams(p, cat.id);
                // Phase 55: Add category filter param for resources.html routing
                if (_baseDest === 'resources.html') {
                  var _resCat = _mapToResourceCategory(cat.id);
                  if (_resCat) {
                    _deepParams = _deepParams
                      ? _deepParams + '&category=' + encodeURIComponent(_resCat)
                      : '?category=' + encodeURIComponent(_resCat);
                  }
                }
              }
              results.push({
                category:    cat.id,
                label:       cat.label,
                scope:       cat.scope,
                destination: _baseDest,
                deepLink:    _baseDest + _deepParams,
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
