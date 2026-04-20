/* ══════════════════════════════════════════════════════════
   AIOS — Response Intelligence Layer (RIL)
   Response Shaper — Core Engine  (Phase E-B)

   Deterministic post-processing engine.
   Reads: routing | envelope | profile | session | RESPONSE_CATALOG
   Returns: { text, slotsUsed, toneMode, trace }

   DESIGN CONTRACT:
     - No randomness. No Date.now(). No external calls.
     - No hardcoded response text outside error tokens.
     - Pure function of inputs: identical inputs → identical output.
     - Protected fields ({{protected:X}}) pass through verbatim;
       no transformation, rounding, or abbreviation permitted.
     - One question per response (MISSING_FIELD suppresses CLOSER).
     - Slot order is fixed: PREFIX → ANSWER → REASONING →
       ACTION → MISSING_FIELD → CLOSER.

   SUPPORTED INTENTS (Phase E-B):
     PACT_ACT | VA_HEALTHCARE | HOUSING_SUPPORT

   UNSUPPORTED INTENTS → safe fallback { text:'', fallback:true }

   INTEGRATION: NOT YET (Phase E-C). Feature-flagged.
   EXPOSE: window.AIOS.ResponseShaper.shapeResponse(input)
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';


  /* ────────────────────────────────────────────────────────
     Constants
     ──────────────────────────────────────────────────────── */

  /** Intents handled by this phase. All others return fallback. */
  var _SUPPORTED = {
    PACT_ACT:       1,
    VA_HEALTHCARE:  1,
    HOUSING_SUPPORT: 1
  };

  /**
   * Fixed slot evaluation order.
   * Engine NEVER permutes this array.
   */
  var _SLOT_ORDER = [
    'PREFIX',
    'ANSWER',
    'REASONING',
    'ACTION',
    'MISSING_FIELD',
    'CLOSER'
  ];

  /**
   * Which tone modes may populate each slot.
   * If a tone is absent from a slot's map, that slot is
   * silently skipped for that tone — no fallback attempted.
   */
  var _SLOT_MODES = {
    PREFIX:        { CRISIS: 1, AT_RISK: 1, GUIDED: 1, CONFIDENT: 1 },
    ANSWER:        { CRISIS: 1, AT_RISK: 1, URGENT_ACTION: 1,
                     GUIDED: 1, ADVISORY: 1, CONFIDENT: 1 },
    REASONING:     { URGENT_ACTION: 1, GUIDED: 1, ADVISORY: 1, CONFIDENT: 1 },
    ACTION:        { CRISIS: 1, AT_RISK: 1, URGENT_ACTION: 1,
                     GUIDED: 1, ADVISORY: 1, CONFIDENT: 1 },
    MISSING_FIELD: { URGENT_ACTION: 1, GUIDED: 1, ADVISORY: 1, CONFIDENT: 1 },
    CLOSER:        { ADVISORY: 1, CONFIDENT: 1 }
  };

  /**
   * Maximum number of ACTION items to surface per tone.
   * CRISIS / AT_RISK / URGENT_ACTION: exactly 1 (safety-first).
   * All others: up to 3.
   */
  var _ACTION_COUNT = {
    CRISIS:        1,
    AT_RISK:       1,
    URGENT_ACTION: 1,
    GUIDED:        3,
    ADVISORY:      3,
    CONFIDENT:     3
  };

  /**
   * Profile fields counted when evaluating GUIDED / CONFIDENT thresholds.
   * Conditions handled separately (array length check).
   */
  var _PROFILE_FIELDS = [
    'branch', 'serviceEra', 'dischargeStatus', 'vaRating',
    'employmentStatus', 'income', 'state', 'dependents', 'exposureContext'
  ];

  /**
   * Default form numbers injected into data map per intent.
   * These are NOT protected values; they flow through {{formNumber}}.
   * Actual protected form numbers must come from the skill envelope.
   */
  var _DEFAULT_FORM = {
    PACT_ACT:        '21-526EZ',
    VA_HEALTHCARE:   '10-10EZ',
    HOUSING_SUPPORT: ''
  };

  /** Token used when a {{protected:X}} field is missing from the data map. */
  var _MISSING_PROTECTED_TOKEN = '[pending]';


  /* ────────────────────────────────────────────────────────
     Private helpers
     ──────────────────────────────────────────────────────── */

  /**
   * Count populated fields in the profile object.
   * Used to determine GUIDED (≤ 2) vs CONFIDENT (≥ 5) thresholds.
   * @param  {Object} profile
   * @returns {number}
   */
  function _countProfileFields(profile) {
    if (!profile) return 0;
    var count = 0;
    for (var i = 0; i < _PROFILE_FIELDS.length; i++) {
      var v = profile[_PROFILE_FIELDS[i]];
      if (v !== null && v !== undefined && v !== '') count++;
    }
    if (profile.conditions && Array.isArray(profile.conditions) &&
        profile.conditions.length > 0) {
      count++;
    }
    return count;
  }

  /**
   * Return true if the skill envelope signals urgent action is required.
   * Checks urgencyLevel, URGENT-priority next-actions, and daysUntilDeadline.
   * @param  {Object} envelope
   * @returns {boolean}
   */
  function _hasUrgentSignal(envelope) {
    if (!envelope) return false;

    // Explicit urgency field (housing skill)
    if (envelope.housingResult && envelope.housingResult.urgencyLevel === 'high') {
      return true;
    }

    // Deadline proximity
    if (typeof envelope.daysUntilDeadline === 'number' &&
        envelope.daysUntilDeadline <= 14) {
      return true;
    }

    // Any next-action flagged URGENT (Phase C housing injection)
    var actions = _extractNextActions(envelope);
    for (var i = 0; i < actions.length; i++) {
      if (actions[i] && actions[i].priority === 'URGENT') return true;
    }

    return false;
  }

  /**
   * Pull next-action array from whichever skill result envelope is present.
   * @param  {Object} envelope
   * @returns {Array}
   */
  function _extractNextActions(envelope) {
    if (!envelope) return [];
    if (envelope.pactResult && Array.isArray(envelope.pactResult.nextActions)) {
      return envelope.pactResult.nextActions;
    }
    if (envelope.healthcareResult && Array.isArray(envelope.healthcareResult.nextActions)) {
      return envelope.healthcareResult.nextActions;
    }
    if (envelope.housingResult && Array.isArray(envelope.housingResult.nextActions)) {
      return envelope.housingResult.nextActions;
    }
    if (Array.isArray(envelope.nextActions)) return envelope.nextActions;
    return [];
  }

  /**
   * Build a human-readable symptom context string from session.symptoms.
   * Used as fallback when the skill has not set envelope.sessionSymptomContext.
   * @param  {Object} session
   * @returns {string}
   */
  function _buildSymptomSummary(session) {
    if (!session || !Array.isArray(session.symptoms) || !session.symptoms.length) {
      return '';
    }
    var parts = [];
    for (var i = 0; i < session.symptoms.length; i++) {
      if (session.symptoms[i] && session.symptoms[i].token) {
        parts.push(session.symptoms[i].token);
      }
    }
    return parts.join(', ');
  }

  /**
   * Build the flat interpolation data map from all input sources.
   * This is the single source of truth for placeholder values.
   * Called once per slot fill.
   *
   * Separation of concerns:
   *   - profile fields → direct copy
   *   - skill result fields → extracted from the appropriate sub-envelope
   *   - session signals → lastActiveSkill, turnCount
   *   - routing metadata → intent, confidence
   *   - static hotline numbers → injected here for convenience
   *
   * @param  {Object} routing
   * @param  {Object} envelope
   * @param  {Object} profile
   * @param  {Object} session
   * @returns {Object} flat key-value data map
   */
  function _buildDataMap(routing, envelope, profile, session) {
    var intent = routing ? (routing.intent || '') : '';
    var data   = {};

    /* ── Routing ─────────────────────────────────────── */
    data.intent     = intent;
    data.confidence = routing ? (routing.confidence || '') : '';
    data.matched    = routing ? (routing.matched    || '') : '';

    /* ── Profile fields ──────────────────────────────── */
    if (profile) {
      // vaRating is protected — stored as-is (number or string)
      data.vaRating         = (profile.vaRating !== null && profile.vaRating !== undefined)
        ? String(profile.vaRating) : '';
      data.serviceEra       = profile.serviceEra       || '';
      data.branch           = profile.branch           || '';
      data.dischargeStatus  = profile.dischargeStatus  || '';
      data.employmentStatus = profile.employmentStatus || '';
      data.state            = profile.state            || '';
      data.income           = (profile.income !== null && profile.income !== undefined)
        ? String(profile.income) : '';
    }

    /* ── Default form number (non-protected, by intent) ─ */
    data.formNumber = _DEFAULT_FORM[intent] || '';

    /* ── Static hotline numbers (protected) ─────────────
       These are treated as protected fields because they
       must NEVER be abbreviated or transformed.           */
    data.hotlineVAHousing = '1-877-4AID-VET (1-877-424-3838)';
    data.hotlineCrisis    = '988, press 1';
    data.hotlineVAMain    = '1-800-827-1000';
    data.hotlineVAHealth  = '1-877-222-8387';

    /* ── Skill result fields ─────────────────────────── */
    if (envelope) {

      /* PACT_ACT */
      if (envelope.pactResult) {
        var pr = envelope.pactResult;
        data.exposureType      = pr.exposureType      || '';
        data.eligibilityStatus = pr.eligibilityStatus || '';
        data.diagnosisStatus   = pr.diagnosisStatus   || '';
        // Override default form number if skill returns a specific one
        if (pr.formNumber) data.formNumber = pr.formNumber;
      }

      /* VA_HEALTHCARE */
      if (envelope.healthcareResult) {
        var hcr = envelope.healthcareResult;
        data.priorityGroup    = hcr.probablePriorityGroup    || '';
        data.enrollmentStatus = hcr.probableEnrollmentStatus || '';
        data.carePath         = hcr.carePath                 || '';
        data.dentalStatus     = hcr.dentalStatus             || '';
        if (hcr.formNumber) data.formNumber = hcr.formNumber;
      }

      /* HOUSING_SUPPORT */
      if (envelope.housingResult) {
        var hor = envelope.housingResult;
        data.housingTrack    = hor.housingTrack    || '';
        data.assistanceType  = hor.assistanceType  || '';
        data.loanEligibility = hor.loanEligibility || '';
        data.urgencyLevel    = hor.urgencyLevel    || '';
      }

      /* Common envelope fields */
      data.deadline = envelope.deadline || '';
      data.daysUntilDeadline = (typeof envelope.daysUntilDeadline === 'number')
        ? String(envelope.daysUntilDeadline) : '';

      /* Session symptom context (set by VA_HEALTHCARE Phase C injection).
         Falls back to a built summary, then a safe default.             */
      data.sessionSymptomContext =
        envelope.sessionSymptomContext         ||
        _buildSymptomSummary(session)          ||
        'symptoms shared earlier in this conversation';
    }

    /* ── Session fields ──────────────────────────────── */
    if (session) {
      data.lastActiveSkill = session.lastActiveSkill || '';
      data.turnCount = (typeof session.turnCount === 'number')
        ? session.turnCount : 0;
    }

    return data;
  }

  /**
   * Deterministic template index selection.
   * Cycles through available templates using turnCount.
   * Same turnCount always produces the same index.
   * @param  {Array}  arr
   * @param  {number} turnCount
   * @returns {string|null}
   */
  function _pickTemplate(arr, turnCount) {
    if (!arr || !arr.length) return null;
    var tc  = (typeof turnCount === 'number' && !isNaN(turnCount)) ? turnCount : 0;
    var idx = tc % arr.length;
    return arr[idx] || null;
  }


  /* ────────────────────────────────────────────────────────
     Core engine functions (exposed for Phase E-D testing)
     ──────────────────────────────────────────────────────── */

  /**
   * _enforceProtectedFields
   * Replace {{protected:X}} placeholders with verbatim string values
   * from the data map. No transformation, formatting, or rounding
   * is applied. If a protected field is absent from the data map,
   * inserts _MISSING_PROTECTED_TOKEN so the gap is visible in output.
   *
   * Called BEFORE _interpolate — processes protected tokens first so
   * standard interpolation cannot inadvertently alter them.
   *
   * @param  {string} template
   * @param  {Object} data     — flat data map from _buildDataMap
   * @returns {{ text: string, used: string[] }}
   */
  function _enforceProtectedFields(template, data) {
    if (!template || typeof template !== 'string') {
      return { text: '', used: [] };
    }

    var used = [];

    var text = template.replace(/\{\{protected:([^}]+)\}\}/g, function (match, field) {
      var val = (data && data[field] !== undefined &&
                 data[field] !== null && data[field] !== '')
        ? String(data[field])
        : null;

      if (val !== null) {
        used.push(field);
        return val;                          // verbatim — no transform
      }

      // Missing protected value — visible placeholder, never silently omitted
      return _MISSING_PROTECTED_TOKEN;
    });

    return { text: text, used: used };
  }

  /**
   * _interpolate
   * Replace standard {{X}} placeholders (non-protected) with values
   * from the data map. Called AFTER _enforceProtectedFields — by the
   * time this runs, all {{protected:X}} tokens have already been
   * replaced and will not be seen by this function.
   *
   * Missing non-protected values → empty string (silent omission).
   *
   * @param  {string} template — may already have protected tokens replaced
   * @param  {Object} data
   * @returns {string}
   */
  function _interpolate(template, data) {
    if (!template || typeof template !== 'string') return '';

    return template.replace(/\{\{([^}]+)\}\}/g, function (match, field) {
      // Guard: any leftover {{protected:X}} tokens are returned unchanged.
      // This should not happen in normal flow but prevents accidental
      // transformation of a protected value if called out of order.
      if (field.indexOf('protected:') === 0) return match;

      var val = (data && data[field] !== undefined && data[field] !== null)
        ? String(data[field])
        : '';

      return val;
    });
  }

  /**
   * _selectToneMode
   * Deterministic six-level precedence ladder.
   * First matching condition wins. No ties possible.
   *
   * Precedence:
   *   1. CRISIS        — routing.tier === 'CRISIS' or CRISIS_SUPPORT intent
   *   2. AT_RISK       — routing.tier === 'AT_RISK' or active atRiskSignal
   *   3. URGENT_ACTION — envelope carries deadline ≤ 14d, URGENT action, or high urgency
   *   4. CONFIDENT     — turnCount ≥ 5, profileFields ≥ 5, lastActiveSkill present
   *   5. GUIDED        — turnCount ≤ 2, profileFields ≤ 2, no lastActiveSkill
   *   6. ADVISORY      — default
   *
   * @param  {Object} routing
   * @param  {Object} envelope
   * @param  {Object} profile
   * @param  {Object} session
   * @returns {string} tone mode constant
   */
  function _selectToneMode(routing, envelope, profile, session) {

    /* ── 1. CRISIS ──────────────────────────────────────── */
    if (routing) {
      if (routing.tier === 'CRISIS' || routing.intent === 'CRISIS_SUPPORT') {
        return 'CRISIS';
      }
    }

    /* ── 2. AT_RISK ─────────────────────────────────────── */
    if (routing && routing.tier === 'AT_RISK') return 'AT_RISK';
    if (session && session.atRiskSignal && session.atRiskSignal.flagged === true) {
      return 'AT_RISK';
    }

    /* ── 3. URGENT_ACTION ───────────────────────────────── */
    if (_hasUrgentSignal(envelope)) return 'URGENT_ACTION';

    /* ── 4. CONFIDENT ───────────────────────────────────── */
    // Repeat user: deep session, populated profile, recent skill context
    if (session &&
        session.turnCount >= 5 &&
        _countProfileFields(profile) >= 5 &&
        session.lastActiveSkill !== null &&
        session.lastActiveSkill !== undefined) {
      return 'CONFIDENT';
    }

    /* ── 5. GUIDED ──────────────────────────────────────── */
    // First-time user: early session, sparse profile, no skill history
    if (session &&
        session.turnCount <= 2 &&
        _countProfileFields(profile) <= 2 &&
        (session.lastActiveSkill === null ||
         session.lastActiveSkill === undefined)) {
      return 'GUIDED';
    }

    /* ── 6. ADVISORY (default) ──────────────────────────── */
    return 'ADVISORY';
  }

  /**
   * _selectSlots
   * Return the ordered array of slot IDs valid for the given tone mode.
   * Slot order is always fixed (_SLOT_ORDER). Tone-ineligible slots
   * are excluded. The envelope parameter is reserved for future dynamic
   * exclusions (e.g., REASONING collapse for URGENT_ACTION UI layer).
   *
   * @param  {string} toneMode
   * @param  {Object} envelope  — reserved, not used in Phase E-B
   * @returns {string[]}
   */
  function _selectSlots(toneMode, envelope) {
    var result = [];
    for (var i = 0; i < _SLOT_ORDER.length; i++) {
      var slotId = _SLOT_ORDER[i];
      if (_SLOT_MODES[slotId] && _SLOT_MODES[slotId][toneMode]) {
        result.push(slotId);
      }
    }
    return result;
  }

  /**
   * _fillActionSlot
   * Internal helper. Fills the ACTION slot with 1 or 3 catalog templates
   * depending on tone. For single-action tones (CRISIS/AT_RISK/URGENT_ACTION),
   * selects one template deterministically via turnCount. For multi-action
   * tones (GUIDED/ADVISORY/CONFIDENT), uses all templates in catalog order
   * (0, 1, 2) for consistent output regardless of turn.
   *
   * @param  {Array}  templates — catalog templates for this tone
   * @param  {string} toneMode
   * @param  {string} intent
   * @param  {Object} data      — interpolation data map
   * @param  {number} turnCount
   * @returns {{ slotId, text, templateKey, protectedFields } | null}
   */
  function _fillActionSlot(templates, toneMode, intent, data, turnCount) {
    if (!templates || !templates.length) return null;

    var maxActions  = _ACTION_COUNT[toneMode] || 1;
    var lines       = [];
    var keys        = [];
    var pFields     = [];

    if (maxActions === 1) {
      /* Single action — vary by turnCount for deterministic per-turn selection */
      var idx = turnCount % templates.length;
      var raw = templates[idx];
      if (!raw) return null;
      var pr  = _enforceProtectedFields(raw, data);
      lines.push(_interpolate(pr.text, data));
      pFields = pFields.concat(pr.used);
      keys.push(intent + '.ACTION.' + toneMode + '[' + idx + ']');

    } else {
      /* Multiple actions — always in catalog order for consistent output */
      var count = Math.min(maxActions, templates.length);
      for (var i = 0; i < count; i++) {
        var t = templates[i];
        if (!t) continue;
        var pr2 = _enforceProtectedFields(t, data);
        lines.push(_interpolate(pr2.text, data));
        pFields = pFields.concat(pr2.used);
        keys.push(intent + '.ACTION.' + toneMode + '[' + i + ']');
      }
    }

    if (!lines.length) return null;

    /* Format: single line for 1 action; numbered list for multiple */
    var text = (lines.length === 1)
      ? lines[0]
      : lines.map(function (l, n) { return (n + 1) + '. ' + l; }).join('\n');

    return {
      slotId:          'ACTION',
      text:            text,
      templateKey:     keys.join(', '),
      protectedFields: pFields
    };
  }

  /**
   * _fillMissingFieldSlot
   * Internal helper. Selects exactly one field to ask about.
   * Selection: first field in REQUIRED_PRIORITY[] that appears
   * in envelope.unknownFields[]. Returns null if no match.
   *
   * @param  {string} intent
   * @param  {Object} envelope
   * @param  {Object} cat       — RESPONSE_CATALOG
   * @param  {Object} data      — interpolation data map
   * @param  {number} turnCount
   * @returns {{ slotId, text, templateKey, protectedFields, field } | null}
   */
  function _fillMissingFieldSlot(intent, envelope, cat, data, turnCount) {
    var mf = cat[intent] && cat[intent].MISSING_FIELD;
    if (!mf || !mf.REQUIRED_PRIORITY || !mf.FIELDS) return null;

    var unknown = (envelope && Array.isArray(envelope.unknownFields))
      ? envelope.unknownFields : [];
    if (!unknown.length) return null;

    /* Find first priority field present in unknownFields */
    var selectedField = null;
    for (var i = 0; i < mf.REQUIRED_PRIORITY.length; i++) {
      if (unknown.indexOf(mf.REQUIRED_PRIORITY[i]) !== -1) {
        selectedField = mf.REQUIRED_PRIORITY[i];
        break;
      }
    }

    if (!selectedField || !mf.FIELDS[selectedField]) return null;

    var templates = mf.FIELDS[selectedField];
    var raw       = _pickTemplate(templates, turnCount);
    if (!raw) return null;

    var pr   = _enforceProtectedFields(raw, data);
    var text = _interpolate(pr.text, data);
    var idx  = turnCount % templates.length;

    return {
      slotId:          'MISSING_FIELD',
      text:            text,
      templateKey:     intent + '.MISSING_FIELD.FIELDS.' + selectedField + '[' + idx + ']',
      protectedFields: pr.used,
      field:           selectedField   // surfaced in trace for observability
    };
  }

  /**
   * _fillSlot
   * Resolve one slot to its filled representation.
   * Returns null if the slot cannot be filled (missing catalog entry,
   * empty template, or disallowed for this tone mode).
   *
   * @param  {string} slotId
   * @param  {string} toneMode
   * @param  {Object} routing
   * @param  {Object} envelope
   * @param  {Object} profile
   * @param  {Object} session
   * @returns {{ slotId, text, templateKey, protectedFields } | null}
   */
  function _fillSlot(slotId, toneMode, routing, envelope, profile, session) {
    var cat    = window.AIOS && window.AIOS.ResponseCatalog;
    var intent = routing ? routing.intent : null;

    if (!cat || !intent || !cat[intent]) return null;
    if (!cat[intent][slotId])            return null;

    var data      = _buildDataMap(routing, envelope, profile, session);
    var turnCount = (session && typeof session.turnCount === 'number')
      ? session.turnCount : 0;

    /* ── MISSING_FIELD: delegate to dedicated helper ── */
    if (slotId === 'MISSING_FIELD') {
      return _fillMissingFieldSlot(intent, envelope, cat, data, turnCount);
    }

    /* ── ACTION: delegate to dedicated helper ─────── */
    if (slotId === 'ACTION') {
      var actionCat = cat[intent].ACTION;
      if (!actionCat || !actionCat[toneMode]) return null;
      return _fillActionSlot(actionCat[toneMode], toneMode, intent, data, turnCount);
    }

    /* ── Standard single-template slots ───────────── */
    var slotCat   = cat[intent][slotId];
    var templates = slotCat[toneMode];

    if (!templates || !Array.isArray(templates) || !templates.length) return null;

    var raw = _pickTemplate(templates, turnCount);
    if (!raw) return null;

    /* Two-phase interpolation:
       1. _enforceProtectedFields — {{protected:X}} verbatim
       2. _interpolate            — {{X}} standard              */
    var pResult = _enforceProtectedFields(raw, data);
    var text    = _interpolate(pResult.text, data);

    var idx     = turnCount % templates.length;
    var tplKey  = intent + '.' + slotId + '.' + toneMode + '[' + idx + ']';

    return {
      slotId:          slotId,
      text:            text,
      templateKey:     tplKey,
      protectedFields: pResult.used
    };
  }

  /**
   * _assemble
   * Join filled slots into the final response string.
   * Enforces the one-question rule: if MISSING_FIELD produced text,
   * CLOSER is suppressed.
   * Slots with empty or null text are silently omitted.
   * Slots are joined with double newlines (paragraph breaks).
   *
   * @param  {{ slotId:string, text:string }[]} filledSlots
   * @returns {string}
   */
  function _assemble(filledSlots) {
    if (!filledSlots || !filledSlots.length) return '';

    /* One-question rule: check for MISSING_FIELD presence */
    var hasMissingField = false;
    for (var i = 0; i < filledSlots.length; i++) {
      if (filledSlots[i] && filledSlots[i].slotId === 'MISSING_FIELD') {
        hasMissingField = true;
        break;
      }
    }

    var parts = [];
    for (var j = 0; j < filledSlots.length; j++) {
      var s = filledSlots[j];
      if (!s || !s.text || !s.text.trim()) continue;       // omit empty
      if (hasMissingField && s.slotId === 'CLOSER') continue; // one-question rule
      parts.push(s.text.trim());
    }

    return parts.join('\n\n');
  }


  /* ────────────────────────────────────────────────────────
     Public entry point
     ──────────────────────────────────────────────────────── */

  /**
   * shapeResponse
   * Deterministic assembly pipeline.
   *
   * Pipeline:
   *   1. Validate input + intent
   *   2. Select tone mode
   *   3. Select ordered slot list
   *   4. Fill each slot from catalog
   *   5. Assemble text (one-question rule applied)
   *   6. Build trace
   *   7. Emit console trace
   *   8. Return { text, slotsUsed, toneMode, trace }
   *
   * @param  {{ routing, envelope, profile, session }} input
   * @returns {{ text: string, slotsUsed: string[],
   *             toneMode: string, trace: Object }}
   */
  function shapeResponse(input) {

    /* ── Guard: input object ──────────────────────────── */
    if (!input || typeof input !== 'object') {
      return {
        text:      '',
        slotsUsed: [],
        toneMode:  'ADVISORY',
        trace:     { fallback: true, reason: 'invalid input' }
      };
    }

    var routing  = input.routing  || {};
    var envelope = input.envelope || {};
    var profile  = input.profile  || {};
    var session  = input.session  || {};
    var intent   = routing.intent;

    /* ── Guard: unsupported skill ─────────────────────── */
    if (!intent || !_SUPPORTED[intent]) {
      return {
        text:      '',
        slotsUsed: [],
        toneMode:  'ADVISORY',
        trace:     {
          fallback: true,
          reason:   'unsupported intent: ' + (intent || 'none')
        }
      };
    }

    /* ── Guard: catalog must be loaded ───────────────── */
    var cat = window.AIOS && window.AIOS.ResponseCatalog;
    if (!cat || !cat[intent]) {
      return {
        text:      '',
        slotsUsed: [],
        toneMode:  'ADVISORY',
        trace:     {
          fallback: true,
          reason:   'ResponseCatalog not loaded or missing intent: ' + intent
        }
      };
    }

    /* ── 1. Select tone mode ──────────────────────────── */
    var toneMode = _selectToneMode(routing, envelope, profile, session);

    /* ── 2. Select slots ─────────────────────────────── */
    var slots = _selectSlots(toneMode, envelope);

    /* ── 3. Fill each slot ───────────────────────────── */
    var filledSlots     = [];
    var slotsUsed       = [];
    var templateKeys    = {};
    var allProtected    = [];

    for (var i = 0; i < slots.length; i++) {
      var slotId = slots[i];
      var filled = _fillSlot(slotId, toneMode, routing, envelope, profile, session);

      if (filled && filled.text && filled.text.trim()) {
        filledSlots.push(filled);
        slotsUsed.push(slotId);
        templateKeys[slotId] = filled.templateKey;

        if (filled.protectedFields && filled.protectedFields.length) {
          allProtected = allProtected.concat(filled.protectedFields);
        }
      }
    }

    /* ── 4. Assemble text ────────────────────────────── */
    var text = _assemble(filledSlots);

    /* ── 4a. Post-filter slotsUsed — one-Q rule sync ────
       _assemble() suppresses CLOSER when MISSING_FIELD is
       present. Mirror that here so slotsUsed accurately
       reflects what was rendered, not what was filled.   */
    if (slotsUsed.indexOf('MISSING_FIELD') !== -1) {
      slotsUsed = slotsUsed.filter(function(s) { return s !== 'CLOSER'; });
      delete templateKeys['CLOSER'];
    }

    /* ── 5. De-duplicate protected field list ────────── */
    var seen     = {};
    var uniquePF = [];
    for (var p = 0; p < allProtected.length; p++) {
      if (!seen[allProtected[p]]) {
        seen[allProtected[p]] = 1;
        uniquePF.push(allProtected[p]);
      }
    }

    /* ── 6. Build trace object ───────────────────────── */
    var trace = {
      toneMode:       toneMode,
      slotsUsed:      slotsUsed,
      templateKeys:   templateKeys,
      protectedFields:uniquePF
    };

    /* ── 7. Emit deterministic console trace ─────────── */
    var tplList = slotsUsed.map(function (k) {
      return templateKeys[k] || k;
    }).join(', ');

    console.log(
      '[AIOS][RIL][SHAPE] tone:' + toneMode +
      ' slots:[' + slotsUsed.join(',') + ']' +
      ' templates:[' + tplList + ']' +
      ' protected:[' + uniquePF.join(',') + ']'
    );

    /* ── 8. Return ───────────────────────────────────── */
    return {
      text:      text,
      slotsUsed: slotsUsed,
      toneMode:  toneMode,
      trace:     trace
    };
  }


  /* ────────────────────────────────────────────────────────
     Expose on window.AIOS namespace
     Internal functions exposed for Phase E-D testing only.
     ──────────────────────────────────────────────────────── */
  window.AIOS = window.AIOS || {};
  window.AIOS.ResponseShaper = {

    /* ── Public API ──────────────────────────────────── */
    shapeResponse: shapeResponse,

    /* ── Internals (Phase E-D test access) ───────────── */
    _selectToneMode:         _selectToneMode,
    _selectSlots:            _selectSlots,
    _fillSlot:               _fillSlot,
    _interpolate:            _interpolate,
    _enforceProtectedFields: _enforceProtectedFields,
    _assemble:               _assemble
  };

}());
