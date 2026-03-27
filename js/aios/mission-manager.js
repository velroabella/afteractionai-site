/* ══════════════════════════════════════════════════════════
   AIOS — Mission Manager
   Tracks the current mission (what the veteran is trying
   to accomplish), its phases, and completion state.
   A mission is a multi-turn goal like "file a VA claim"
   or "find housing assistance in Florida".
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var MissionManager = {

    /** Current active mission (or null) */
    current: null,

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
