/* ══════════════════════════════════════════════════════════
   AfterAction AI — Data Access Layer
   PHASE 2 - PERSISTENT CASE MODEL

   Provides a clean JavaScript API for CRUD operations on the
   Phase 2 Persistent Case Model schema:
     cases, missions, case_checklist_items, documents, reports

   Depends on: window.supabase CDN library (loaded synchronously
               in <head> before any body scripts)
   Registers:  window.AAAI.DataAccess

   Usage:
     const DA = window.AAAI.DataAccess;
     const { data, error } = await DA.cases.create({ title: 'My Case' });

   All methods return { data, error } matching Supabase conventions.
   All queries are automatically scoped to the authenticated user via RLS.

   Security note: auth.js intentionally does NOT expose its internal
   Supabase client (audit C-02 fix). This module creates its own client
   using the same public anon key — safe because:
     1. The anon key is already public (embedded in auth.js + HTML source)
     2. RLS policies on every table enforce auth.uid() = user_id
     3. Unauthenticated requests return 0 rows due to RLS
   The auth session is shared automatically via localStorage (Supabase v2
   stores the JWT there, so all clients on the same origin share one session).
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // PHASE 2 - PERSISTENT CASE MODEL

  /* ────────────────────────────────────────────────────────
     Supabase client — lazy-initialized singleton.
     Uses the same public anon key as auth.js. Auth session is
     shared via localStorage so RLS resolves the correct user.
     ──────────────────────────────────────────────────────── */
  var _dbClient = null;

  // These match the values in auth.js exactly — both are public/anon credentials.
  // PHASE 2 - PERSISTENT CASE MODEL
  var _SUPABASE_URL     = 'https://gdnnoehxezkrihrcqosr.supabase.co';
  var _SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdkbm5vZWh4ZXprcmlocmNxb3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDM5NjMsImV4cCI6MjA4OTUxOTk2M30.jHVUOd5ZijF_Y9PlVrYuWAmWEN3PUgXY6SfX8lJZqXg';

  function getClient() {
    if (_dbClient) return _dbClient;
    // Supabase CDN must be loaded synchronously before this script.
    // See index.html — <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">
    // is in <head> without defer. If this guard fires, check script load order.
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.error('[AAAI][DataAccess] Supabase library not found — check script load order in index.html');
      return null;
    }
    _dbClient = window.supabase.createClient(_SUPABASE_URL, _SUPABASE_ANON_KEY);
    return _dbClient;
  }


  /* ────────────────────────────────────────────────────────
     Utility: wrap a Supabase query builder promise so all
     methods return a consistent { data, error } shape even
     when the caller doesn't .select().single().
     ──────────────────────────────────────────────────────── */
  function wrap(queryPromise) {
    return queryPromise.then(function(result) {
      return { data: result.data, error: result.error };
    }).catch(function(err) {
      return { data: null, error: err };
    });
  }


  /* ════════════════════════════════════════════════════════
     CASES
     ════════════════════════════════════════════════════════ */

  var cases = {

    /**
     * Create a new case for the authenticated user.
     * @param {{ title?: string, status?: string, notes?: string }} fields
     * @returns {Promise<{data, error}>} Created case row
     */
    create: function(fields) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      var row = {
        title:  fields.title  || 'My Case',
        status: fields.status || 'active',
        notes:  fields.notes  || null
      };
      return wrap(
        db.from('cases').insert(row).select().single()
      );
    },

    /**
     * Fetch all cases for the authenticated user.
     * @param {{ status?: string }} [filters]
     * @returns {Promise<{data, error}>} Array of case rows
     */
    list: function(filters) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      var q = db.from('cases').select('*').order('created_at', { ascending: false });
      if (filters && filters.status) {
        q = q.eq('status', filters.status);
      }
      return wrap(q);
    },

    /**
     * Fetch a single case by ID.
     * @param {string} caseId
     * @returns {Promise<{data, error}>}
     */
    get: function(caseId) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      return wrap(
        db.from('cases').select('*').eq('id', caseId).single()
      );
    },

    /**
     * Fetch a case with all related missions, checklist items, and reports
     * in a single request using Supabase joins.
     * @param {string} caseId
     * @returns {Promise<{data, error}>}
     */
    getFull: function(caseId) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      return wrap(
        db.from('cases')
          .select([
            '*',
            'missions(*)',
            'reports(*)',
            'documents(id, file_name, document_type, status, created_at)',
            'case_checklist_items(count)'
          ].join(', '))
          .eq('id', caseId)
          .single()
      );
    },

    /**
     * Update a case.
     * @param {string} caseId
     * @param {{ title?: string, status?: string, notes?: string }} updates
     * @returns {Promise<{data, error}>}
     */
    update: function(caseId, updates) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      return wrap(
        db.from('cases').update(updates).eq('id', caseId).select().single()
      );
    },

    /**
     * Soft-delete by setting status to 'archived'.
     * @param {string} caseId
     * @returns {Promise<{data, error}>}
     */
    archive: function(caseId) {
      return cases.update(caseId, { status: 'archived' });
    }

  };


  /* ════════════════════════════════════════════════════════
     MISSIONS
     ════════════════════════════════════════════════════════ */

  var missions = {

    /**
     * Persist a mission object (mirrors MissionManager shape).
     * Call this when MissionManager creates a new mission in memory
     * to sync it to the database.
     * @param {string} caseId
     * @param {Object} missionObj  MissionManager.createMission() output
     * @returns {Promise<{data, error}>}
     */
    create: function(caseId, missionObj) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      var row = {
        case_id:      caseId,
        mission_type: missionObj.type,
        name:         missionObj.name,
        status:       missionObj.status || 'active',
        current_step: missionObj.currentStep || null,
        next_step:    missionObj.nextStep    || null,
        blockers:     JSON.stringify(missionObj.blockers || []),
        data:         JSON.stringify(missionObj.data     || {}),
        started_at:   missionObj.startedAt
                        ? new Date(missionObj.startedAt).toISOString()
                        : new Date().toISOString()
      };
      return wrap(
        db.from('missions').insert(row).select().single()
      );
    },

    /**
     * List all missions for a case.
     * @param {string} caseId
     * @param {{ status?: string }} [filters]
     * @returns {Promise<{data, error}>}
     */
    list: function(caseId, filters) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      var q = db.from('missions')
        .select('*')
        .eq('case_id', caseId)
        .order('started_at', { ascending: true });
      if (filters && filters.status) {
        q = q.eq('status', filters.status);
      }
      return wrap(q);
    },

    /**
     * Get a single mission by its DB ID.
     * @param {string} missionId
     * @returns {Promise<{data, error}>}
     */
    get: function(missionId) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      return wrap(
        db.from('missions').select('*').eq('id', missionId).single()
      );
    },

    /**
     * Sync in-memory mission state to the database.
     * Call when MissionManager.updateMission() is called.
     * @param {string} missionId  DB row ID (stored alongside the in-memory mission)
     * @param {Object} missionObj Updated MissionManager mission object
     * @returns {Promise<{data, error}>}
     */
    sync: function(missionId, missionObj) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      var updates = {
        status:       missionObj.status,
        current_step: missionObj.currentStep || null,
        next_step:    missionObj.nextStep    || null,
        blockers:     JSON.stringify(missionObj.blockers || []),
        data:         JSON.stringify(missionObj.data     || {})
      };
      return wrap(
        db.from('missions').update(updates).eq('id', missionId).select().single()
      );
    },

    /**
     * Convert a Supabase missions row back to MissionManager shape.
     * Use this when loading a persisted mission to restore in-memory state.
     * @param {Object} row  Database row from missions table
     * @returns {Object}    MissionManager-compatible mission object
     */
    toMemoryShape: function(row) {
      return {
        _dbId:       row.id,        // keep DB ID alongside in-memory mission
        type:        row.mission_type,
        name:        row.name,
        status:      row.status,
        currentStep: row.current_step,
        nextStep:    row.next_step,
        blockers:    typeof row.blockers === 'string' ? JSON.parse(row.blockers) : (row.blockers || []),
        data:        typeof row.data    === 'string' ? JSON.parse(row.data)     : (row.data     || {}),
        startedAt:   new Date(row.started_at).getTime()
      };
    }

  };


  /* ════════════════════════════════════════════════════════
     CASE CHECKLIST ITEMS
     ════════════════════════════════════════════════════════ */

  var checklistItems = {

    /**
     * Save a batch of checklist items to a mission.
     * Call after a report generates checklist items to persist them.
     * @param {string} caseId
     * @param {string} missionId
     * @param {Array}  items      Array of item objects from parseReportToChecklist()
     * @returns {Promise<{data, error}>}
     */
    saveBatch: function(caseId, missionId, items) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      var PRIORITY = { immediate: 1, short_term: 2, strategic: 3, optional: 4 };
      var rows = items.map(function(item, i) {
        return {
          mission_id:    missionId,
          case_id:       caseId,
          title:         item.title,
          description:   item.description  || null,
          category:      item.category     || 'general',
          is_completed:  false,
          status:        'not_started',
          sort_order:    item.sort_order !== undefined ? item.sort_order : i,
          priority:      item.priority || PRIORITY[item.category] || 2,
          source:        item.source   || 'ai_report',
          resource_link: item.resource_link || null,
          due_context:   item.due_context   || null
        };
      });
      return wrap(
        db.from('case_checklist_items').insert(rows).select()
      );
    },

    /**
     * List all checklist items for a mission.
     * @param {string} missionId
     * @returns {Promise<{data, error}>}
     */
    listByMission: function(missionId) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      return wrap(
        db.from('case_checklist_items')
          .select('*')
          .eq('mission_id', missionId)
          .order('category')
          .order('sort_order')
      );
    },

    /**
     * List all checklist items for a case (across all missions).
     * @param {string} caseId
     * @param {{ status?: string }} [filters]
     * @returns {Promise<{data, error}>}
     */
    listByCase: function(caseId, filters) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      var q = db.from('case_checklist_items')
        .select('*, missions(mission_type, name, status)')
        .eq('case_id', caseId)
        .order('priority')
        .order('sort_order');
      if (filters && filters.status) {
        q = q.eq('status', filters.status);
      }
      return wrap(q);
    },

    /**
     * Toggle a checklist item's completed state.
     * @param {string} itemId
     * @param {boolean} completed
     * @returns {Promise<{data, error}>}
     */
    toggle: function(itemId, completed) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      return wrap(
        db.from('case_checklist_items')
          .update({
            is_completed: completed,
            status:       completed ? 'completed' : 'not_started',
            completed_at: completed ? new Date().toISOString() : null
          })
          .eq('id', itemId)
          .select()
          .single()
      );
    },

    /**
     * Update status of a single item (for in_progress, blocked, skipped).
     * @param {string} itemId
     * @param {string} status  not_started | in_progress | completed | blocked | skipped
     * @returns {Promise<{data, error}>}
     */
    updateStatus: function(itemId, status) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      var updates = { status: status };
      if (status === 'completed') {
        updates.is_completed = true;
        updates.completed_at = new Date().toISOString();
      }
      return wrap(
        db.from('case_checklist_items').update(updates).eq('id', itemId).select().single()
      );
    }

  };


  /* ════════════════════════════════════════════════════════
     DOCUMENTS
     ════════════════════════════════════════════════════════ */

  var documents = {

    /**
     * Save a document record after analysis.
     * @param {string} caseId
     * @param {Object} docData
     * @param {string} [missionId]  Optional — link to specific mission
     * @returns {Promise<{data, error}>}
     */
    save: function(caseId, docData, missionId) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      var row = {
        case_id:         caseId,
        mission_id:      missionId || null,
        file_name:       docData.file_name       || 'unknown',
        document_type:   docData.document_type   || null,
        storage_path:    docData.storage_path    || null,
        mime_type:       docData.mime_type        || null,
        file_size:       docData.file_size        || null,
        extracted_text:  docData.extracted_text  || null,
        analysis_result: docData.analysis_result
                           ? JSON.stringify(docData.analysis_result)
                           : '{}',
        status:          docData.status          || 'complete'
      };
      return wrap(
        db.from('documents').insert(row).select().single()
      );
    },

    /**
     * List all documents for a case.
     * @param {string} caseId
     * @returns {Promise<{data, error}>}
     */
    listByCase: function(caseId) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      return wrap(
        db.from('documents')
          .select('id, file_name, document_type, status, created_at, mission_id')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false })
      );
    },

    /**
     * Get a single document with full analysis result.
     * @param {string} documentId
     * @returns {Promise<{data, error}>}
     */
    get: function(documentId) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      return wrap(
        db.from('documents').select('*').eq('id', documentId).single()
      );
    }

  };


  /* ════════════════════════════════════════════════════════
     REPORTS
     ════════════════════════════════════════════════════════ */

  var reports = {

    /**
     * Save a new report linked to a case.
     * Call after buildReport() generates a finished After Action Report.
     * @param {string} caseId
     * @param {Object} reportData
     * @returns {Promise<{data, error}>}
     */
    save: function(caseId, reportData) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      var row = {
        case_id:              caseId,
        report_type:          reportData.report_type          || 'after_action',
        title:                reportData.title                || null,
        content:              reportData.content,
        conversation_history: reportData.conversation_history
                                ? JSON.stringify(reportData.conversation_history)
                                : '[]',
        model_used:           reportData.model_used           || null,
        token_count:          reportData.token_count          || null
      };
      return wrap(
        db.from('reports').insert(row).select().single()
      );
    },

    /**
     * List all reports for a case, newest first.
     * @param {string} caseId
     * @returns {Promise<{data, error}>}
     */
    listByCase: function(caseId) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      return wrap(
        db.from('reports')
          .select('id, report_type, title, created_at')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false })
      );
    },

    /**
     * Get the full content of a specific report.
     * @param {string} reportId
     * @returns {Promise<{data, error}>}
     */
    get: function(reportId) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      return wrap(
        db.from('reports').select('*').eq('id', reportId).single()
      );
    },

    /**
     * Get the most recent report for a case (for dashboard display).
     * @param {string} caseId
     * @returns {Promise<{data, error}>}
     */
    getLatest: function(caseId) {
      var db = getClient();
      if (!db) return Promise.resolve({ data: null, error: 'No Supabase client' });
      return wrap(
        db.from('reports')
          .select('*')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
      );
    }

  };


  /* ════════════════════════════════════════════════════════
     CASE DASHBOARD HELPER
     Loads everything needed for the profile/dashboard view
     in one round-trip per case.
     ════════════════════════════════════════════════════════ */

  var dashboard = {

    /**
     * Load complete case summary for dashboard rendering.
     * Returns: case + active missions + incomplete checklist items + latest report.
     * @param {string} caseId
     * @returns {Promise<{data: {case, missions, checklistItems, latestReport}, error}>}
     */
    load: function(caseId) {
      return Promise.all([
        cases.get(caseId),
        missions.list(caseId),
        checklistItems.listByCase(caseId, { status: 'not_started' }),
        reports.getLatest(caseId)
      ]).then(function(results) {
        var errs = results.map(function(r) { return r.error; }).filter(Boolean);
        if (errs.length > 0) {
          return { data: null, error: errs[0] };
        }
        return {
          data: {
            case:          results[0].data,
            missions:      results[1].data || [],
            checklistItems: results[2].data || [],
            latestReport:  results[3].data  || null
          },
          error: null
        };
      });
    },

    /**
     * Load or create the active case for the current user.
     * If no active case exists, creates a default one.
     * @returns {Promise<{data: caseRow, error}>}
     */
    getOrCreateActiveCase: function() {
      // PHASE 2 FIX - Prime the Supabase v2 auth session before any RLS-guarded
      // query. createClient() restores the JWT asynchronously from localStorage;
      // calling getSession() first ensures auth.uid() is populated before the
      // INSERT, preventing a 42501 RLS violation on the first page load.
      var client = getClient();
      if (!client) return Promise.resolve({ data: null, error: { message: '[AAAI] DataAccess: Supabase client unavailable' } });
      return client.auth.getSession().then(function() {
        return cases.list({ status: 'active' });
      }).then(function(result) {
        if (result.error) return result;
        var activeCases = result.data || [];
        if (activeCases.length > 0) {
          return { data: activeCases[0], error: null };
        }
        // No active case — create a default one
        return cases.create({ title: 'My Veteran Benefits Case', status: 'active' });
      });
    }

  };


  /* ════════════════════════════════════════════════════════
     REGISTER
     ════════════════════════════════════════════════════════ */

  window.AAAI = window.AAAI || {};

  /* ────────────────────────────────────────────────────────
     getActiveCaseId()
     PHASE 2 DEBUG HELPER

     Returns the active case UUID resolved by app.js, or null.
     app.js writes window.AAAI._activeCaseId after _initCaseModel()
     resolves; this method surfaces it for console debugging.

     Usage (browser console):
       AAAI.DataAccess.getActiveCaseId()
       // → "3f2a1b0c-..." or null
     ──────────────────────────────────────────────────────── */
  function getActiveCaseId() {
    // PHASE 2 DEBUG HELPER
    return (window.AAAI && window.AAAI._activeCaseId) || null;
  }

  window.AAAI.DataAccess = {
    cases:            cases,
    missions:         missions,
    checklistItems:   checklistItems,
    documents:        documents,
    reports:          reports,
    dashboard:        dashboard,
    getActiveCaseId:  getActiveCaseId  // PHASE 2 DEBUG HELPER
  };

  console.log('[AAAI][DataAccess] registered — Phase 2 Persistent Case Model'); // PHASE 2 - PERSISTENT CASE MODEL

})();
