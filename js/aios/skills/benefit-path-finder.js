/* ══════════════════════════════════════════════════════════
   AIOS Skill — Benefit Path Finder
   Guides veterans through identifying which federal and
   state benefits they may qualify for based on service
   history, discharge status, and current needs.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Skill prompt — injected into system prompt when active
     ──────────────────────────────────────────────────────── */
  var SKILL_PROMPT = [
    '## ACTIVE SKILL: BENEFIT PATH FINDER',
    '',
    '### YOUR MISSION',
    'Help this veteran identify the 2–3 benefit programs most relevant to their situation.',
    'You are a benefits navigator — not an encyclopedia. Narrow down, don\'t dump everything.',
    '',
    '### INTAKE — GATHER ONLY WHAT YOU NEED',
    'Before recommending benefits, confirm these basics (skip any you already know):',
    '1. Service branch and approximate years of service',
    '2. Discharge status (honorable, general, other-than-honorable, etc.)',
    '3. What they need help with RIGHT NOW (healthcare, money, education, housing, employment, legal)',
    '',
    'Do NOT ask all three at once. Ask one at a time. If the veteran volunteers info, absorb it and skip ahead.',
    'If the veteran is vague ("I need help"), ask: "What\'s the most pressing thing you\'re dealing with right now?"',
    '',
    '### RESPONSE FORMAT',
    'Once you have enough context, respond with:',
    '',
    '**For each recommended benefit (2–3 max):**',
    '1. **[Benefit Name]** — one-sentence description of what it provides',
    '   - Why it fits: one sentence connecting it to what the veteran told you',
    '   - Next step: the single concrete action to start (phone number, URL, or document to gather)',
    '',
    'End with ONE clear call to action: "Which of these do you want to dig into first?"',
    '',
    '### RULES',
    '- Recommend 2–3 paths maximum. The veteran can always ask for more.',
    '- Rank by impact — put the highest-value or most-urgent benefit first.',
    '- If discharge status limits eligibility, say so directly: "With a [discharge type], you may not qualify for [X], but you CAN access [Y]."',
    '- Never say "you may be eligible" without explaining WHY based on what the veteran told you.',
    '- Do NOT include state-specific benefits here. That is handled by a separate skill.',
    '- Do NOT walk through the disability claim process. That is handled by a separate skill.',
    '- If the veteran clearly needs crisis support, stop and route to crisis resources immediately.',
    '',
    '### COMMON BENEFIT CATEGORIES TO DRAW FROM',
    '- Healthcare: VA healthcare enrollment, mental health services, Vet Centers, CHAMPVA',
    '- Disability: VA disability compensation (mention, but defer details to claim skill)',
    '- Education: GI Bill (Post-9/11, Montgomery), VR&E / Chapter 31, Yellow Ribbon',
    '- Housing: VA home loan guarantee, adapted housing grants, HUD-VASH',
    '- Employment: VOW to Hire Heroes, USERRA protections, VA vocational rehab',
    '- Financial: VA pension, Aid & Attendance, burial benefits, SGLI/VGLI',
    '- Family: Survivors\' benefits, Fry Scholarship, CHAMPVA for dependents'
  ].join('\n');


  /* ────────────────────────────────────────────────────────
     Skill module
     ──────────────────────────────────────────────────────── */
  var BenefitPathFinder = {

    id: 'benefit-path-finder',
    name: 'Benefit Path Finder',
    description: 'Identifies the 2–3 most relevant VA benefits based on veteran profile and needs.',

    /** Keywords / phrases that trigger this skill via the router */
    triggers: [
      'benefits', 'eligible', 'qualify', 'entitled',
      'what can I get', 'what am I eligible for',
      'VA benefits', 'education benefits',
      'GI Bill', 'healthcare', 'housing',
      'pension', 'employment', 'vocational rehab'
    ],

    /** Skill-specific prompt fragment (injected into system prompt) */
    prompt: SKILL_PROMPT,

    /** Recommended output style for downstream formatting */
    outputStyle: 'numbered-paths',

    /**
     * Context fields that improve recommendations when available.
     * These are NOT hard blockers — the skill can respond usefully
     * without any of them. The AI will weave in questions naturally
     * when it would meaningfully change the recommendation.
     *
     * Fields:
     *   branch          — service branch (Army, Navy, etc.)
     *   serviceEra      — when they served (post-9/11, Gulf War, Vietnam, etc.)
     *   dischargeStatus — honorable, general, OTH, etc.
     *   primaryNeed     — what they need help with right now
     */
    contextFields: ['branch', 'serviceEra', 'dischargeStatus', 'primaryNeed'],

    /**
     * Execute the skill against the current context.
     * Always returns a usable prompt + data, even with zero profile info.
     * Missing context fields are flagged as hints, not blockers.
     * @param {Object} context - { profile, history, userInput }
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      var data = { canRespond: true };

      // Flag which context fields are still unknown — hints for the AI,
      // not blockers. The AI can still recommend benefits without them.
      var unknown = [];
      if (context && context.profile) {
        for (var i = 0; i < BenefitPathFinder.contextFields.length; i++) {
          var field = BenefitPathFinder.contextFields[i];
          if (!context.profile[field]) {
            unknown.push(field);
          }
        }
      } else {
        unknown = BenefitPathFinder.contextFields.slice();
      }

      if (unknown.length) {
        data.unknownFields = unknown;
      }

      return {
        prompt: BenefitPathFinder.prompt,
        data: data
      };
    }
  };

  // Register with AIOS
  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['benefit-path-finder'] = BenefitPathFinder;

})();
