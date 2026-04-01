/* ══════════════════════════════════════════════════════════
   AfterAction AI — AIOS Document Lifecycle Manager
   PHASE 3.5 — Document Lifecycle

   Manages lifecycle states for uploaded documents, handles
   mission linking/unlinking, and assembles pre-fill data
   from extracted document fields + AIOS Memory.

   Lifecycle states:
     uploaded → processed → reviewed → action_required
                                ↗
     (action_required → reviewed → processed)

   Public API (window.AIOS.DocumentLifecycle):
     transition(docId, newStatus)  → Promise<{data,error}>
     link(docId, missionId)        → Promise<{data,error}>
     unlink(docId)                 → Promise<{data,error}>
     buildPrefill(doc)             → Object (sync)
     listForMission(missionId)     → Promise<{data,error}>
     reset()                       → void

   Registers: window.AIOS.DocumentLifecycle
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  if (!window.AIOS) window.AIOS = {};

  /* ── Lifecycle constants ─────────────────────────────── */
  var STATUSES = {
    UPLOADED:         'uploaded',
    PROCESSED:        'processed',
    REVIEWED:         'reviewed',
    ACTION_REQUIRED:  'action_required'
  };

  // Which statuses each state can transition TO
  var VALID_TRANSITIONS = {
    'uploaded':         ['processed', 'action_required'],
    'processed':        ['reviewed', 'action_required'],
    'reviewed':         ['action_required'],
    'action_required':  ['reviewed', 'processed'],
    // legacy — documents saved as 'complete' before Phase 3.5
    'complete':         ['processed', 'reviewed', 'action_required']
  };

  var _ALL_STATUSES = [
    STATUSES.UPLOADED, STATUSES.PROCESSED,
    STATUSES.REVIEWED, STATUSES.ACTION_REQUIRED
  ];

  /* ── Internal helpers ────────────────────────────────── */
  function _da() {
    return (window.AAAI && window.AAAI.DataAccess && window.AAAI.DataAccess.documents)
      ? window.AAAI.DataAccess.documents : null;
  }

  /* ── Public API ─────────────────────────────────────── */
  var DocumentLifecycle = {};

  DocumentLifecycle.STATUSES = STATUSES;

  /**
   * Transition a document to a new lifecycle status.
   * Warns on unknown status but proceeds anyway.
   * Fire-and-forget safe — never throws.
   */
  DocumentLifecycle.transition = function(docId, newStatus) {
    if (!docId) return Promise.resolve({ data: null, error: 'No docId' });
    var da = _da();
    if (!da) return Promise.resolve({ data: null, error: 'DataAccess not ready' });

    if (_ALL_STATUSES.indexOf(newStatus) === -1) {
      console.warn('[DocLifecycle] Unknown status:', newStatus);
    }

    return da.updateStatus(docId, newStatus).catch(function(err) {
      console.warn('[DocLifecycle] transition failed (non-blocking):', err);
      return { data: null, error: err };
    });
  };

  /**
   * Link a document to a mission.
   * Fire-and-forget safe — never throws.
   */
  DocumentLifecycle.link = function(docId, missionId) {
    if (!docId || !missionId) {
      return Promise.resolve({ data: null, error: 'Missing docId or missionId' });
    }
    var da = _da();
    if (!da) return Promise.resolve({ data: null, error: 'DataAccess not ready' });
    return da.linkToMission(docId, missionId).catch(function(err) {
      console.warn('[DocLifecycle] link failed (non-blocking):', err);
      return { data: null, error: err };
    });
  };

  /**
   * Remove a document's mission link.
   * Fire-and-forget safe — never throws.
   */
  DocumentLifecycle.unlink = function(docId) {
    if (!docId) return Promise.resolve({ data: null, error: 'No docId' });
    var da = _da();
    if (!da) return Promise.resolve({ data: null, error: 'DataAccess not ready' });
    return da.unlinkFromMission(docId).catch(function(err) {
      console.warn('[DocLifecycle] unlink failed (non-blocking):', err);
      return { data: null, error: err };
    });
  };

  /**
   * List documents linked to a mission.
   */
  DocumentLifecycle.listForMission = function(missionId) {
    if (!missionId) return Promise.resolve({ data: [], error: null });
    var da = _da();
    if (!da) return Promise.resolve({ data: [], error: 'DataAccess not ready' });
    return da.listByMission(missionId);
  };

  /**
   * Build a pre-fill data object from a document row.
   * Merges extracted document fields (analysis_result) with
   * AIOS Memory profile. Synchronous — never throws.
   *
   * @param {Object} doc — document row from DB
   * @returns {Object} prefill keyed by field name
   */
  DocumentLifecycle.buildPrefill = function(doc) {
    if (!doc) return {};
    var prefill = {};

    // 1. Parse analysis_result (stored as JSON string or parsed object)
    if (doc.analysis_result) {
      try {
        var ar = (typeof doc.analysis_result === 'string')
          ? JSON.parse(doc.analysis_result)
          : doc.analysis_result;

        if (ar && typeof ar === 'object') {
          var knownFields = [
            'branch', 'rank', 'vaRating', 'dischargeStatus',
            'serviceEntryDate', 'separationDate', 'mos', 'conditions',
            'name', 'ssn_last4', 'dob'
          ];
          for (var i = 0; i < knownFields.length; i++) {
            var key = knownFields[i];
            if (ar[key] !== undefined && ar[key] !== null && ar[key] !== '') {
              prefill[key] = ar[key];
            }
          }
        }
      } catch(e) {
        console.warn('[DocLifecycle] buildPrefill: failed to parse analysis_result', e);
      }
    }

    // 2. Fill in gaps from AIOS Memory profile
    if (window.AIOS && window.AIOS.Memory &&
        typeof window.AIOS.Memory.getProfile === 'function') {
      try {
        var mem = window.AIOS.Memory.getProfile() || {};
        if (!prefill.branch          && mem.branch)    prefill.branch          = mem.branch;
        if (!prefill.vaRating        && mem.vaRating)  prefill.vaRating        = mem.vaRating;
        if (!prefill.dischargeStatus && mem.discharge) prefill.dischargeStatus = mem.discharge;
        if (!prefill.name            && mem.name)      prefill.name            = mem.name;
        if (mem.state) prefill.state = mem.state;
        if (mem.era)   prefill.era   = mem.era;
      } catch(e) {
        console.warn('[DocLifecycle] buildPrefill: getProfile() failed', e);
      }
    }

    // 3. Attach doc metadata for downstream template consumers
    prefill._docId     = doc.id            || null;
    prefill._docType   = doc.document_type || null;
    prefill._fileName  = doc.file_name     || null;
    prefill._missionId = doc.mission_id    || null;
    prefill._status    = doc.status        || null;

    return prefill;
  };

  /**
   * Reset internal state. Call on sign-out.
   * Reserved for future phases — no internal state in Phase 3.5.
   */
  DocumentLifecycle.reset = function() {};

  window.AIOS.DocumentLifecycle = DocumentLifecycle;

})();
