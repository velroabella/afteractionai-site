/* ══════════════════════════════════════════════════════════
   AfterAction AI — AIOS Checklist Manager
   PHASE 3.3 — Checklist Lifecycle Upgrade

   Manages in-memory state for the active checklist:
     _dbIdMap         — DOM sort_order/index → case_checklist_items.id
     _statusMap       — DOM sort_order/index → status string
     _activeMissionId — DB UUID of mission whose items are loaded

   All DB calls delegate to window.AAAI.DataAccess.checklistItems.
   DB is the authoritative render/restore source on session load (Phase 5).
   localStorage is the fallback when DB is unreachable or has no rows.

   Registers: window.AIOS.Checklist
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  if (!window.AIOS) window.AIOS = {};

  /* ── Private state ────────────────────────────────────── */
  var _dbIdMap         = {};    // DOM index → case_checklist_items.id
  var _statusMap       = {};    // DOM index → status string
  var _activeMissionId = null;  // DB UUID of mission currently loaded

  var ChecklistManager = {};

  /* ──────────────────────────────────────────────────────
     BUILD — populate maps from a DB row array.
     Call after saveBatch() or listByMission() returns rows.
     rows must have { id, sort_order?, status? }
  ────────────────────────────────────────────────────── */
  ChecklistManager.buildDbIds = function(rows, missionId) {
    _dbIdMap   = {};
    _statusMap = {};
    if (!rows || !rows.length) return;
    rows.forEach(function(row, i) {
      var idx = (row.sort_order !== undefined && row.sort_order !== null)
        ? row.sort_order : i;
      _dbIdMap[idx]   = row.id;
      _statusMap[idx] = row.status || 'not_started';
    });
    if (missionId) _activeMissionId = missionId;
  };

  /* ──────────────────────────────────────────────────────
     RESTORE — reload maps from DB after page reload.
     Fires when Mission._dbId is known but _dbIdMap is empty.
  ────────────────────────────────────────────────────── */
  ChecklistManager.restoreFromDB = function(missionId) {
    if (!missionId) {
      return Promise.resolve({ data: null, error: 'No missionId' });
    }
    if (!window.AAAI || !window.AAAI.DataAccess) {
      return Promise.resolve({ data: null, error: 'DataAccess not ready' });
    }
    return window.AAAI.DataAccess.checklistItems.listByMission(missionId)
      .then(function(result) {
        if (!result.error && result.data && result.data.length) {
          ChecklistManager.buildDbIds(result.data, missionId);
        }
        return result;
      });
  };

  /* ──────────────────────────────────────────────────────
     TRANSITION — move a single item to a new lifecycle status.
     Routes to the correct DA method based on state direction.
       completed             → DA.toggle(id, true)
       completed→not_started → DA.reopen(id)
       any other             → DA.updateStatus(id, status)
  ────────────────────────────────────────────────────── */
  ChecklistManager.transition = function(idx, newStatus) {
    var dbId = _dbIdMap[idx];
    if (!dbId) {
      return Promise.resolve({ data: null, error: 'No DB id for index ' + idx });
    }
    if (!window.AAAI || !window.AAAI.DataAccess) {
      return Promise.resolve({ data: null, error: 'DataAccess not ready' });
    }
    var DA = window.AAAI.DataAccess.checklistItems;
    // Phase R: resolve DA method + retry context label before calling withRetry
    var _retryFn;
    var _retryCtx;
    if (newStatus === 'completed') {
      _retryFn  = function() { return DA.toggle(dbId, true); };
      _retryCtx = 'checklist.toggle';
    } else if (newStatus === 'not_started' && _statusMap[idx] === 'completed') {
      _retryFn  = function() { return DA.reopen(dbId); };
      _retryCtx = 'checklist.reopen';
    } else {
      _retryFn  = function() { return DA.updateStatus(dbId, newStatus); };
      _retryCtx = 'checklist.updateStatus';
    }
    // Use withRetry if available (registered by app.js at load time); fall back to direct call.
    var _retry = (window.AAAI && window.AAAI.withRetry) || function(fn) { return fn(); };
    var promise = _retry(_retryFn, _retryCtx);
    return promise.then(function(result) {
      if (!result.error) {
        _statusMap[idx] = newStatus;
      }
      return result;
    });
  };

  /* ── Convenience shorthands ── */
  ChecklistManager.reopen = function(idx) {
    return ChecklistManager.transition(idx, 'not_started');
  };

  /* ──────────────────────────────────────────────────────
     PROGRESS — async DB-authoritative count.
     Returns { data: {total, completed, skipped, in_progress, pct}, error }
  ────────────────────────────────────────────────────── */
  ChecklistManager.getProgress = function() {
    if (!_activeMissionId) {
      return Promise.resolve({ data: null, error: 'No active mission' });
    }
    if (!window.AAAI || !window.AAAI.DataAccess) {
      return Promise.resolve({ data: null, error: 'DataAccess not ready' });
    }
    return window.AAAI.DataAccess.checklistItems.getProgress(_activeMissionId);
  };

  /* ── Accessors ── */
  ChecklistManager.getDbId = function(idx) {
    return _dbIdMap[idx] || null;
  };

  ChecklistManager.getStatus = function(idx) {
    return _statusMap[idx] || 'not_started';
  };

  ChecklistManager.getActiveMissionId = function() {
    return _activeMissionId;
  };

  ChecklistManager.hasDbIds = function() {
    return Object.keys(_dbIdMap).length > 0;
  };

  /* ── Reset on sign-out ── */
  ChecklistManager.reset = function() {
    _dbIdMap         = {};
    _statusMap       = {};
    _activeMissionId = null;
  };

  window.AIOS.Checklist = ChecklistManager;

})();
