/* ══════════════════════════════════════════════════════════
   AIOS — Memory Manager  (Phase 9)
   Tracks veteran profile data, session facts, and
   cross-session persistent memory (via Supabase).

   Extraction functions extract ONLY explicit, high-confidence
   facts from user input. No raw chat logs are stored.
   No data is fabricated.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Extraction constants
     ──────────────────────────────────────────────────────── */

  var MILITARY_BRANCHES = [
    'space force', 'marine corps', 'marines', 'coast guard',
    'national guard', 'army reserve', 'navy reserve',
    'marine reserve', 'air force reserve', 'coast guard reserve',
    'air force', 'army', 'navy'
  ];

  var DISCHARGE_TYPES = [
    { label: 'Honorable',            patterns: [/\bhonor(?:able)?\s+discharge\b/i, /\bhonorably\s+(?:discharged|separated)\b/i] },
    { label: 'General',              patterns: [/\bgeneral\s+discharge\b/i, /\bunder\s+honorable\s+conditions\b/i] },
    { label: 'Other Than Honorable', patterns: [/\both\s+discharge\b/i, /\bother\s+than\s+honorable\b/i] },
    { label: 'Bad Conduct',          patterns: [/\bbad\s+conduct\b/i, /\bbcd\b/i] },
    { label: 'Dishonorable',         patterns: [/\bdishonorable\s+discharge\b/i, /\bdishonorably\s+discharged\b/i] },
    { label: 'Medical',              patterns: [/\bmedical\s+discharge\b/i, /\bmedically\s+(?:separated|discharged|retired)\b/i] }
  ];

  var EMPLOYMENT_PATTERNS = [
    { label: 'employed',       patterns: [/\b(?:i\s+am|i'm|currently)\s+(?:working|employed)\b/i, /\bhave\s+a\s+job\b/i, /\b(?:full|part)[- ]time\s+(?:work|job|employed)\b/i] },
    { label: 'unemployed',     patterns: [/\b(?:i\s+am|i'm|currently)\s+unemployed\b/i, /\bout\s+of\s+work\b/i, /\bnot\s+(?:working|employed)\b/i] },
    { label: 'job searching',  patterns: [/\blooking\s+for\s+(?:a\s+)?(?:work|job|employment)\b/i, /\bjob\s+search(?:ing)?\b/i, /\bapplying\s+for\s+jobs\b/i] },
    { label: 'retired',        patterns: [/\b(?:i\s+am|i'm)\s+retired\b/i, /\bservice\s+(?:connected\s+)?retired\b/i] },
    { label: 'self-employed',  patterns: [/\bself[- ]employed\b/i, /\bown\s+(?:my\s+own\s+)?business\b/i, /\bfreelance\b/i] },
    { label: 'disabled',       patterns: [/\btoo\s+disabled\s+to\s+work\b/i, /\bdisability\s+prevents\s+(?:me\s+from\s+)?working\b/i] }
  ];

  // Phase 37: Service era labels — ordered most-specific first.
  // First match wins; single value per session.
  var ERA_PATTERNS = [
    { label: 'Gulf War',       rx: /\b(?:gulf\s+war|desert\s+storm|desert\s+shield|operation\s+desert)\b/i },
    { label: 'OEF',            rx: /\b(?:oef|operation\s+enduring\s+freedom|afghanistan\s+(?:war|deployment|tour|vet(?:eran)?))\b/i },
    { label: 'OIF',            rx: /\b(?:oif|operation\s+iraqi?\s+freedom|iraq(?:i)?\s+(?:war|deployment|tour))\b/i },
    { label: 'OND',            rx: /\b(?:ond|operation\s+new\s+dawn)\b/i },
    { label: 'OIR',            rx: /\b(?:oir|operation\s+inherent\s+resolve)\b/i },
    { label: 'Post-9/11',      rx: /\bpost[- ]9\/11\b/i },
    { label: 'GWOT',           rx: /\b(?:gwot|global\s+war\s+on\s+terror(?:ism)?)\b/i },
    { label: 'Vietnam',        rx: /\bvietnam(?:\s+(?:war|era|vet(?:eran)?))?/i },
    { label: 'Korea',          rx: /\b(?:korean?\s+(?:war|conflict|era)|i\s+served\s+in\s+korea)\b/i },
    { label: 'Cold War',       rx: /\bcold\s+war\b/i },
    { label: 'World War II',   rx: /\b(?:world\s+war\s+(?:2|ii|two)|ww2|wwii)\b/i }
  ];

  var US_STATES = {
    'alabama':1,'alaska':1,'arizona':1,'arkansas':1,'california':1,'colorado':1,
    'connecticut':1,'delaware':1,'florida':1,'georgia':1,'hawaii':1,'idaho':1,
    'illinois':1,'indiana':1,'iowa':1,'kansas':1,'kentucky':1,'louisiana':1,
    'maine':1,'maryland':1,'massachusetts':1,'michigan':1,'minnesota':1,
    'mississippi':1,'missouri':1,'montana':1,'nebraska':1,'nevada':1,
    'new hampshire':1,'new jersey':1,'new mexico':1,'new york':1,
    'north carolina':1,'north dakota':1,'ohio':1,'oklahoma':1,'oregon':1,
    'pennsylvania':1,'rhode island':1,'south carolina':1,'south dakota':1,
    'tennessee':1,'texas':1,'utah':1,'vermont':1,'virginia':1,'washington':1,
    'west virginia':1,'wisconsin':1,'wyoming':1,
    // Abbreviations
    'al':1,'ak':1,'az':1,'ar':1,'ca':1,'co':1,'ct':1,'de':1,'fl':1,'ga':1,
    'hi':1,'id':1,'il':1,'in':1,'ia':1,'ks':1,'ky':1,'la':1,'me':1,'md':1,
    'ma':1,'mi':1,'mn':1,'ms':1,'mo':1,'mt':1,'ne':1,'nv':1,'nh':1,'nj':1,
    'nm':1,'ny':1,'nc':1,'nd':1,'oh':1,'ok':1,'or':1,'pa':1,'ri':1,'sc':1,
    'sd':1,'tn':1,'tx':1,'ut':1,'vt':1,'va':1,'wa':1,'wv':1,'wi':1,'wy':1
  };

  // Values treated as "no data" — never written into memory
  var UNKNOWN_SIGNALS = { 'unknown':1,'not sure':1,'unsure':1,"don't know":1,'n/a':1,'none':1,'null':1,'':1 };

  /* ── Phase 30: Validation whitelists ────────────────────
     Used exclusively by _validateMemoryFields().
     Kept adjacent to their source constants for easy maintenance.
     ──────────────────────────────────────────────────────── */

  /**
   * Canonical branch values — exact toTitleCase() output of every
   * entry in MILITARY_BRANCHES.  Any value not in this set is rejected.
   */
  var VALID_BRANCHES = {
    'Army':1, 'Navy':1, 'Air Force':1, 'Marine Corps':1, 'Marines':1,
    'Coast Guard':1, 'Space Force':1, 'National Guard':1,
    'Army Reserve':1, 'Navy Reserve':1, 'Marine Reserve':1,
    'Air Force Reserve':1, 'Coast Guard Reserve':1
  };

  /**
   * Canonical discharge status labels — must match DISCHARGE_TYPES[*].label
   * exactly.  No partial matches allowed.
   */
  var VALID_DISCHARGE_STATUSES = {
    'Honorable':1, 'General':1, 'Other Than Honorable':1,
    'Bad Conduct':1, 'Dishonorable':1, 'Medical':1
  };

  /**
   * Canonical employment status labels — must match
   * EMPLOYMENT_PATTERNS[*].label exactly.
   */
  var VALID_EMPLOYMENT_STATUSES = {
    'employed':1, 'unemployed':1, 'job searching':1,
    'retired':1, 'self-employed':1, 'disabled':1
  };

  /** Minimum char length for free-text fields (currentGoals, activeMissions, serviceEra). */
  var MIN_TEXT_FIELD_LEN = 4;
  /** Maximum char length — mirrors the extractor's own cap. */
  var MAX_TEXT_FIELD_LEN = 120;


  /* ────────────────────────────────────────────────────────
     Private helpers
     ──────────────────────────────────────────────────────── */

  /**
   * Returns true if value is meaningful (non-null, non-empty, not an
   * "unknown" signal). Zero is allowed (0% rating is a real fact).
   */
  function isValidValue(val) {
    if (val === null || val === undefined) return false;
    if (val === 0) return true;
    if (typeof val === 'string' && UNKNOWN_SIGNALS[val.trim().toLowerCase()]) return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  }

  /** Test a string against an array of RegExp patterns. */
  function matchesAny(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].test(text)) return true;
    }
    return false;
  }

  /** Title-case a string. */
  function toTitleCase(str) {
    return str.replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  }

  /**
   * Validate extracted memory fields before they are merged into the profile.
   * Phase 30 — Memory Quality Filtering.
   *
   * Applies whitelists for structured fields, range checks for numeric fields,
   * length + content guards for free-text fields, and conflict detection where
   * multiple matches in the source input signal ambiguity.
   *
   * Only high-confidence, unambiguous values pass through to mergeMemory().
   * Dropped fields are logged: [AIOS][MEMORY] filtered: field(reason), ...
   *
   * Rules:
   *   branch           — whitelist (VALID_BRANCHES); conflict if > 1 branch in src
   *   dischargeStatus  — whitelist (VALID_DISCHARGE_STATUSES)
   *   state            — whitelist (US_STATES, lowercase key)
   *   vaRating         — integer in 0–100 inclusive
   *   employmentStatus — whitelist (VALID_EMPLOYMENT_STATUSES)
   *   serviceEra       — string ≥ MIN_TEXT_FIELD_LEN (future-proofing)
   *   currentGoals     — string 4–120 chars containing ≥ 1 letter
   *   activeMissions   — same rules as currentGoals
   *
   * @param  {Object} extracted   - Output of extractMemoryFromInput()
   * @param  {string} userMessage - Original raw input (for conflict detection)
   * @returns {Object} Filtered object — only validated fields included
   */
  function _validateMemoryFields(extracted, userMessage) {
    var valid   = {};
    var dropped = [];
    var src     = (typeof userMessage === 'string') ? userMessage : '';

    /* ── branch ──────────────────────────────────────────────
       Whitelist check + conflict detection.
       Conflict: multiple distinct branch names present in the
       source text → ambiguous (e.g. "my dad served in the Army,
       I was in the Navy").  Drop if > 1 branch found.          */
    if ('branch' in extracted) {
      var _brHits = 0;
      for (var _bi = 0; _bi < MILITARY_BRANCHES.length; _bi++) {
        var _brEsc = MILITARY_BRANCHES[_bi].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp('\\b' + _brEsc + '\\b', 'i').test(src)) _brHits++;
      }
      if (_brHits > 1) {
        dropped.push('branch(ambiguous)');
      } else if (VALID_BRANCHES[extracted.branch]) {
        valid.branch = extracted.branch;
      } else {
        dropped.push('branch(invalid)');
      }
    }

    /* ── dischargeStatus ─────────────────────────────────────
       Whitelist: must be one of the canonical discharge labels.  */
    if ('dischargeStatus' in extracted) {
      if (VALID_DISCHARGE_STATUSES[extracted.dischargeStatus]) {
        valid.dischargeStatus = extracted.dischargeStatus;
      } else {
        dropped.push('dischargeStatus(invalid)');
      }
    }

    /* ── state ───────────────────────────────────────────────
       Whitelist: confirm against US_STATES using lowercase key.
       The extractor already enforces this — re-validate for
       defense in depth.                                         */
    if ('state' in extracted) {
      var _stKey = (typeof extracted.state === 'string') ? extracted.state.toLowerCase() : '';
      if (US_STATES[_stKey]) {
        valid.state = extracted.state;
      } else {
        dropped.push('state(invalid)');
      }
    }

    /* ── vaRating ────────────────────────────────────────────
       Must be an integer in 0–100.  The extractor enforces this
       during parseInt, but re-validate and guard against floats. */
    if ('vaRating' in extracted) {
      var _rating = extracted.vaRating;
      if (typeof _rating === 'number' &&
          _rating >= 0 && _rating <= 100 &&
          Math.floor(_rating) === _rating) {
        valid.vaRating = _rating;
      } else {
        dropped.push('vaRating(out-of-range)');
      }
    }

    /* ── employmentStatus ────────────────────────────────────
       Whitelist: must be one of the canonical employment labels. */
    if ('employmentStatus' in extracted) {
      if (VALID_EMPLOYMENT_STATUSES[extracted.employmentStatus]) {
        valid.employmentStatus = extracted.employmentStatus;
      } else {
        dropped.push('employmentStatus(invalid)');
      }
    }

    /* ── serviceEra ──────────────────────────────────────────
       Require non-empty string ≥ 3 chars.
       Phase 37: minimum is 3 (not MIN_TEXT_FIELD_LEN=4) because
       canonical 3-char era codes like OEF, OIF, OND, OIR are
       fully valid; a 4-char floor would silently drop them.     */
    if ('serviceEra' in extracted) {
      var _era = (typeof extracted.serviceEra === 'string') ? extracted.serviceEra.trim() : '';
      if (_era.length >= 3) {
        valid.serviceEra = _era;
      } else {
        dropped.push('serviceEra(too-short)');
      }
    }

    /* ── currentGoals ────────────────────────────────────────
       Free-text: 4–120 chars, must contain ≥ 1 letter.
       The letter check rejects pure numbers, punctuation noise. */
    if ('currentGoals' in extracted) {
      var _goal = (typeof extracted.currentGoals === 'string') ? extracted.currentGoals.trim() : '';
      if (_goal.length >= MIN_TEXT_FIELD_LEN &&
          _goal.length <= MAX_TEXT_FIELD_LEN &&
          /[a-zA-Z]/.test(_goal)) {
        valid.currentGoals = _goal;
      } else {
        dropped.push('currentGoals(noise)');
      }
    }

    /* ── activeMissions ──────────────────────────────────────
       Same rules as currentGoals.                              */
    if ('activeMissions' in extracted) {
      var _msn = (typeof extracted.activeMissions === 'string') ? extracted.activeMissions.trim() : '';
      if (_msn.length >= MIN_TEXT_FIELD_LEN &&
          _msn.length <= MAX_TEXT_FIELD_LEN &&
          /[a-zA-Z]/.test(_msn)) {
        valid.activeMissions = _msn;
      } else {
        dropped.push('activeMissions(noise)');
      }
    }

    /* ── name ────────────────────────────────────────────────
       Phase 37. Basic string: 2–30 chars, ≥ 1 letter.
       Rejects single initials, pure numbers, and empty values.
       mergeMemory safe-merge means existing name is never
       overwritten by null — no special conflict guard needed.  */
    if ('name' in extracted) {
      var _nm = (typeof extracted.name === 'string') ? extracted.name.trim() : '';
      if (_nm.length >= 2 && _nm.length <= 30 && /[a-zA-Z]/.test(_nm)) {
        valid.name = _nm;
      } else {
        dropped.push('name(invalid)');
      }
    }

    /* ── mos ─────────────────────────────────────────────────
       Phase 37. Alphanumeric code: 2–8 chars, must contain
       at least one alphanumeric character.
       Covers Army MOS (11B, 68W), Air Force AFSC (1C7X1),
       Navy NEC (2514), and Marine MOS.                        */
    if ('mos' in extracted) {
      var _mos = (typeof extracted.mos === 'string') ? extracted.mos.trim() : '';
      if (_mos.length >= 2 && _mos.length <= 8 && /[a-zA-Z0-9]/.test(_mos)) {
        valid.mos = _mos;
      } else {
        dropped.push('mos(invalid)');
      }
    }

    /* ── dependents ──────────────────────────────────────────
       Phase 37. Short descriptive string: 2–50 chars, ≥ 1
       letter.  Stores one of the canonical dependents labels
       produced by the extractor.                              */
    if ('dependents' in extracted) {
      var _dep = (typeof extracted.dependents === 'string') ? extracted.dependents.trim() : '';
      if (_dep.length >= 2 && _dep.length <= 50 && /[a-zA-Z]/.test(_dep)) {
        valid.dependents = _dep;
      } else {
        dropped.push('dependents(invalid)');
      }
    }

    /* ── conditions ──────────────────────────────────────────
       Phase R4.6. Comma-separated condition labels: 2–120 chars,
       ≥ 1 letter. Produced by the conditions extractor.         */
    if ('conditions' in extracted) {
      var _cond = (typeof extracted.conditions === 'string') ? extracted.conditions.trim() : '';
      if (_cond.length >= 2 && _cond.length <= 120 && /[a-zA-Z]/.test(_cond)) {
        valid.conditions = _cond;
      } else {
        dropped.push('conditions(invalid)');
      }
    }

    /* ── Log any drops ───────────────────────────────────────*/
    if (dropped.length > 0) {
      console.log('[AIOS][MEMORY] filtered: ' + dropped.join(', '));
    }

    return valid;
  }


  /* ────────────────────────────────────────────────────────
     MemoryManager
     ──────────────────────────────────────────────────────── */

  var MemoryManager = {

    /** In-session veteran profile (built during conversation) */
    profile: {
      name:             null,
      branch:           null,
      serviceEra:       null,
      dischargeStatus:  null,
      vaRating:         null,
      state:            null,
      primaryNeed:      null,
      needs:            [],
      documents:        [],
      // Phase 9 additions
      employmentStatus: null,
      currentGoals:     null,
      activeMissions:   null,
      // Phase 37 additions
      mos:              null,
      dependents:       null,
      // Phase 42 additions — document extraction fields
      rank:             null,
      serviceEntryDate: null,
      separationDate:   null,
      conditions:       null
    },


    /* ── Basic get / set ────────────────────────────────── */

    /**
     * Update a profile field.
     * @param {string} key
     * @param {*} value
     */
    set: function(key, value) {
      MemoryManager.profile[key] = value;
    },

    /**
     * Get a profile field.
     * @param {string} key
     * @returns {*}
     */
    get: function(key) {
      return MemoryManager.profile[key];
    },

    /**
     * Get the full profile snapshot.
     * @returns {Object}
     */
    getProfile: function() {
      return Object.assign({}, MemoryManager.profile);
    },

    /**
     * Reset all in-session memory.
     */
    reset: function() {
      MemoryManager.profile = {
        name: null, branch: null, serviceEra: null,
        dischargeStatus: null, vaRating: null, state: null,
        primaryNeed: null, needs: [], documents: [],
        employmentStatus: null, currentGoals: null, activeMissions: null,
        mos: null, dependents: null,
        rank: null, serviceEntryDate: null, separationDate: null, conditions: null
      };
    },


    /* ── Persistence (Supabase — Phase 12) ──────────────── */

    /**
     * Persist the structured veteran profile to Supabase (authenticated users only).
     * Only stores the 8 allowed fields — no raw logs, no names, no verbose arrays.
     * No-ops gracefully for anonymous users or if AAAI.auth is unavailable.
     *
     * Allowed fields: branch, dischargeStatus, serviceEra, state,
     *                 employmentStatus, vaRating, currentGoals, activeMissions
     *
     * @returns {Promise}
     */
    save: function() {
      var PERSIST_FIELDS = [
        'branch', 'dischargeStatus', 'serviceEra', 'state',
        'employmentStatus', 'vaRating', 'currentGoals', 'activeMissions',
        'conditions'  // Phase R4.6
      ];

      // Build sanitized snapshot — only persist non-null structured fields
      var snapshot = {};
      for (var i = 0; i < PERSIST_FIELDS.length; i++) {
        var key = PERSIST_FIELDS[i];
        var val = MemoryManager.profile[key];
        if (val !== null && val !== undefined) snapshot[key] = val;
      }

      // Gate: skip if nothing to persist
      if (Object.keys(snapshot).length === 0) {
        return Promise.resolve({ skipped: 'no data to persist' });
      }

      // Gate: skip if not authenticated
      if (!window.AAAI || !window.AAAI.auth || !window.AAAI.auth.isLoggedIn()) {
        return Promise.resolve({ skipped: 'not authenticated' });
      }

      // Gate: skip if saveAIOSMemory not wired yet
      if (typeof window.AAAI.auth.saveAIOSMemory !== 'function') {
        return Promise.resolve({ skipped: 'saveAIOSMemory not available' });
      }

      return window.AAAI.auth.saveAIOSMemory(snapshot).catch(function(err) {
        console.warn('[AIOS][MEMORY] save error:', err && err.message ? err.message : err);
        return { error: err };
      });
    },

    /**
     * Load persisted veteran profile from Supabase and merge into in-session memory.
     * No-ops gracefully for anonymous users or if AAAI.auth is unavailable.
     * Merging uses the safe mergeMemory rules — existing valid data is never
     * overwritten by null or unknown signals.
     *
     * @param {string} [userId]  — reserved, unused (auth uses current session internally)
     * @returns {Promise}
     */
    load: function(userId) {
      // Gate: skip if not authenticated
      if (!window.AAAI || !window.AAAI.auth || !window.AAAI.auth.isLoggedIn()) {
        return Promise.resolve(null);
      }

      // Gate: skip if loadAIOSMemory not wired yet
      if (typeof window.AAAI.auth.loadAIOSMemory !== 'function') {
        return Promise.resolve(null);
      }

      return window.AAAI.auth.loadAIOSMemory().then(function(result) {
        if (result && result.data && typeof result.data === 'object') {
          // Safe merge — persisted data flows into in-session profile
          // but null/unknown values never overwrite existing valid data
          var merged = MemoryManager.mergeMemory(MemoryManager.profile, result.data);
          MemoryManager.profile = merged;
          console.log('[AIOS][MEMORY] Loaded from Supabase — ' +
            (MemoryManager.buildMemorySummary(MemoryManager.profile) || 'no fields set'));
        }
        return result;
      }).catch(function(err) {
        console.warn('[AIOS][MEMORY] load error:', err && err.message ? err.message : err);
        return null;
      });
    },


    /* ── Phase 9: Extraction + Merge + Summary ──────────── */

    /**
     * Scan a single user message for structured veteran-profile facts.
     * Returns ONLY the fields that were explicitly detected — nothing is
     * assumed or fabricated. Caller decides what to do with the result
     * (typically passes it to mergeMemory).
     *
     * Supported fields: branch, dischargeStatus, state, employmentStatus,
     *                   vaRating, currentGoals, activeMissions
     *
     * @param {string} userMessage  - Raw user input.
     * @param {Object} [context]    - Optional context (reserved for future use).
     * @returns {Object} Partial memory object — only detected keys present.
     */
    extractMemoryFromInput: function(userMessage, context) {
      if (typeof userMessage !== 'string' || !userMessage.trim()) return {};

      var text = userMessage.toLowerCase();
      var extracted = {};

      // ── Branch ────────────────────────────────────────
      // Check longer branch names before shorter ones to avoid false partial matches.
      // Four safe alternations — all require first-person or explicit self-reference:
      //   1. First-person verb: "I served in the Army", "I joined the Navy", "I left the Marines"
      //   2. Branch + role noun: "Army veteran", "Navy sailor", "Air Force airman"
      //   3. Self-reference:    "I'm Army", "I was Air Force", "my branch is Navy"
      //   4. Whole-message:     "Army" as the entire user message (button click / one-word answer)
      // The old bare-word match (\bBRANCH\b) is removed — it false-positived on
      // incidental mentions like "I drove past an Army base" or "My brother was in the Navy".
      for (var b = 0; b < MILITARY_BRANCHES.length; b++) {
        var branchName = MILITARY_BRANCHES[b];
        var escaped = branchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var branchRx = new RegExp(
          '\\bi\\s+(?:served(?:\\s+in(?:\\s+the)?)?|(?:was|am)\\s+(?:a\\s+)?(?:member\\s+of\\s+the|in(?:\\s+the)?)|joined(?:\\s+the)?|left(?:\\s+the)?)\\s+' + escaped + '\\b' +
          '|\\b' + escaped + '\\s+(?:veteran|vet|soldier|sailor|airman|marine|guardian)\\b' +
          '|\\b(?:i\'m|i\\s+am|i\\s+was|my\\s+branch\\s+(?:is|was))\\s+(?:(?:in|with)\\s+(?:the\\s+)?)?' + escaped + '\\b' +
          '|^\\s*' + escaped + '\\s*[.!?]?\\s*$',
          'i'
        );
        if (branchRx.test(userMessage)) {
          extracted.branch = toTitleCase(branchName);
          break;
        }
      }

      // ── Discharge status ──────────────────────────────
      for (var d = 0; d < DISCHARGE_TYPES.length; d++) {
        if (matchesAny(userMessage, DISCHARGE_TYPES[d].patterns)) {
          extracted.dischargeStatus = DISCHARGE_TYPES[d].label;
          break;
        }
      }

      // ── State ─────────────────────────────────────────
      var stateRxList = [
        /\b(?:i\s+live\s+in|i'm\s+in|i\s+am\s+in|based\s+in|living\s+in|located\s+in|moved\s+to)\s+([a-z][a-z\s]{1,19}?)(?:\s*[.,\n]|$)/gi,
        /\b([a-z]{2,20})\s+veteran\b/gi,
        /\bstate[:\s]+([a-z][a-z\s]{1,19})(?:[.,\n]|$)/gi
      ];
      for (var sr = 0; sr < stateRxList.length; sr++) {
        var stateRx = stateRxList[sr];
        stateRx.lastIndex = 0;
        var sm;
        while ((sm = stateRx.exec(text)) !== null) {
          var candidate = sm[1].trim().replace(/\s+/g, ' ');
          if (US_STATES[candidate]) {
            extracted.state = candidate.length === 2
              ? candidate.toUpperCase()
              : toTitleCase(candidate);
            break;
          }
        }
        if (extracted.state) break;
      }

      // ── Employment status ─────────────────────────────
      for (var e = 0; e < EMPLOYMENT_PATTERNS.length; e++) {
        if (matchesAny(userMessage, EMPLOYMENT_PATTERNS[e].patterns)) {
          extracted.employmentStatus = EMPLOYMENT_PATTERNS[e].label;
          break;
        }
      }

      // ── VA / disability rating ────────────────────────
      // Matches: "80% rating", "rated at 70%", "70 percent disabled", "100% P&T"
      var ratingPatterns = [
        /\b(\d{1,3})\s*%\s*(?:disability\s+)?(?:rating|rated|combined|p&t|permanent)?\b/i,
        /\b(?:rated|rating|disability)\s+(?:at\s+)?(\d{1,3})\s*%/i,
        /\b(\d{1,3})\s+percent\s+(?:disabled|rating|rated)\b/i
      ];
      for (var rp = 0; rp < ratingPatterns.length; rp++) {
        var rm = userMessage.match(ratingPatterns[rp]);
        if (rm) {
          var pct = parseInt(rm[1], 10);
          if (pct >= 0 && pct <= 100) {
            extracted.vaRating = pct;
            break;
          }
        }
      }

      // ── Current goals ──────────────────────────────────
      // Only extract explicit, first-person goal statements
      var goalRxList = [
        /\bmy\s+goal\s+(?:is|right\s+now\s+is|for\s+now\s+is)\s+(.+?)(?:\.|,|$)/i,
        /\bi\s+(?:want|need|am\s+trying)\s+to\s+(.{10,100}?)(?:\.|,|$)/i,
        /\bi'm\s+working\s+(?:on|toward)\s+(.{10,100}?)(?:\.|,|$)/i,
        /\bgoal[:\s]+(.{5,120})(?:\.|,|\n|$)/i
      ];
      for (var gr = 0; gr < goalRxList.length; gr++) {
        var gm = userMessage.match(goalRxList[gr]);
        if (gm && gm[1]) {
          var goalText = gm[1].trim();
          if (goalText.length >= 8 && goalText.length <= 120) {
            extracted.currentGoals = goalText;
            break;
          }
        }
      }

      // ── Active missions ────────────────────────────────
      // Only extract explicit mission/focus statements
      var missionRxList = [
        /\b(?:my\s+)?(?:current\s+)?mission\s+(?:is|right\s+now\s+is)\s+(.+?)(?:\.|,|$)/i,
        /\bi'm\s+(?:currently\s+)?focused\s+on\s+(.{10,100}?)(?:\.|,|$)/i,
        /\bworking\s+to\s+(?:get|obtain|complete|finish|achieve)\s+(.{10,100}?)(?:\.|,|$)/i,
        /\bmission[:\s]+(.{5,120})(?:\.|,|\n|$)/i
      ];
      for (var mr = 0; mr < missionRxList.length; mr++) {
        var mm = userMessage.match(missionRxList[mr]);
        if (mm && mm[1]) {
          var missionText = mm[1].trim();
          if (missionText.length >= 8 && missionText.length <= 120) {
            extracted.activeMissions = missionText;
            break;
          }
        }
      }

      // ── Name (Phase 37) ────────────────────────────────
      // Only extract from explicit self-identification phrases.
      // "I'm X" and "I am X" are intentionally excluded — they
      // false-match too many non-name phrases ("I'm retired").
      var NAME_STOPWORDS = /^(the|a|an|my|your|his|her|their|our|its|this|that|here|there|just|really|very|so|too|not|no|yes|also|still|now|then|well|ok|okay|hi|hey|sir|not\s+sure|a\s+veteran|veteran|vet|retired|married|single|disabled)$/i;
      var namePatterns = [
        /\bmy\s+name\s+is\s+([A-Z][a-zA-Z'\-]{1,18}(?:\s+[A-Z][a-zA-Z'\-]{1,18})?)\b/i,
        /\bcall\s+me\s+([A-Z][a-zA-Z'\-]{1,18})\b/i,
        /\bi\s+go\s+by\s+([A-Z][a-zA-Z'\-]{1,18})\b/i,
        /\byou\s+can\s+call\s+me\s+([A-Z][a-zA-Z'\-]{1,18})\b/i,
        /\bname[:\s]+([A-Z][a-zA-Z'\-]{1,18}(?:\s+[A-Z][a-zA-Z'\-]{1,18})?)\b/i
      ];
      for (var np = 0; np < namePatterns.length; np++) {
        var nameM = userMessage.match(namePatterns[np]);
        if (nameM && nameM[1]) {
          var nameCandidate = nameM[1].trim();
          var firstWord = nameCandidate.split(/\s+/)[0];
          if (!NAME_STOPWORDS.test(firstWord) &&
              nameCandidate.length >= 2 && nameCandidate.length <= 30) {
            extracted.name = nameCandidate;
            break;
          }
        }
      }

      // ── Service era (Phase 37) ──────────────────────────
      for (var er = 0; er < ERA_PATTERNS.length; er++) {
        if (ERA_PATTERNS[er].rx.test(userMessage)) {
          extracted.serviceEra = ERA_PATTERNS[er].label;
          break;
        }
      }

      // ── MOS / AFSC (Phase 37) ───────────────────────────
      // Captures explicit code labels only: "MOS 11B", "AFSC 1C7X1",
      // "my MOS is 68W", "my AFSC was 3D0X2".
      // Does NOT attempt to extract verbose job titles to avoid
      // false positives.
      var mosPatterns = [
        /\b(?:mos|afsc|nec|aoc)[:\s]+([A-Z0-9]{2,8})\b/i,
        /\bmy\s+mos\s+(?:was|is|has\s+been)\s+([A-Z0-9]{2,8})\b/i,
        /\bmy\s+afsc\s+(?:was|is|has\s+been)\s+([A-Z0-9]{2,8})\b/i
      ];
      for (var mop = 0; mop < mosPatterns.length; mop++) {
        var mosM = userMessage.match(mosPatterns[mop]);
        if (mosM && mosM[1]) {
          var mosCandidate = mosM[1].trim().toUpperCase();
          if (mosCandidate.length >= 2 && mosCandidate.length <= 8) {
            extracted.mos = mosCandidate;
            break;
          }
        }
      }

      // ── Dependents (Phase 37) ───────────────────────────
      // Detect spouse / children status from explicit statements.
      // "married with children" is checked before plain "married"
      // to capture the more specific case first.
      var DEPENDENT_PATTERNS = [
        { label: 'married with children', rx: /\bmarried\s+(?:and\s+)?(?:with|have|having)\s+(?:\d+\s+)?(?:kids?|child(?:ren)?)\b/i },
        { label: 'married',               rx: /\b(?:i\s+am|i'm|currently)\s+married\b|\bmy\s+(?:wife|husband|spouse)\b/i },
        { label: 'children',              rx: /\b(?:i\s+have|i\s+got|have\s+got)\s+(?:\d+\s+)?(?:kids?|child(?:ren)?)\b/i },
        { label: 'no dependents',         rx: /\bno\s+(?:kids?|dependents?|children)\b|\b(?:single\s+(?:and\s+)?(?:no|without)|not\s+married(?:\s+and\s+no)?)\b/i }
      ];
      for (var dp = 0; dp < DEPENDENT_PATTERNS.length; dp++) {
        if (DEPENDENT_PATTERNS[dp].rx.test(userMessage)) {
          extracted.dependents = DEPENDENT_PATTERNS[dp].label;
          break;
        }
      }

      // ── Conditions (Phase R4.6) ─────────────────────────
      // Extract medical/mental health conditions from first-person statements.
      // Requires explicit self-identification: "I have PTSD", "diagnosed with TBI".
      // Does NOT match informational queries: "what is PTSD", "tell me about TBI".
      var CONDITION_LABELS = [
        'ptsd', 'tbi', 'mst', 'depression', 'anxiety', 'chronic pain',
        'hearing loss', 'back injury', 'sleep apnea', 'burn pit exposure'
      ];
      var _condFirstPerson = /\b(?:i\s+have|i\s+was\s+diagnosed\s+with|diagnosed\s+(?:me\s+)?with|i\s+suffer\s+from|i(?:'m|\s+am)\s+(?:dealing|living|struggling)\s+with|my\s+condition(?:s)?\s+(?:is|are|include)|service[- ]connected\s+for)\s+/i;
      if (_condFirstPerson.test(userMessage)) {
        var _condFound = [];
        for (var _ci = 0; _ci < CONDITION_LABELS.length; _ci++) {
          var _condEsc = CONDITION_LABELS[_ci].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp('\\b' + _condEsc + '\\b', 'i').test(userMessage)) {
            _condFound.push(CONDITION_LABELS[_ci].toUpperCase());
          }
        }
        if (_condFound.length > 0) {
          extracted.conditions = _condFound.join(', ');
        }
      }

      // Phase 30: validate before returning — only high-confidence fields pass
      return _validateMemoryFields(extracted, userMessage);
    },


    /**
     * Safely merge newMemory into existingMemory.
     *
     * Rules:
     *   - New scalar values overwrite only if they are valid (non-null, non-unknown).
     *   - Existing valid data is NEVER overwritten by null, undefined, or unknown signals.
     *   - Array fields are deduplicated and merged, not replaced.
     *
     * @param {Object} existingMemory
     * @param {Object} newMemory
     * @returns {Object} New merged object (existingMemory is not mutated).
     */
    mergeMemory: function(existingMemory, newMemory) {
      var existing = existingMemory || {};
      var incoming = newMemory || {};
      var merged = {};

      // Copy all existing keys
      var ek;
      for (ek in existing) {
        if (existing.hasOwnProperty(ek)) merged[ek] = existing[ek];
      }

      // Apply incoming keys
      var nk;
      for (nk in incoming) {
        if (!incoming.hasOwnProperty(nk)) continue;
        var newVal = incoming[nk];
        if (!isValidValue(newVal)) continue;  // Skip nulls / unknowns

        var existingVal = merged[nk];

        if (Array.isArray(existingVal) && Array.isArray(newVal)) {
          // Deduplicated array merge
          var seen = {};
          var merged_arr = [];
          var all = existingVal.concat(newVal);
          for (var i = 0; i < all.length; i++) {
            var item = String(all[i]);
            if (!seen[item]) { seen[item] = 1; merged_arr.push(all[i]); }
          }
          merged[nk] = merged_arr;
        } else {
          merged[nk] = newVal;
        }
      }

      return merged;
    },


    /**
     * Build a short, prompt-safe summary of veteran memory for AI context
     * injection. Not verbose — confirmed facts only, single line.
     *
     * @param {Object} memory - Veteran memory object (or profile snapshot).
     * @returns {string} One-line summary, or empty string if no data.
     */
    /**
     * Return a clean subset of the profile containing only the fields
     * used by the Eligibility Engine for scoring.
     * Keeps the scoring API decoupled from the full profile shape.
     * Phase 23.
     *
     * @returns {Object} { dischargeStatus, vaRating, branch, serviceEra,
     *                     state, employmentStatus, currentGoals, activeMissions }
     */
    getEligibilityProfile: function() {
      var p = MemoryManager.profile;
      return {
        dischargeStatus:  p.dischargeStatus  || null,
        vaRating:         (p.vaRating !== null && p.vaRating !== undefined) ? p.vaRating : null,
        branch:           p.branch           || null,
        serviceEra:       p.serviceEra       || null,
        state:            p.state            || null,
        employmentStatus: p.employmentStatus || null,
        currentGoals:     p.currentGoals     || null,
        activeMissions:   p.activeMissions   || null
      };
    },

    /**
     * Merge structured fields extracted from an uploaded document into
     * the session profile.  Phase 42 — Document-Driven Planning Flow.
     *
     * Uses mergeMemory safe-merge rules: existing valid profile data is
     * NEVER overwritten by incoming values — only fills in missing fields.
     * Accepts the output of DocumentAnalyzer.extractDocumentFields() directly.
     *
     * @param {Object} extractedFields - Partial memory object from document extraction
     */
    mergeDocumentMemory: function(extractedFields) {
      if (!extractedFields || typeof extractedFields !== 'object') return;
      if (Object.keys(extractedFields).length === 0) return;
      MemoryManager.profile = MemoryManager.mergeMemory(MemoryManager.profile, extractedFields);
      console.log('[AIOS][MEMORY] Document merge — ' +
        (MemoryManager.buildMemorySummary(MemoryManager.profile) || 'no fields set'));
    },

    buildMemorySummary: function(memory) {
      if (!memory || typeof memory !== 'object') return '';

      var parts = [];

      if (isValidValue(memory.name))             parts.push('Name: ' + memory.name);
      if (isValidValue(memory.branch))           parts.push('Branch: ' + memory.branch);
      if (isValidValue(memory.dischargeStatus))  parts.push('Discharge: ' + memory.dischargeStatus);
      if (isValidValue(memory.serviceEra))       parts.push('Era: ' + memory.serviceEra);
      if (isValidValue(memory.state))            parts.push('State: ' + memory.state);
      if (isValidValue(memory.employmentStatus)) parts.push('Employment: ' + memory.employmentStatus);
      if (isValidValue(memory.vaRating) || memory.vaRating === 0)
                                                  parts.push('VA rating: ' + memory.vaRating + '%');
      if (isValidValue(memory.mos))              parts.push('MOS/AFSC: ' + memory.mos);
      if (isValidValue(memory.rank))             parts.push('Rank: ' + memory.rank);
      if (isValidValue(memory.dependents))       parts.push('Dependents: ' + memory.dependents);
      if (isValidValue(memory.serviceEntryDate)) parts.push('Entered: ' + memory.serviceEntryDate);
      if (isValidValue(memory.separationDate))   parts.push('Separated: ' + memory.separationDate);
      if (isValidValue(memory.conditions))       parts.push('Conditions: ' + memory.conditions);
      if (isValidValue(memory.currentGoals))     parts.push('Goal: ' + memory.currentGoals);
      if (isValidValue(memory.activeMissions))   parts.push('Mission: ' + memory.activeMissions);

      if (parts.length === 0) return '';
      return 'Veteran profile — ' + parts.join(' | ') + '.';
    }

  };


  window.AIOS = window.AIOS || {};
  window.AIOS.Memory = MemoryManager;


  /* ══════════════════════════════════════════════════════════
     AIOS — Execution State  (Phase 9)

     Tracks execution events across sessions for:
       - Resume banner ("pick up where you left off")
       - Progress tracking (in_progress vs completed)
       - Dedup filtering (suppress already-actioned resources)

     State model fields:
       active_goals             []      — goal strings currently being pursued
       completed_actions        []      — resource IDs the user has actioned
       in_progress_actions      []      — resource IDs shown but not yet actioned
       last_execution_page      string  — e.g. "/contractor-careers.html?auto=1&goal=get_hired"
       last_execution_params    object  — clearance/background/goal values at run time
       last_execution_results   []      — top-5 resource IDs from the last run
       last_execution_timestamp string  — ISO 8601 timestamp

     Persistence: stored as profiles.aios_memory.execution_state (JSONB subkey).
     Read/write via window.AAAI.auth.loadAIOSMemory / saveAIOSMemory.
     All writes are no-ops for unauthenticated users — no errors are thrown.
     ══════════════════════════════════════════════════════════ */

  var _ES_DEFAULT = {
    active_goals:             [],
    completed_actions:        [],
    in_progress_actions:      [],
    last_execution_page:      null,
    last_execution_params:    null,
    last_execution_results:   [],
    last_execution_timestamp: null,
    latest_payload:           null   // Phase 11: latest generated action payload
  };

  var ExecutionState = {

    _state:  JSON.parse(JSON.stringify(_ES_DEFAULT)),
    _loaded: false,

    /**
     * Record a completed execution engine run.
     * Call this immediately after an execution engine resolves its top-N list.
     *
     * @param {string}   page      Full URL (path+params): "/contractor-careers.html?auto=1&goal=get_hired"
     * @param {Object}   params    Snapshot of user inputs (clearance, goal, background, etc.)
     * @param {string[]} resultIds IDs of the top-N resources returned (max 5 stored)
     * @returns {Promise}
     */
    save: function(page, params, resultIds) {
      if (!page) return Promise.resolve({ skipped: 'no page' });

      var ids = Array.isArray(resultIds) ? resultIds.slice(0, 5) : [];

      ExecutionState._state.last_execution_page      = page;
      ExecutionState._state.last_execution_params    = params || null;
      ExecutionState._state.last_execution_results   = ids;
      ExecutionState._state.last_execution_timestamp = new Date().toISOString();

      // Add IDs to in_progress if not already completed or tracked
      ids.forEach(function(id) {
        var comp = ExecutionState._state.completed_actions;
        var prog = ExecutionState._state.in_progress_actions;
        if (comp.indexOf(id) === -1 && prog.indexOf(id) === -1) {
          prog.push(id);
        }
      });

      console.log('[AIOS][EXEC_STATE] Saved — page: ' + page + ' | in_progress: ' + ids.length);
      return ExecutionState._persist();
    },

    /**
     * Mark a resource ID as actioned (clicked CTA, completed a step, etc.).
     * Moves the ID from in_progress → completed and persists.
     *
     * @param {string} id Resource ID, e.g. "cc-022" or "fr-008"
     */
    markCompleted: function(id) {
      if (!id) return;
      var prog = ExecutionState._state.in_progress_actions;
      var idx  = prog.indexOf(id);
      if (idx !== -1) prog.splice(idx, 1);
      if (ExecutionState._state.completed_actions.indexOf(id) === -1) {
        ExecutionState._state.completed_actions.push(id);
      }
      console.log('[AIOS][EXEC_STATE] Marked completed: ' + id);
      ExecutionState._persist();
    },

    /** @returns {boolean} true if the resource has been marked completed */
    isCompleted: function(id) {
      return ExecutionState._state.completed_actions.indexOf(id) !== -1;
    },

    /** @returns {string[]} shallow copy of the completed action ID array */
    getCompletedIds: function() {
      return ExecutionState._state.completed_actions.slice();
    },

    /**
     * Returns the last recorded execution context for the resume banner.
     * @returns {{ page, params, results, timestamp } | null}
     */
    getLastExecution: function() {
      if (!ExecutionState._state.last_execution_page) return null;
      return {
        page:      ExecutionState._state.last_execution_page,
        params:    ExecutionState._state.last_execution_params,
        results:   ExecutionState._state.last_execution_results.slice(),
        timestamp: ExecutionState._state.last_execution_timestamp
      };
    },

    /**
     * Filter a results array by removing already-completed items.
     * Execution engines call this on their sorted top-N before rendering.
     *
     * @param {Object[]} arr Array of resource objects with an `id` field
     * @returns {Object[]} filtered array (completed items excluded)
     */
    filterCompleted: function(arr) {
      if (!Array.isArray(arr)) return arr;
      var completed = ExecutionState._state.completed_actions;
      if (!completed.length) return arr;
      return arr.filter(function(r) {
        return r && completed.indexOf(r.id) === -1;
      });
    },

    /**
     * Load execution state from Supabase (aios_memory.execution_state subkey).
     * Merges retrieved data into _state and sets _loaded = true on success.
     * Silent no-op for anonymous users.
     *
     * @returns {Promise<Object|null>} resolved _state, or null on auth gate / error
     */
    load: function() {
      if (!window.AAAI || !window.AAAI.auth ||
          typeof window.AAAI.auth.isLoggedIn  !== 'function' || !window.AAAI.auth.isLoggedIn() ||
          typeof window.AAAI.auth.loadAIOSMemory !== 'function') {
        return Promise.resolve(null);
      }

      return window.AAAI.auth.loadAIOSMemory().then(function(result) {
        if (result && result.data &&
            typeof result.data === 'object' &&
            result.data.execution_state &&
            typeof result.data.execution_state === 'object') {

          var s = result.data.execution_state;
          ExecutionState._state = {
            active_goals:             Array.isArray(s.active_goals)           ? s.active_goals           : [],
            completed_actions:        Array.isArray(s.completed_actions)      ? s.completed_actions      : [],
            in_progress_actions:      Array.isArray(s.in_progress_actions)    ? s.in_progress_actions    : [],
            last_execution_page:      s.last_execution_page                   || null,
            last_execution_params:    s.last_execution_params                 || null,
            last_execution_results:   Array.isArray(s.last_execution_results) ? s.last_execution_results : [],
            last_execution_timestamp: s.last_execution_timestamp              || null,
            // Phase 11: restore latest payload — validate it's a non-array object before trusting
            latest_payload: (s.latest_payload && typeof s.latest_payload === 'object' && !Array.isArray(s.latest_payload))
              ? s.latest_payload : null
          };
          ExecutionState._loaded = true;
          console.log('[AIOS][EXEC_STATE] Loaded — last page: ' +
            (ExecutionState._state.last_execution_page || 'none') +
            ' | completed: ' + ExecutionState._state.completed_actions.length +
            ' | in_progress: ' + ExecutionState._state.in_progress_actions.length);
        }
        return ExecutionState._state;
      }).catch(function(err) {
        console.warn('[AIOS][EXEC_STATE] load error:', err && err.message ? err.message : err);
        return null;
      });
    },

    /**
     * Phase 11: Store the latest generated action payload.
     * Persists to Supabase so the payload survives page reloads for authenticated users.
     * Silent no-op for non-object payloads or unauthenticated sessions.
     *
     * @param {Object} payload — Output of ActionPayload.generate()
     */
    setPayload: function(payload) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
      // D1 FIX: Deep copy to prevent caller mutation of stored state (e.g., Phase 12 resource_ids push)
      try {
        ExecutionState._state.latest_payload = JSON.parse(JSON.stringify(payload));
      } catch(e) {
        ExecutionState._state.latest_payload = payload; // fallback if JSON serialization fails
      }
      ExecutionState._persist();
    },

    /**
     * Phase 11: Retrieve the latest stored action payload.
     * @returns {Object|null}
     */
    getLatestPayload: function() {
      return ExecutionState._state.latest_payload || null;
    },

    /**
     * Phase 12: Append a resource ID to the latest stored payload's resource_ids array.
     * Deduplicates before inserting. Persists immediately on change.
     * Silent no-op when no payload exists (GQ flows, pre-routing clicks).
     * @param {string} resourceId
     */
    appendToPayload: function(resourceId) {
      if (!resourceId || typeof resourceId !== 'string') return;
      var _lp = ExecutionState._state.latest_payload;
      if (!_lp || typeof _lp !== 'object' || Array.isArray(_lp)) return;
      if (!Array.isArray(_lp.resource_ids)) {
        _lp.resource_ids = [];
      }
      if (_lp.resource_ids.indexOf(resourceId) !== -1) return; // deduplicate
      _lp.resource_ids.push(resourceId);
      console.log('[AIOS][EXEC_STATE] Payload resource appended — id: ' + resourceId + ' | total: ' + _lp.resource_ids.length);
      ExecutionState._persist();
    },

    /**
     * Internal: merge execution_state into aios_memory JSONB and save.
     * Uses load-merge-save to avoid clobbering the veteran profile fields.
     * @returns {Promise}
     */
    _persist: function() {
      if (!window.AAAI || !window.AAAI.auth ||
          typeof window.AAAI.auth.isLoggedIn     !== 'function' || !window.AAAI.auth.isLoggedIn() ||
          typeof window.AAAI.auth.loadAIOSMemory !== 'function' ||
          typeof window.AAAI.auth.saveAIOSMemory !== 'function') {
        return Promise.resolve({ skipped: 'not authenticated or auth unavailable' });
      }

      return window.AAAI.auth.loadAIOSMemory().then(function(result) {
        var current = (result && result.data && typeof result.data === 'object')
          ? Object.assign({}, result.data)
          : {};
        current.execution_state = ExecutionState._state;
        return window.AAAI.auth.saveAIOSMemory(current);
      }).catch(function(err) {
        console.warn('[AIOS][EXEC_STATE] _persist error:', err && err.message ? err.message : err);
        return { error: err };
      });
    },

    /** Reset in-memory state on sign-out. Does NOT wipe persisted Supabase data. */
    _reset: function() {
      ExecutionState._state  = JSON.parse(JSON.stringify(_ES_DEFAULT));
      ExecutionState._loaded = false;
    }

  };

  window.AIOS.ExecutionState = ExecutionState;

  /* ══════════════════════════════════════════════════════════
     AIOS.PartnerRegistry  (Phase 13)
     Partner integration model — structure-only foundation.
     No partners are active in Phase 13; this establishes
     the registry, lookup contract, and payload extension
     point used by ActionPayload.generate() and the Router.

     Partner schema:
       partner_id:   string   — unique slug identifier
       partner_type: string   — 'employment' | 'financial'
                                | 'benefits' | 'legal' | 'recreation'
       endpoint:     string   — base URL for future API / referral
       supports:     string[] — AIOS intent keys this partner handles
       status:       string   — 'active' | 'inactive'
                                (all 'inactive' in Phase 13)

     Activation: change status → 'active' in Phase 14 to enable
     partner_action injection into payloads and router metadata.
     ══════════════════════════════════════════════════════════ */

  var _P13_PARTNERS = [
    {
      partner_id:   'hireheroesusa',
      partner_type: 'employment',
      endpoint:     'https://www.hireheroesusa.org/jobs/',
      supports:     ['EMPLOYMENT_TRANSITION'],
      status:       'active'   // Phase 14: activated
    },
    {
      partner_id:   'operationhomefront',
      partner_type: 'financial',
      endpoint:     'https://operationhomefront.org/get-help/',
      supports:     ['BENEFITS_DISCOVERY', 'DISABILITY_CLAIM', 'STATE_BENEFITS'],
      status:       'inactive'
    },
    {
      partner_id:   'pointman_ministries',
      partner_type: 'benefits',
      endpoint:     'https://pointman.org/find-your-post/',
      supports:     ['NEXT_STEP', 'FAMILY_SURVIVOR'],
      status:       'inactive'
    }
  ];

  var PartnerRegistry = {

    /**
     * Return the first ACTIVE partner that supports the given intent.
     * Returns null if no active partner maps to the intent.
     * Called by ActionPayload.generate() and the Router hook.
     *
     * @param  {string} intent — AIOS intent key (e.g. 'EMPLOYMENT_TRANSITION')
     * @returns {Object|null}
     */
    getPartnerFor: function(intent) {
      if (!intent || typeof intent !== 'string') return null;
      for (var i = 0; i < _P13_PARTNERS.length; i++) {
        var p = _P13_PARTNERS[i];
        if (p.status === 'active' &&
            Array.isArray(p.supports) &&
            p.supports.indexOf(intent) !== -1) {
          // D2 FIX: Return an isolated copy — callers must not mutate the live registry.
          return { partner_id: p.partner_id, partner_type: p.partner_type,
                   endpoint: p.endpoint, supports: p.supports.slice(), status: p.status };
        }
      }
      return null; // no active partner (all inactive in Phase 13)
    },

    /**
     * Return isolated copies of all partner definitions.
     * Safe for inspection — mutations to returned objects do not affect the registry.
     * @returns {Object[]}
     */
    getAll: function() {
      // D1 FIX: Map to isolated copies — element property mutations must not
      // propagate back into _P13_PARTNERS (e.g. caller setting status='active').
      return _P13_PARTNERS.map(function(p) {
        return { partner_id: p.partner_id, partner_type: p.partner_type,
                 endpoint: p.endpoint, supports: p.supports.slice(), status: p.status };
      });
    }

  };

  window.AIOS.PartnerRegistry = PartnerRegistry;

  /* ══════════════════════════════════════════════════════════
     AIOS.ActionPayload  (Phase 11)
     Generates, stores, and retrieves structured action payload
     objects from routing results.  Payloads give the response
     layer a machine-readable summary of what the routing engine
     decided — type, target page, parsed params, next_step label,
     and priority — so the AI references structured data rather
     than assembling raw URLs from scratch.

     Safety rules:
       - Payload generated ONLY for execution_route type
       - Crisis / AT_RISK routes always return null (no payload)
       - Params parsed from URL query string (not from user input)
       - No external submission — storage only (Phase 11 scope)
     ══════════════════════════════════════════════════════════ */

  /**
   * Maps whitelisted execution page paths to human-readable next-step labels.
   * Mirrors _PAGE_LABELS / _P10_PAGE_LABELS — single source of truth for labels.
   */
  var _P11_NEXT_STEPS = {
    '/contractor-careers.html':     'Explore defense contractor and federal career opportunities',
    '/hidden-benefits.html':        'Discover VA and federal benefits you may qualify for',
    '/financial-optimization.html': 'Find money-saving programs and financial assistance',
    '/emergency-assistance.html':   'Connect with emergency assistance resources',
    '/outdoor-recreation.html':     'Access veteran outdoor and recreation programs'
  };

  var ActionPayload = {

    /**
     * Generate a structured action payload from a routing result.
     * Only generates for execution_route type.
     * Returns null for crisis paths, at-risk paths, and general questions.
     *
     * @param {Object} routeResult — Output of Router.routeAIOSIntent()
     * @returns {Object|null} — The payload object, or null if not applicable
     *
     * Payload schema:
     *   type:         string   — 'execution_route' | 'general_query' | 'crisis_escalation'
     *   page:         string   — full execution URL with query string, or null
     *   params:       Object   — { intent, skill, goal, need, urgency, situation }
     *   resource_ids: string[] — initially [] (populated by execution engines later)
     *   next_step:    string   — human-readable label for the next action
     *   priority:     string   — 'high' | 'medium' | 'low'
     *   timestamp:    string   — ISO 8601 generation time
     */
    generate: function(routeResult) {
      if (!routeResult) return null;

      var _type = ActionPayload._deriveType(routeResult);
      // Only generate payloads for deterministic execution routes.
      // Crisis and general query flows must stay unstructured and clean.
      if (_type !== 'execution_route') return null;

      var _url    = routeResult.executionUrl || null;
      var _path   = _url ? _url.split('?')[0] : null;
      var _qp     = ActionPayload._parseQueryParams(_url);
      var _label  = (_path && _P11_NEXT_STEPS[_path]) ? _P11_NEXT_STEPS[_path] : null;

      // Phase 13: Attach partner_action only when an active partner supports
      // this intent. No-op in Phase 13 (all partners inactive). Activates
      // automatically in Phase 14 by flipping partner status → 'active'.
      var _partner = (window.AIOS && window.AIOS.PartnerRegistry)
        ? window.AIOS.PartnerRegistry.getPartnerFor(routeResult.intent)
        : null;

      var _payload = {
        type:         _type,
        page:         _url,
        params: {
          intent:    routeResult.intent    || null,
          skill:     routeResult.skill     || null,
          goal:      _qp.goal             || null,
          need:      _qp.need             || null,
          urgency:   _qp.urgency          || null,
          situation: _qp.situation        || null
        },
        resource_ids: [],
        next_step:    _label,
        priority:     ActionPayload._derivePriority(routeResult),
        timestamp:    new Date().toISOString()
      };

      // Only add partner_action field when a partner is actually matched.
      // Keeps payload clean (no null keys) for all current inactive flows.
      if (_partner) {
        _payload.partner_action = {
          partner_id:  _partner.partner_id,
          action_type: 'referral',
          endpoint:    _partner.endpoint
        };
      }

      return _payload;
    },

    /**
     * Store a generated payload via ExecutionState.setPayload().
     * Silent no-op if ExecutionState is unavailable.
     *
     * @param {Object} payload — Output of ActionPayload.generate()
     */
    store: function(payload) {
      if (!payload || !window.AIOS || !window.AIOS.ExecutionState) return;
      if (typeof window.AIOS.ExecutionState.setPayload === 'function') {
        window.AIOS.ExecutionState.setPayload(payload);
      }
    },

    /**
     * Retrieve the latest stored payload from ExecutionState.
     * @returns {Object|null}
     */
    getLatest: function() {
      if (!window.AIOS || !window.AIOS.ExecutionState) return null;
      if (typeof window.AIOS.ExecutionState.getLatestPayload === 'function') {
        return window.AIOS.ExecutionState.getLatestPayload();
      }
      return null;
    },

    /* ── Private helpers ─────────────────────────────────── */

    /** Derive payload type from a route result. */
    _deriveType: function(routeResult) {
      if (!routeResult) return 'general_query';
      if (routeResult.tier === 'CRISIS' || routeResult.tier === 'AT_RISK') return 'crisis_escalation';
      if (routeResult.executionUrl) return 'execution_route';
      return 'general_query';
    },

    /**
     * Derive payload priority from tier and confidence.
     * - CRISIS / AT_RISK → always 'high'
     * - confidence ≥ 0.7 → 'high'
     * - confidence ≥ 0.4 → 'medium'
     * - confidence < 0.4 → 'low'
     */
    _derivePriority: function(routeResult) {
      if (!routeResult) return 'low';
      if (routeResult.tier === 'CRISIS' || routeResult.tier === 'AT_RISK') return 'high';
      var conf = (typeof routeResult.confidence === 'number') ? routeResult.confidence : 0;
      if (conf >= 0.7) return 'high';
      if (conf >= 0.4) return 'medium';
      return 'low';
    },

    /**
     * Parse query-string params from an execution URL into a flat object.
     * Skips `auto` param (always 1 — no informational value).
     * Handles malformed input gracefully.
     *
     * @param  {string|null} url — e.g. "/contractor-careers.html?auto=1&goal=get_hired"
     * @returns {Object}         — e.g. { goal: 'get_hired' }
     */
    _parseQueryParams: function(url) {
      if (!url || url.indexOf('?') === -1) return {};
      var qs = url.split('?')[1];
      var params = {};
      qs.split('&').forEach(function(pair) {
        var eq = pair.indexOf('=');
        if (eq === -1) return;
        var key = pair.slice(0, eq);
        var val = pair.slice(eq + 1);
        if (key && key !== 'auto') {
          try { params[key] = decodeURIComponent(val.replace(/\+/g, ' ')); }
          catch (e) { params[key] = val; }
        }
      });
      return params;
    }

  };

  window.AIOS.ActionPayload = ActionPayload;

  /* ══════════════════════════════════════════════════════════
     AIOS.Personalization  (Phase 10)
     Derives category affinity and pre-fill hints from
     ExecutionState.  Provides a prompt injection block that
     personalizes AI suggestions without modifying execution
     engine scoring or removing any options.

     Safety rules enforced here:
       - All language is advisory ("prioritize", "consider", "may")
       - Pre-fill is a HINT only — never auto-runs or overrides input
       - No mutation of execution engine data structures
       - Guard: only active when at least 1 signal is present
     ══════════════════════════════════════════════════════════ */

  /** Resource ID prefix → human-readable category label */
  var _P10_CATEGORY_MAP = {
    'cc': 'Contractor & Defense Careers',
    'fr': 'Financial Optimization',
    'hb': 'Hidden Benefits',
    'ea': 'Emergency Assistance',
    'or': 'Outdoor Recreation'
  };

  /**
   * Whitelist of valid execution page paths.
   * Mirrors _PAGE_LABELS in app.js — any page not in this object is rejected.
   */
  var _P10_PAGE_LABELS = {
    '/contractor-careers.html':     'Contractor & Defense Careers',
    '/financial-optimization.html': 'Financial Optimization',
    '/hidden-benefits.html':        'Hidden Benefits',
    '/emergency-assistance.html':   'Emergency Assistance',
    '/outdoor-recreation.html':     'Outdoor Recreation'
  };

  var Personalization = {

    /**
     * Derive engagement signals from ExecutionState.
     * Returns an object safe to consume even if ExecutionState is not loaded.
     *
     * @returns {{
     *   engaged:    string[],      — category labels sorted by engagement count desc
     *   lastPage:   string|null,   — whitelisted page path (query string stripped), or null
     *   lastParams: Object|null,   — last_execution_params snapshot
     *   inProgress: string[],      — in_progress_actions IDs
     *   hasHistory: boolean        — true if any personalization signal is present
     * }}
     */
    getSignals: function() {
      var _empty = { engaged: [], lastPage: null, lastParams: null, inProgress: [], hasHistory: false };
      if (!window.AIOS || !window.AIOS.ExecutionState) return _empty;

      // D1 FIX: Guard against null or non-object _state (corruption / race condition).
      // _state is always initialized to _ES_DEFAULT but could be externally nulled or
      // overwritten with a non-object during a reset cycle.  Fall back to {} so the
      // Array.isArray guards on the next two lines produce empty arrays cleanly.
      var _esRaw = window.AIOS.ExecutionState._state;
      var _es    = (_esRaw && typeof _esRaw === 'object' && !Array.isArray(_esRaw)) ? _esRaw : {};
      var _last  = window.AIOS.ExecutionState.getLastExecution();

      var completed  = Array.isArray(_es.completed_actions)   ? _es.completed_actions.slice()   : [];
      var inProgress = Array.isArray(_es.in_progress_actions) ? _es.in_progress_actions.slice() : [];

      // Count completions by ID prefix to build category affinity scores.
      // e.g. ["cc-022","cc-029","fr-008"] → { cc: 2, fr: 1 }
      var _counts = {};
      completed.forEach(function(id) {
        var prefix = (typeof id === 'string' && id.indexOf('-') !== -1) ? id.split('-')[0] : '';
        if (prefix && _P10_CATEGORY_MAP[prefix]) {
          _counts[prefix] = (_counts[prefix] || 0) + 1;
        }
      });

      // Sort prefixes by count descending → ordered list of engaged category labels
      var engaged = Object.keys(_counts)
        .sort(function(a, b) { return _counts[b] - _counts[a]; })
        .map(function(p) { return _P10_CATEGORY_MAP[p]; });

      // Whitelist-validate last page — strip query string, then check against _P10_PAGE_LABELS.
      // Rejects null, unknown pages, and any tampered values not in the whitelist.
      var _rawPage  = _last ? (_last.page || null) : null;
      var _pagePath = _rawPage ? _rawPage.split('?')[0] : null;
      var lastPage  = (_pagePath && _P10_PAGE_LABELS[_pagePath]) ? _pagePath : null;

      // D4 FIX: Extract lastParams before hasHistory so we can include valid params as a signal.
      // Scenario: lastPage is null (stale/rejected URL) but lastParams has intent/skill — the
      // pre-fill hint (section 3) should still fire. hasHistory was previously false in this case.
      var lastParams   = _last ? (_last.params || null) : null;
      var _hasParams   = !!(lastParams && (lastParams.intent || lastParams.skill));
      var hasHistory   = engaged.length > 0 || inProgress.length > 0 || !!lastPage || _hasParams;

      return {
        engaged:    engaged,
        lastPage:   lastPage,
        lastParams: lastParams,
        inProgress: inProgress,
        hasHistory: hasHistory
      };
    },

    /**
     * Build a personalization context block for systemPrompt injection.
     * Returns an empty string when no history exists — complete no-op for new users.
     *
     * Injects up to four advisory sections:
     *   1. PREFERRED CATEGORIES  — AI should prioritize these in suggestions
     *   2. LAST ACTIVE PAGE      — AI can offer to continue prior work
     *   3. PRE-FILL HINT         — AI may reference prior session params in its intro
     *   4. IN-PROGRESS           — AI may suggest revisiting viewed but unactioned resources
     *
     * @returns {string}  Formatted prompt block, or '' if no history
     */
    buildPromptBlock: function() {
      var s = Personalization.getSignals();
      if (!s.hasHistory) return '';

      var block = '\n\n## VETERAN ENGAGEMENT HISTORY (PERSONALIZATION)\n' +
        'Use the context below to personalize suggestions. ' +
        'RULES: Do NOT override user input. Do NOT remove any options from results. ' +
        'All guidance is advisory — prefer, suggest, and offer; never force or auto-navigate.';

      // 1. Category affinity — steer AI toward previously engaged skill areas
      if (s.engaged.length > 0) {
        block += '\n\nPREFERRED CATEGORIES (sorted by engagement): ' + s.engaged.join(', ') + '.' +
          ' When proposing next steps, suggest these areas first where contextually relevant.';
      }

      // 2. Last session page — offer natural continuation
      if (s.lastPage) {
        var _pl = _P10_PAGE_LABELS[s.lastPage];
        block += '\n\nLAST ACTIVE PAGE: ' + _pl + '.';
        if (s.lastParams && s.lastParams.intent) {
          block += ' Previous intent: "' + s.lastParams.intent + '".';
        }
        block += ' If the conversation leads naturally, offer to return to ' + _pl +
          ' or build on what was started. Only suggest — do NOT auto-navigate.';
      }

      // 3. Pre-fill hint — inform the AI of prior session params.
      // D3 FIX: Section 2 already emitted lastParams.intent when s.lastPage is set.
      // Skip intent here to avoid duplication; only include skill (which section 2 never shows).
      if (s.lastParams && (s.lastParams.intent || s.lastParams.skill)) {
        var _pf = [];
        if (s.lastParams.intent && !s.lastPage) _pf.push('intent: ' + s.lastParams.intent);
        if (s.lastParams.skill)                 _pf.push('skill: '  + s.lastParams.skill);
        if (_pf.length > 0) {
          block += '\n\nPRE-FILL HINT: The veteran\'s previous session context was (' + _pf.join(', ') + ').' +
            ' You may reference this when introducing or returning to the relevant execution page.';
        }
      }

      // 4. In-progress resources — soft "continue" suggestion
      if (s.inProgress.length > 0) {
        block += '\n\nIN-PROGRESS (viewed but not yet actioned): ' + s.inProgress.join(', ') + '.' +
          ' Where contextually appropriate, you may say: "You may also want to continue with [resource]."' +
          ' Only surface this when relevant to the current conversation — do not insert into every response.';
      }

      return block;
    }

  };

  window.AIOS.Personalization = Personalization;

})();
