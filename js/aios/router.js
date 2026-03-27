/* ══════════════════════════════════════════════════════════
   AIOS — Router
   Analyzes user input and conversation state to determine
   which skill should handle the current request.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var Router = {

    /**
     * Determine the best skill for the current user input.
     * @param {string} userInput - The user's message
     * @param {Object} context - { profile, mission, history }
     * @returns {Object} { skillId: string, confidence: number, reason: string }
     */
    route: function(userInput, context) {
      // Placeholder — will use keyword matching, then LLM classification
      return { skillId: 'benefit-path-finder', confidence: 0, reason: 'default' };
    },

    /**
     * Register a skill so the router knows it exists.
     * @param {string} skillId
     * @param {Object} skillMeta - { triggers: [], description: '' }
     */
    register: function(skillId, skillMeta) {
      Router._skills[skillId] = skillMeta;
    },

    /** Internal registry of available skills */
    _skills: {}
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Router = Router;

})();
