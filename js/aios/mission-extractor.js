/* ══════════════════════════════════════════════════════════
   AIOS — Mission Extractor  (Phase 47)
   Turns structured response contracts into mission objects.
   Bridges ResponseContract → MissionManager → MissionState.

   DESIGN PRINCIPLES:
   - Safe: never creates duplicate missions; checks existing state.
   - Additive: enriches existing missions, never overwrites progress.
   - Decoupled: reads from ResponseContract output, writes to
     MissionManager. No direct DOM or API calls.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var MissionExtractor = {

    /**
     * Process a parsed response contract and extract/update missions.
     * Called AFTER ResponseContract.parse() produces a contract object.
     *
     * Returns an action descriptor (or null if no mission action needed):
     *   { action: 'create'|'update'|'complete', mission: Object }
     *
     * @param {Object} contract — Output of ResponseContract.parse()
     * @param {Object} [activeMission] — Current active mission (or null)
     * @returns {Object|null} Mission action descriptor
     */
    process: function(contract, activeMission) {
      if (!contract) return null;

      var Manager = window.AIOS && window.AIOS.Mission;
      if (!Manager) return null;

      // ── 1. Update existing mission if active ─────────────
      if (activeMission && (activeMission.status === 'active' || activeMission.status === 'in_progress')) {
        return MissionExtractor._tryUpdateMission(contract, activeMission, Manager);
      }

      // ── 2. Create new mission if strong signal detected ──
      if (contract.mission_signals && contract.mission_signals.suggestedType) {
        return MissionExtractor._tryCreateMission(contract, Manager);
      }

      return null;
    },

    /**
     * Try to update an existing active mission from the response.
     * @private
     */
    _tryUpdateMission: function(contract, mission, Manager) {
      var updates = {};
      var changed = false;

      // Step progression
      if (contract.mission_signals && contract.mission_signals.stepUpdate) {
        var stepData = contract.mission_signals.stepUpdate;
        if (stepData.nextStep && stepData.nextStep !== mission.nextStep) {
          // Advance: current step becomes what was nextStep, new nextStep from response
          if (mission.nextStep) {
            updates.currentStep = mission.nextStep;
          }
          updates.nextStep = stepData.nextStep;
          changed = true;
        }
      }

      // Blockers
      if (contract.mission_signals && contract.mission_signals.blockers &&
          contract.mission_signals.blockers.length > 0) {
        var existingBlockers = mission.blockers || [];
        var newBlockers = [];
        for (var i = 0; i < contract.mission_signals.blockers.length; i++) {
          var blocker = contract.mission_signals.blockers[i];
          if (existingBlockers.indexOf(blocker) === -1) {
            newBlockers.push(blocker);
          }
        }
        if (newBlockers.length > 0) {
          updates.blockers = existingBlockers.concat(newBlockers);
          changed = true;
        }
      }

      // Completion detection — report generated while mission active
      if (contract.mode === 'report') {
        updates.status = 'complete';
        changed = true;
      }

      if (!changed) return null;

      // Apply update via MissionManager
      if (typeof Manager.updateMission === 'function') {
        var updated = Manager.updateMission(mission, updates);
        return { action: updates.status === 'complete' ? 'complete' : 'update', mission: updated || mission };
      }

      // Manual merge fallback
      for (var key in updates) {
        if (updates.hasOwnProperty(key)) {
          mission[key] = updates[key];
        }
      }
      return { action: updates.status === 'complete' ? 'complete' : 'update', mission: mission };
    },

    /**
     * Try to create a new mission from response signals.
     * @private
     */
    _tryCreateMission: function(contract, Manager) {
      var type = contract.mission_signals.suggestedType;

      // Don't create if one already exists (active or in_progress)
      if (Manager.current && (Manager.current.status === 'active' || Manager.current.status === 'in_progress')) {
        return null;
      }

      // Don't create duplicate mission types
      if (typeof Manager.getByType === 'function' && Manager.getByType(type)) {
        return null;
      }

      // Check if MissionManager knows this type
      if (typeof Manager.createMission !== 'function') return null;

      var newMission = Manager.createMission(type);
      if (!newMission) return null;

      // Enrich with response data
      if (contract.mission_signals.stepUpdate && contract.mission_signals.stepUpdate.nextStep) {
        newMission.nextStep = contract.mission_signals.stepUpdate.nextStep;
      }
      if (contract.mission_signals.blockers && contract.mission_signals.blockers.length > 0) {
        newMission.blockers = contract.mission_signals.blockers;
      }

      // Set as current
      Manager.current = newMission;

      return { action: 'create', mission: newMission };
    },

    /**
     * Build a dashboard-ready mission snapshot from a contract + mission.
     * This is the shape consumed by profile.html checklist and mission card.
     *
     * @param {Object} contract — Parsed response contract
     * @param {Object} mission — Active or newly created mission
     * @returns {Object} Dashboard snapshot
     */
    buildDashboardSnapshot: function(contract, mission) {
      if (!mission) return null;

      return {
        // Identity
        type: mission.type || 'unknown',
        name: mission.name || '',

        // Progress
        status: mission.status || 'in_progress',
        currentStep: mission.currentStep || null,
        nextStep: mission.nextStep || null,
        blockers: mission.blockers || [],

        // From response contract
        lastActions: contract ? (contract.recommended_actions || []).slice(0, 5) : [],
        lastResources: contract ? (contract.resources || []).slice(0, 10) : [],
        riskFlags: contract ? (contract.risk_flags || []) : [],

        // Timing
        startedAt: mission.startedAt || null,
        lastUpdated: Date.now(),

        // Checklist items — extracted from actions
        checklist: MissionExtractor._buildChecklist(contract, mission)
      };
    },

    /**
     * Convert recommended actions into a checklist format.
     * @private
     */
    _buildChecklist: function(contract, mission) {
      var items = [];

      // Add mission default steps
      if (mission.data && mission.data.steps) {
        var steps = mission.data.steps;
        for (var i = 0; i < steps.length; i++) {
          items.push({
            id: 'mission_step_' + i,
            text: steps[i],
            source: 'mission_template',
            completed: false
          });
        }
      }

      // Add response-extracted actions
      if (contract && contract.recommended_actions) {
        var actions = contract.recommended_actions;
        for (var j = 0; j < actions.length; j++) {
          if (actions[j].isAction) {
            items.push({
              id: 'action_' + j + '_' + Date.now(),
              text: actions[j].text,
              source: 'ai_response',
              completed: false
            });
          }
        }
      }

      return items;
    }
  };

  /* ── Register ─────────────────────────────────────────── */
  window.AIOS = window.AIOS || {};
  window.AIOS.MissionExtractor = MissionExtractor;

})();
