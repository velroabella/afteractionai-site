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

  /* ──────────────────────────────────────────────────────
     ADD ITEM — incrementally persist a single checklist item
     to Supabase. Called by voice structured output handler
     and _createMissionWithDefaults. Falls back to localStorage
     queue when DB or mission context is unavailable.
  ────────────────────────────────────────────────────── */
  var _pendingItems = []; // queue for items added before mission._dbId is ready

  ChecklistManager.addItem = function(item) {
    if (!item || !item.title) return;
    var PRIORITY = { immediate: 1, short_term: 2, strategic: 3, optional: 4 };

    // Try to get mission and case IDs from the active AIOS mission
    var missionDbId = _activeMissionId || null;
    var caseId      = null;
    if (!missionDbId && window.AIOS && window.AIOS.Mission && window.AIOS.Mission.current) {
      missionDbId = window.AIOS.Mission.current._dbId || null;
    }
    if (window.AIOS && window.AIOS.Mission && window.AIOS.Mission.current) {
      caseId = window.AIOS.Mission.current._caseId || null;
    }
    // Fallback to app.js _activeCaseId via global
    if (!caseId && window.AAAI && window.AAAI._activeCaseId) {
      caseId = window.AAAI._activeCaseId;
    }

    var row = {
      title:       item.title.substring(0, 200),
      description: item.description || null,
      category:    item.category || 'immediate',
      is_completed: false,
      status:       'not_started',
      sort_order:   Object.keys(_dbIdMap).length + _pendingItems.length,
      priority:     item.priority || PRIORITY[item.category] || 2,
      source:       item.source || 'ai_conversation'
    };

    // If we have both IDs and DataAccess, persist immediately via addSingle
    if (missionDbId && caseId && window.AAAI && window.AAAI.DataAccess &&
        window.AAAI.DataAccess.checklistItems &&
        typeof window.AAAI.DataAccess.checklistItems.addSingle === 'function') {
      window.AAAI.DataAccess.checklistItems.addSingle(caseId, missionDbId, row)
        .then(function(result) {
          if (result.data && result.data.id) {
            var idx = row.sort_order;
            _dbIdMap[idx]   = result.data.id;
            _statusMap[idx] = 'not_started';
            console.log('[AIOS][Checklist] addItem persisted: ' + item.title + ' → id=' + result.data.id);
          } else if (result.error) {
            console.warn('[AIOS][Checklist] addItem DB error:', result.error);
            _pendingItems.push(row);
          }
        }).catch(function(e) {
          console.warn('[AIOS][Checklist] addItem exception:', e.message);
          _pendingItems.push(row);
        });
    } else {
      // Queue for later when mission._dbId becomes available
      _pendingItems.push(row);
    }

    // Also persist to localStorage for immediate visibility on Profile
    try {
      var lsKey = 'aaai_checklist';
      var existing = JSON.parse(localStorage.getItem(lsKey) || '{}');
      if (!existing.items) existing.items = [];
      existing.items.push({ title: row.title, category: row.category, description: row.description });
      if (!existing.completedIndices) existing.completedIndices = [];
      localStorage.setItem(lsKey, JSON.stringify(existing));
    } catch(e) { /* non-critical */ }
  };

  /* ──────────────────────────────────────────────────────
     FLUSH PENDING — persist queued items once mission._dbId is known.
     Called by app.js after mission creation completes.
  ────────────────────────────────────────────────────── */
  ChecklistManager.flushPending = function(missionId, caseId) {
    if (!_pendingItems.length) return Promise.resolve({ flushed: 0 });
    if (!missionId || !caseId) return Promise.resolve({ flushed: 0, error: 'no ids' });
    if (!window.AAAI || !window.AAAI.DataAccess) return Promise.resolve({ flushed: 0, error: 'no DA' });

    _activeMissionId = missionId;
    var items = _pendingItems.splice(0); // drain queue
    return window.AAAI.DataAccess.checklistItems.saveBatch(caseId, missionId, items)
      .then(function(r) {
        if (!r.error && r.data && r.data.length) {
          ChecklistManager.buildDbIds(r.data, missionId);
          console.log('[AIOS][Checklist] flushed ' + r.data.length + ' pending items');
        }
        return { flushed: r.data ? r.data.length : 0 };
      });
  };

  ChecklistManager.getPendingCount = function() {
    return _pendingItems.length;
  };

  /* ── Reset on sign-out ── */
  ChecklistManager.reset = function() {
    _dbIdMap         = {};
    _statusMap       = {};
    _activeMissionId = null;
    _pendingItems    = [];
  };

  window.AIOS.Checklist = ChecklistManager;

})();
