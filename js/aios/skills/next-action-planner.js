/* ══════════════════════════════════════════════════════════
   AIOS Skill — Next Action Planner
   Generates a prioritized action plan based on the
   veteran's profile, active mission, and identified needs.
   Produces the "After Action Report" deliverable.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var NextActionPlanner = {

    id: 'next-action-planner',
    name: 'Next Action Planner',
    description: 'Builds a prioritized action plan and After Action Report.',

    triggers: [
      'action plan', 'next steps', 'what should I do',
      'where do I start', 'priorities', 'checklist',
      'after action', 'report', 'summary'
    ],

    prompt: '',

    requiredFields: ['branch', 'status', 'needs'],

    /**
     * Execute the skill against the current context.
     * @param {Object} context - { profile, history, userInput }
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      // Placeholder — will compile action items from profile + mission state
      return { prompt: NextActionPlanner.prompt, data: {} };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['next-action-planner'] = NextActionPlanner;

})();
