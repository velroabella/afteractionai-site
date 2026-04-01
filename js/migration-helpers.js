/* ══════════════════════════════════════════════════════════
   AfterAction AI — Phase 2 Migration Helpers
   PHASE 2 MIGRATION HELPER

   One-time-per-session migration of existing in-memory and
   localStorage data into the new Persistent Case Model tables.

   Registers: window.AAAI.MigrationHelpers
   Depends on: window.AAAI.DataAccess (data-access.js)
               window.AIOS.Mission    (mission-manager.js)

   Safe-by-design rules:
     - Runs at most once per browser session (localStorage flag).
     - Every step is wrapped in try/catch — any failure is logged
       and silently skipped. Existing data is never modified.
     - Never deletes or overwrites localStorage or Supabase data.
     - Never blocks the UI — all DB calls are fire-and-forget.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // PHASE 2 MIGRATION HELPER

  /* ────────────────────────────────────────────────────────
     Session flag — prevents the migration from running more
     than once per page load. Uses sessionStorage (cleared on
     tab close) so it re-runs on a fresh browser session,
     giving a natural re-sync opportunity each visit.
     ──────────────────────────────────────────────────────── */
  var MIGRATION_SESSION_KEY = 'aaai_phase2_migration_ran_v1';

  /* ────────────────────────────────────────────────────────
     migrateExistingDataToCase(activeCaseId)

     Called from app.js _initCaseModel() after the active case
     UUID is resolved. Attempts to sync:
       1. Current in-memory mission (AIOS.Mission.current)
          → DataAccess.missions.create()
       2. Current checklist items from localStorage
          → DataAccess.checklistItems.saveBatch()
          (only if a mission was just migrated, for FK linkage)

     Returns nothing. All errors are caught and logged.
     ──────────────────────────────────────────────────────── */
  function migrateExistingDataToCase(activeCaseId) {
    // PHASE 2 MIGRATION HELPER
    // Guard: only run once per session
    try {
      if (sessionStorage.getItem(MIGRATION_SESSION_KEY)) {
        return; // already ran this session
      }
    } catch(e) {
      // sessionStorage blocked (private browsing edge case) — continue anyway
    }

    // Guard: DataAccess must be available
    if (!window.AAAI || !window.AAAI.DataAccess) {
      console.warn('[AAAI][Migration] DataAccess not available — skipping migration');
      return;
    }

    // Guard: need a valid case ID
    if (!activeCaseId) {
      console.warn('[AAAI][Migration] No activeCaseId — skipping migration');
      return;
    }

    console.log('[AAAI][Migration] starting one-time migration for case: ' + activeCaseId);

    // ── Step 1: Migrate in-memory mission ──────────────────
    // PHASE 2 MIGRATION HELPER
    // If AIOS.Mission.current exists, it was detected in this session
    // but never persisted. Write it to the DB now.
    var missionDbId = null; // will be set async; used by Step 2

    try {
      var currentMission = (window.AIOS && window.AIOS.Mission)
        ? window.AIOS.Mission.current
        : null;

      if (currentMission && currentMission.type) {
        window.AAAI.DataAccess.missions.create(activeCaseId, currentMission)
          .then(function(result) {
            if (result.error) {
              console.warn('[AAAI][Migration] mission save failed:', result.error);
              return;
            }
            // Attach the DB ID back onto the in-memory mission so future
            // sync() calls have the right row to update.
            // PHASE 2 MIGRATION HELPER
            if (result.data && result.data.id) {
              missionDbId = result.data.id;
              if (window.AIOS && window.AIOS.Mission && window.AIOS.Mission.current) {
                window.AIOS.Mission.current._dbId = missionDbId;
              }
              console.log('[AAAI][Migration] mission persisted — type: ' +
                currentMission.type + ' | dbId: ' + missionDbId);

              // ── Step 2: Migrate checklist items (requires missionDbId) ──
              // PHASE 2 MIGRATION HELPER
              _migrateChecklistItems(activeCaseId, missionDbId);
            }
          })
          .catch(function(err) {
            console.warn('[AAAI][Migration] mission create exception:', err && err.message);
          });
      } else {
        console.log('[AAAI][Migration] no active mission to migrate');
        // Still try checklist migration without a mission link
        // (checklist items are skipped if no missionDbId — FK required)
        _migrateChecklistItems(activeCaseId, null);
      }
    } catch(e) {
      console.warn('[AAAI][Migration] mission migration exception:', e && e.message);
    }

    // ── Mark session as migrated (even if steps were skipped) ──
    // PHASE 2 MIGRATION HELPER
    try {
      sessionStorage.setItem(MIGRATION_SESSION_KEY, '1');
    } catch(e) { /* sessionStorage blocked — harmless */ }

    console.log('[AAAI][Migration] migration session flag set');
  }


  /* ────────────────────────────────────────────────────────
     _migrateChecklistItems(caseId, missionId)

     Private helper. Reads checklist items from localStorage
     and saves them to case_checklist_items via DataAccess.

     Skips if:
       - missionId is null (FK is NOT NULL — can't insert)
       - No items in localStorage
       - DataAccess not available
     ──────────────────────────────────────────────────────── */
  function _migrateChecklistItems(caseId, missionId) {
    // PHASE 2 MIGRATION HELPER
    // case_checklist_items.mission_id is NOT NULL — skip if no mission
    if (!missionId) {
      console.log('[AAAI][Migration] no missionId — checklist items not migrated (FK required)');
      return;
    }

    try {
      var CHECKLIST_KEY = 'afteraction_checklist_progress_v1';
      var stored = JSON.parse(localStorage.getItem(CHECKLIST_KEY) || '{}');
      var items = stored.items;

      if (!items || items.length === 0) {
        console.log('[AAAI][Migration] no checklist items in localStorage to migrate');
        return;
      }

      // Map completed indices from localStorage for status seeding
      var completedSet = {};
      (stored.completedIndices || []).forEach(function(idx) {
        completedSet[idx] = true;
      });

      // Enrich items with completion state before saving
      // PHASE 2 MIGRATION HELPER
      var enrichedItems = items.map(function(item, idx) {
        return {
          title:         item.title,
          description:   item.description  || '',
          category:      item.category     || 'general',
          sort_order:    idx,
          priority:      item.priority     || 2,
          source:        'ai_report',
          is_completed:  !!completedSet[idx],
          status:        completedSet[idx] ? 'completed' : 'not_started',
          completed_at:  completedSet[idx] ? new Date().toISOString() : null
        };
      });

      window.AAAI.DataAccess.checklistItems.saveBatch(caseId, missionId, enrichedItems)
        .then(function(result) {
          if (result.error) {
            console.warn('[AAAI][Migration] checklist saveBatch failed:', result.error);
            return;
          }
          var count = result.data ? result.data.length : 0;
          console.log('[AAAI][Migration] checklist items migrated: ' + count +
            ' items → case_checklist_items');
        })
        .catch(function(err) {
          console.warn('[AAAI][Migration] checklist saveBatch exception:', err && err.message);
        });

    } catch(e) {
      console.warn('[AAAI][Migration] checklist migration exception:', e && e.message);
    }
  }


  /* ────────────────────────────────────────────────────────
     resetMigrationFlag()

     Utility for debugging/testing — clears the session flag
     so the migration will re-run on the next _initCaseModel()
     call. Call from browser console: AAAI.MigrationHelpers.reset()
     PHASE 2 MIGRATION HELPER
     ──────────────────────────────────────────────────────── */
  function resetMigrationFlag() {
    try {
      sessionStorage.removeItem(MIGRATION_SESSION_KEY);
      console.log('[AAAI][Migration] session flag cleared — migration will re-run on next init');
    } catch(e) {
      console.warn('[AAAI][Migration] could not clear session flag:', e && e.message);
    }
  }


  /* ════════════════════════════════════════════════════════
     REGISTER
     ════════════════════════════════════════════════════════ */

  window.AAAI = window.AAAI || {};

  window.AAAI.MigrationHelpers = {
    migrateExistingDataToCase: migrateExistingDataToCase,
    reset:                     resetMigrationFlag  // debug utility
  };

  console.log('[AAAI][MigrationHelpers] registered'); // PHASE 2 MIGRATION HELPER

})();
