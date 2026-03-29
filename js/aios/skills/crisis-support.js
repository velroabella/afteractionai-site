/* ══════════════════════════════════════════════════════════
   AIOS Skill — Crisis Support
   Detects crisis language and immediately provides
   Veterans Crisis Line info and de-escalation support.
   This skill takes priority over all other skills.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var CrisisSupport = {

    id: 'crisis-support',
    name: 'Crisis Support',
    description: 'Detects crisis signals and provides immediate support resources.',

    /** High-priority — overrides other skill routing */
    priority: 100,

    triggers: [
      'suicide', 'kill myself', 'end it', 'want to die',
      'no reason to live', 'can\'t go on', 'hopeless',
      'self-harm', 'hurt myself', 'crisis', 'emergency',
      'don\'t want to be here', 'give up'
    ],

    prompt: '',

    requiredFields: [],

    /**
     * Check if user input contains crisis signals.
     * @param {string} userInput
     * @returns {boolean}
     */
    detect: function(userInput) {
      if (!userInput) return false;
      var lower = userInput.toLowerCase();
      return CrisisSupport.triggers.some(function(trigger) {
        return lower.indexOf(trigger) !== -1;
      });
    },

    /**
     * Execute the skill — returns crisis resources.
     * @param {Object} context - { profile, history, userInput }
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      // Placeholder — will inject crisis line info + de-escalation prompt
      return { prompt: CrisisSupport.prompt, data: { crisisDetected: true } };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['crisis-support'] = CrisisSupport;

})();
