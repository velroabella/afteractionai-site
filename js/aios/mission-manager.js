/* ══════════════════════════════════════════════════════════
   AIOS — Mission Manager  (Phase 10)
   Tracks the current mission (what the veteran is trying
   to accomplish), its phases, and completion state.
   A mission is a multi-turn goal like "file a VA claim"
   or "find housing assistance in Florida".

   Detection functions only fire on explicit or very strong
   intent signals. No data is fabricated.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Mission type definitions
     Each entry defines: display name, detection keywords,
     and the default starting step + next step for a new mission.
     ──────────────────────────────────────────────────────── */

  var MISSION_TYPES = {

    disability_claim: {
      name: 'VA Disability Claim',
      keywords: [
        'disability claim', 'file a claim', 'file my claim', 'open a claim',
        'file for disability', 'va claim', 'c&p exam', 'comp and pen',
        'nexus letter', 'supplemental claim', 'higher-level review',
        'rating decision', 'increase my rating', 'claim appeal',
        'board of veterans appeals', 'bva appeal', 'claim status',
        'service connection', 'service connected', 'presumptive condition',
        'buddy statement', 'dbq form'
      ],
      defaultCurrentStep: 'Identify conditions to claim',
      defaultNextStep:    'Gather service records and buddy statements'
    },

    education_path: {
      name: 'Education Benefits',
      keywords: [
        'gi bill', 'education benefit', 'education benefits',
        'chapter 33', 'chapter 30', 'chapter 31',
        'post-9/11 gi bill', 'montgomery gi bill',
        'yellow ribbon', 'tuition assistance', 'college benefit',
        'school benefit', 'stem scholarship', 'go back to school',
        'use my gi bill', 'vr&e', 'vocational rehabilitation',
        'voc rehab', 'education path', 'degree program'
      ],
      defaultCurrentStep: 'Confirm GI Bill eligibility and remaining entitlement',
      defaultNextStep:    'Select school and submit VA Form 22-1990'
    },

    state_benefits_search: {
      name: 'State Veterans Benefits',
      keywords: [
        'state benefit', 'state veteran benefit', 'state veterans benefit',
        'property tax exemption', 'in-state tuition', 'license reciprocity',
        'state bonus', 'state program', 'state va office',
        'state veteran program', 'state veteran service',
        'county veteran', 'local benefit'
      ],
      defaultCurrentStep: 'Identify home state and eligibility criteria',
      defaultNextStep:    'Contact State Veterans Affairs office'
    },

    housing_path: {
      name: 'Housing Assistance',
      keywords: [
        'va home loan', 'va loan', 'hud-vash', 'vash voucher',
        'transitional housing', 'veteran housing', 'homeless veteran',
        'housing assistance', 'housing benefit', 'home loan',
        'va mortgage', 'buy a house', 'rental assistance',
        'gpd program', 'grant per diem', 'ssvf'
      ],
      defaultCurrentStep: 'Determine housing need type (purchase, rental, emergency)',
      defaultNextStep:    'Obtain Certificate of Eligibility or contact local VA'
    },

    employment_transition: {
      name: 'Employment Transition',
      keywords: [
        'employment assistance', 'job transition', 'career transition',
        'resume help', 'tap program', 'veteran employment',
        'dod skillbridge', 'skillbridge', 'hire vets',
        'vocational training', 'apprenticeship', 'back to work',
        'find a job', 'employment benefit', 'workforce development',
        'career counseling', 'job placement', 'feds hire vets',
        'veteran hiring', 'veteran jobs', 'translate military skills'
      ],
      defaultCurrentStep: 'Assess transferable skills and target career field',
      defaultNextStep:    'Update resume and connect with American Job Center'
    }

  };

  /* ────────────────────────────────────────────────────────
     Valid status values
     ──────────────────────────────────────────────────────── */

  var VALID_STATUSES = { 'active': 1, 'paused': 1, 'complete': 1, 'blocked': 1 };


  /* ────────────────────────────────────────────────────────
     Private helpers
     ──────────────────────────────────────────────────────── */

  /**
   * Returns true if a value is non-null, non-empty, and not an
   * "unknown" placeholder. Prevents clobbering good data with nulls.
   */
  function isValidMissionValue(val) {
    if (val === null || val === undefined) return false;
    if (typeof val === 'string' && !val.trim()) return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  }

  /**
   * Check if lowercased text contains a phrase from the list.
   * Returns the matched phrase, or null.
   */
  function matchPhrase(text, phrases) {
    for (var i = 0; i < phrases.length; i++) {
      if (text.indexOf(phrases[i]) !== -1) return phrases[i];
    }
    return null;
  }

  /**
   * Deduplicated array merge.
   */
  function mergeArrays(a, b) {
    var seen = {};
    var result = [];
    var combined = (a || []).concat(b || []);
    for (var i = 0; i < combined.length; i++) {
      var key = String(combined[i]);
      if (!seen[key]) { seen[key] = 1; result.push(combined[i]); }
    }
    return result;
  }


  /* ────────────────────────────────────────────────────────
     MissionManager
     ──────────────────────────────────────────────────────── */

  var MissionManager = {

    /** Current active mission (or null) */
    current: null,


    /* ── Phase 10: Detection + Create + Update + Summary ── */

    /**
     * Scan user input for explicit mission intent.
     * Returns a mission seed object, or null if no strong intent detected.
     * Only fires on high-confidence, multi-word keyword matches — never
     * on ambiguous single words.
     *
     * @param {string} userMessage  - Raw user input.
     * @param {Object} [context]    - Optional context (reserved for future use).
     * @returns {{ type: string, matched: string }|null}
     */
    detectMissionFromInput: function(userMessage, context) {
      if (typeof userMessage !== 'string' || !userMessage.trim()) return null;

      var text = userMessage.toLowerCase();

      for (var type in MISSION_TYPES) {
        if (!MISSION_TYPES.hasOwnProperty(type)) continue;
        var matched = matchPhrase(text, MISSION_TYPES[type].keywords);
        if (matched) {
          return { type: type, matched: matched };
        }
      }

      return null;
    },


    /**
     * Create a fully normalized mission object from a type and optional details.
     * All required fields are guaranteed present — defaults are used for any
     * fields not supplied in details.
     *
     * @param {string} missionType  - One of the MISSION_TYPES keys.
     * @param {Object} [details]    - Partial mission data to seed the object.
     * @returns {Object|null} Normalized mission, or null if type is unknown.
     */
    createMission: function(missionType, details) {
      var typeDef = MISSION_TYPES[missionType];
      if (!typeDef) return null;

      var d = details || {};

      return {
        type:        missionType,
        name:        typeDef.name,
        status:      (d.status && VALID_STATUSES[d.status]) ? d.status : 'active',
        currentStep: d.currentStep || typeDef.defaultCurrentStep,
        nextStep:    d.nextStep    || typeDef.defaultNextStep,
        blockers:    Array.isArray(d.blockers) ? d.blockers.slice() : [],
        startedAt:   d.startedAt  || Date.now(),
        data:        (d.data && typeof d.data === 'object') ? d.data : {}
      };
    },


    /**
     * Safely merge updates into an existing mission object.
     * Rules:
     *   - Scalar fields: update wins only if value is valid (non-null, non-empty).
     *   - status: only accepted if it is a known valid status value.
     *   - blockers: arrays are deduplicated-merged, not replaced.
     *   - data: shallow-merged key by key.
     *   - startedAt, type, name: never overwritten once set.
     *
     * @param {Object} existingMission - Current mission state.
     * @param {Object} updates         - Fields to apply.
     * @returns {Object} New merged mission object (existingMission is not mutated).
     */
    updateMission: function(existingMission, updates) {
      if (!existingMission || typeof existingMission !== 'object') return existingMission;

      var upd = updates || {};
      var merged = {};

      // Copy all existing keys
      var k;
      for (k in existingMission) {
        if (existingMission.hasOwnProperty(k)) merged[k] = existingMission[k];
      }

      // currentStep — update if valid
      if (isValidMissionValue(upd.currentStep)) merged.currentStep = upd.currentStep;

      // nextStep — update if valid
      if (isValidMissionValue(upd.nextStep)) merged.nextStep = upd.nextStep;

      // status — update only if it is a known valid status
      if (upd.status && VALID_STATUSES[upd.status]) merged.status = upd.status;

      // blockers — deduplicated array merge
      if (Array.isArray(upd.blockers) && upd.blockers.length > 0) {
        merged.blockers = mergeArrays(merged.blockers, upd.blockers);
      }

      // data — shallow merge key by key
      if (upd.data && typeof upd.data === 'object') {
        merged.data = merged.data || {};
        var dk;
        for (dk in upd.data) {
          if (upd.data.hasOwnProperty(dk) && isValidMissionValue(upd.data[dk])) {
            merged.data[dk] = upd.data[dk];
          }
        }
      }

      // type, name, startedAt — immutable once set
      return merged;
    },


    /**
     * Build a short, prompt-safe single-line summary of a mission for
     * AI context injection. Confirmed facts only — no padding.
     *
     * @param {Object} mission - A normalized mission object.
     * @returns {string} Summary string, or empty string if no data.
     */
    buildMissionSummary: function(mission) {
      if (!mission || typeof mission !== 'object') return '';
      if (!mission.type) return '';

      var parts = [];

      parts.push('Mission: ' + (mission.name || mission.type));
      parts.push('Status: '  + (mission.status || 'unknown'));

      if (isValidMissionValue(mission.currentStep)) {
        parts.push('Step: ' + mission.currentStep);
      }
      if (isValidMissionValue(mission.nextStep)) {
        parts.push('Next: ' + mission.nextStep);
      }

      var blockers = mission.blockers;
      if (Array.isArray(blockers) && blockers.length > 0) {
        parts.push('Blockers: ' + blockers.join('; '));
      } else {
        parts.push('Blockers: none');
      }

      return parts.join(' | ') + '.';
    },


    /* ── Original phase-tracking methods (preserved) ────── */

    /**
     * Start a new mission.
     * @param {Object} mission - { id, name, phases, skillId }
     */
    start: function(mission) {
      MissionManager.current = {
        id: mission.id,
        name: mission.name,
        skillId: mission.skillId || null,
        phases: mission.phases || [],
        currentPhase: 0,
        status: 'active',
        startedAt: Date.now(),
        data: {}
      };
    },

    /**
     * Advance to the next phase of the current mission.
     * @returns {Object|null} The new phase, or null if mission complete
     */
    advance: function() {
      if (!MissionManager.current) return null;
      var m = MissionManager.current;
      m.currentPhase++;
      if (m.currentPhase >= m.phases.length) {
        m.status = 'complete';
        return null;
      }
      return m.phases[m.currentPhase];
    },

    /**
     * Get the current phase descriptor.
     * @returns {Object|null}
     */
    getPhase: function() {
      if (!MissionManager.current) return null;
      return MissionManager.current.phases[MissionManager.current.currentPhase] || null;
    },

    /**
     * Store data collected during this mission.
     * @param {string} key
     * @param {*} value
     */
    setData: function(key, value) {
      if (MissionManager.current) {
        MissionManager.current.data[key] = value;
      }
    },

    /**
     * End the current mission.
     */
    end: function() {
      MissionManager.current = null;
    },

    /**
     * Check if a mission is active.
     * @returns {boolean}
     */
    isActive: function() {
      return MissionManager.current !== null && MissionManager.current.status === 'active';
    }

  };


  window.AIOS = window.AIOS || {};
  window.AIOS.Mission = MissionManager;

})();
