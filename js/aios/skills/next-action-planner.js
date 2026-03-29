/* ══════════════════════════════════════════════════════════
   AIOS Skill — Next Action Planner
   Generates a prioritized action plan based on the
   veteran's profile, active mission, and identified needs.
   Produces the "After Action Report" deliverable.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var SKILL_PROMPT = [
    '## ACTIVE SKILL: NEXT ACTION PLANNER',
    '',
    '### YOUR ROLE',
    'Build a clear, prioritized action plan for this veteran based on everything discussed so far.',
    'This is the veteran\'s "After Action Report" — their personalized roadmap.',
    'You compile, organize, and prioritize — you do NOT introduce new topics not already discussed.',
    '',
    '### STEP-BY-STEP ASSISTANCE MODEL',
    '1. **Review context** — Use the veteran\'s profile, conversation history, and any active mission.',
    '2. **Confirm priorities** — Ask: "Based on what we\'ve discussed, these seem like your top priorities: [list]. Is that right, or would you reorder anything?"',
    '3. **Build the plan** — Organize actions by priority with clear timelines.',
    '4. **Deliver** — Present the full action plan in a structured, scannable format.',
    '',
    '### REQUIRED OUTPUT FORMAT',
    'When you have enough context, present the action plan as:',
    '',
    '# Your After Action Plan',
    '',
    '## Priority 1: [Most urgent action]',
    '- **What**: One-sentence description',
    '- **Why now**: Why this is priority #1',
    '- **How**: Step-by-step instructions (be specific — name forms, websites, phone numbers)',
    '- **Timeline**: When to start and expected completion',
    '',
    '## Priority 2: [Next most urgent]',
    '(same format)',
    '',
    '## Priority 3: [Third priority]',
    '(same format)',
    '',
    '## Quick Wins (optional)',
    '- Things that take less than 30 minutes and can be done today',
    '',
    '## Important Contacts',
    '- List specific offices, phone numbers, and websites mentioned in the plan',
    '',
    '### RULES',
    '- Maximum 5 priorities. Fewer is better — 3 is ideal.',
    '- Every action must have a specific next step, not vague advice.',
    '- Do NOT introduce benefits or programs not already discussed in conversation.',
    '- Do NOT fabricate deadlines or eligibility criteria.',
    '- Use the veteran\'s name if known.',
    '- If profile data is thin (no branch, no rating, no state), say so:',
    '  "I can build a better plan with a few more details. Can you tell me [specific missing info]?"',
    '- Rank by IMPACT — highest-value or most time-sensitive action first.',
    '- Include the Veterans Crisis Line (988, Press 1) at the bottom of every action plan.',
    '',
    '### FOLLOW-UP',
    'After delivering the plan, ask:',
    '"Would you like to dive deeper into any of these priorities, or is there anything I missed?"',
    '',
    '[OPTIONS: Priority 1 deep-dive | Priority 2 deep-dive | Generate my report | Add something else | Looks good]'
  ].join('\n');

  var NextActionPlanner = {

    id: 'next-action-planner',
    name: 'Next Action Planner',
    description: 'Builds a prioritized action plan and After Action Report.',

    triggers: [
      'action plan', 'next steps', 'what should I do',
      'where do I start', 'priorities', 'checklist',
      'after action', 'report', 'summary'
    ],

    prompt: SKILL_PROMPT,

    requiredFields: ['branch', 'status', 'needs'],

    contextFields: ['branch', 'dischargeStatus', 'vaRating', 'state', 'employmentStatus', 'currentGoals'],

    /**
     * Execute the skill against the current context.
     * @param {Object} context - { profile, history, userInput }
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      var data = { canRespond: true };
      var unknown = [];
      if (context && context.profile) {
        var fields = NextActionPlanner.contextFields;
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i];
          if (f === 'vaRating') {
            if (context.profile.vaRating === null || context.profile.vaRating === undefined) unknown.push(f);
          } else if (!context.profile[f]) {
            unknown.push(f);
          }
        }
      } else {
        unknown = NextActionPlanner.contextFields.slice();
      }
      if (unknown.length) data.unknownFields = unknown;

      // Phase 24: top categories from eligibility engine
      var Elig = window.AIOS && window.AIOS.Eligibility;
      var profile = context && context.profile;
      if (Elig && profile && Elig.hasUsefulSignal(profile)) {
        var scores = Elig.score(profile);
        var config = Elig.SCORING_CONFIG;
        var labelMap = {};
        for (var j = 0; j < config.length; j++) { labelMap[config[j].id] = config[j].label; }
        var topCats = Object.keys(scores)
          .filter(function(id) { return scores[id] >= 0.50; })
          .sort(function(a, b) { return scores[b] - scores[a]; })
          .slice(0, 4)
          .map(function(id) { return labelMap[id] || id; });
        if (topCats.length) data.topCategories = topCats;
      }

      return { prompt: NextActionPlanner.prompt, data: data };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['next-action-planner'] = NextActionPlanner;

})();
