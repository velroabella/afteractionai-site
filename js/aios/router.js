/* ══════════════════════════════════════════════════════════
   AIOS — Router
   Classifies user input into an intent and selects the
   appropriate skill. V1 uses deterministic keyword matching.
   Crisis detection always runs first as an override.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Intent → Skill mapping
     ──────────────────────────────────────────────────────── */
  var INTENTS = {
    CRISIS_SUPPORT:     'crisis-support',
    BENEFITS_DISCOVERY: 'benefit-path-finder',
    DISABILITY_CLAIM:   'va-disability-claim',
    STATE_BENEFITS:     'state-benefits',
    NEXT_STEP:          'next-action-planner',
    DOCUMENT_ANALYSIS:  'document-analyzer',
    GENERAL_QUESTION:   null   // no skill — handled by core prompt
  };

  /* ────────────────────────────────────────────────────────
     Keyword tables — order matters (checked top-to-bottom)
     Crisis is checked separately via override, not here.
     ──────────────────────────────────────────────────────── */
  var KEYWORD_RULES = [
    {
      intent: 'DISABILITY_CLAIM',
      keywords: [
        'disability claim', 'file a claim', 'va claim', 'disability rating',
        'c&p exam', 'comp and pen', 'nexus letter', 'supplemental claim',
        'higher-level review', 'board of veterans appeals', 'bva',
        'claim status', 'claim appeal', 'rating decision', 'increase my rating'
      ]
    },
    {
      intent: 'STATE_BENEFITS',
      keywords: [
        'state benefits', 'state veteran', 'property tax exemption',
        'state va', 'in-state tuition', 'license reciprocity',
        'state program', 'my state', 'state bonus'
      ]
    },
    {
      intent: 'DOCUMENT_ANALYSIS',
      keywords: [
        'upload', 'document', 'dd-214', 'dd214', 'va letter',
        'discharge papers', 'service record', 'benefit letter',
        'rating decision letter', 'medical record', 'analyze my',
        'read my', 'look at my'
      ]
    },
    {
      intent: 'NEXT_STEP',
      keywords: [
        'action plan', 'next steps', 'what should i do', 'where do i start',
        'priorities', 'checklist', 'after action', 'my report', 'summary',
        'what now', 'most important', 'first thing'
      ]
    },
    {
      intent: 'BENEFITS_DISCOVERY',
      keywords: [
        'benefits', 'eligible', 'qualify', 'entitled', 'what can i get',
        'what am i eligible', 'gi bill', 'education benefits', 'healthcare',
        'housing', 'va loan', 'pension', 'aid and attendance',
        'caregiver', 'vocational rehab', 'vr&e', 'vet center'
      ]
    }
  ];

  /* ────────────────────────────────────────────────────────
     Crisis keywords — checked first, always overrides
     ──────────────────────────────────────────────────────── */
  var CRISIS_KEYWORDS = [
    'suicide', 'kill myself', 'end it all', 'want to die', 'wanna die',
    'no reason to live', 'can\'t go on', 'cannot go on', 'hopeless',
    'self-harm', 'hurt myself', 'don\'t want to be here',
    'give up on life', 'better off dead', 'end my life',
    'not worth living', 'nothing left', 'no way out'
  ];


  /* ────────────────────────────────────────────────────────
     Helpers
     ──────────────────────────────────────────────────────── */

  /**
   * Check if text contains any phrase from the list.
   * @param {string} text - lowercased user input
   * @param {string[]} phrases
   * @returns {string|null} The matched phrase, or null
   */
  function matchPhrase(text, phrases) {
    for (var i = 0; i < phrases.length; i++) {
      if (text.indexOf(phrases[i]) !== -1) {
        return phrases[i];
      }
    }
    return null;
  }

  /**
   * Build a standard routing result.
   */
  function result(intent, confidence, matched) {
    return {
      intent: intent,
      skill: INTENTS[intent] || null,
      confidence: confidence,
      matched: matched || null,
      needsClarification: false,
      clarificationQuestion: null
    };
  }


  /* ────────────────────────────────────────────────────────
     Router
     ──────────────────────────────────────────────────────── */
  var Router = {

    /** Exposed for testing / extension */
    INTENTS: INTENTS,

    /**
     * Classify user input and select the appropriate skill.
     * Crisis detection runs first as an unconditional override.
     * @param {string} userMessage
     * @param {Object} [context] - { profile, mission, history } (reserved for v2)
     * @returns {Object} { intent, skill, confidence, matched, needsClarification, clarificationQuestion }
     */
    routeAIOSIntent: function(userMessage, context) {
      if (!userMessage || typeof userMessage !== 'string') {
        return result('GENERAL_QUESTION', 0, null);
      }

      var text = userMessage.toLowerCase().trim();

      // ── 1. Crisis override (always first) ──────────────
      var crisisMatch = matchPhrase(text, CRISIS_KEYWORDS);
      if (crisisMatch) {
        return result('CRISIS_SUPPORT', 1.0, crisisMatch);
      }

      // ── 2. Keyword-based intent matching ───────────────
      for (var i = 0; i < KEYWORD_RULES.length; i++) {
        var rule = KEYWORD_RULES[i];
        var match = matchPhrase(text, rule.keywords);
        if (match) {
          return result(rule.intent, 0.8, match);
        }
      }

      // ── 3. Short-input handling ─────────────────────────
      // Only flag for clarification if the input is BOTH short
      // AND not recognizable as a meaningful term. Short inputs
      // like "GI Bill", "PTSD", "housing", "Nevada" should still
      // route to GENERAL_QUESTION with normal confidence.
      if (text.length < 12) {
        var knownTerms = [
          'gi bill', 'vr&e', 'ptsd', 'tbi', 'mst', 'housing',
          'resume', 'education', 'healthcare', 'pension', 'dental',
          'vision', 'caregiver', 'homeless', 'employment', 'burial',
          'loan', 'insurance', 'aid', 'vet center', 'champva',
          'appeal', 'nexus', 'c&p', 'comp', 'rating'
        ];
        // Also treat any US state name (2+ chars) or abbreviation as informative
        var stateTerms = [
          'alabama','alaska','arizona','arkansas','california','colorado',
          'connecticut','delaware','florida','georgia','hawaii','idaho',
          'illinois','indiana','iowa','kansas','kentucky','louisiana',
          'maine','maryland','massachusetts','michigan','minnesota',
          'mississippi','missouri','montana','nebraska','nevada',
          'new hampshire','new jersey','new mexico','new york',
          'north carolina','north dakota','ohio','oklahoma','oregon',
          'pennsylvania','rhode island','south carolina','south dakota',
          'tennessee','texas','utah','vermont','virginia','washington',
          'west virginia','wisconsin','wyoming'
        ];
        var isInformative = matchPhrase(text, knownTerms) || matchPhrase(text, stateTerms);
        if (!isInformative) {
          var r = result('GENERAL_QUESTION', 0.2, null);
          r.needsClarification = true;
          r.clarificationQuestion = 'Can you tell me a bit more about what you need help with?';
          return r;
        }
      }

      // ── 4. Default — general question ──────────────────
      return result('GENERAL_QUESTION', 0.4, null);
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
