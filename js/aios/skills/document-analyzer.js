/* ══════════════════════════════════════════════════════════
   AIOS Skill — Document Analyzer  (Phase 16)
   Analyzes uploaded veteran documents (DD-214, VA letters,
   rating decisions, medical records, transcripts, and other
   documents) to extract key data, explain findings in plain
   language, and recommend concrete next steps.

   Integration:
   - Triggered by AIOS Router when uploadContext string contains
     DOCUMENT_ANALYSIS intent keywords
   - run() returns { prompt, data } — prompt is injected into
     system prompt by RequestBuilder; data.unknownFields adds
     SKILL HINTS block
   - All output must be based ONLY on document content present
     in the message — no fabrication, no overclaiming

   Uncertainty rules (enforced via prompt):
   - If document text is a placeholder (PDF/image not extracted),
     say so and ask the veteran to describe it
   - If document type is ambiguous, state what it appears to be
     and ask for confirmation
   - Never invent dates, ratings, or eligibility conclusions
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ── Document type detection keywords ──────────────────── */
  var TYPE_PATTERNS = [
    {
      id: 'dd214',
      label: 'DD-214 (Certificate of Release or Discharge)',
      patterns: [
        /dd[-\s]?214/i, /discharge\s+document/i, /certificate\s+of\s+release/i,
        /separation\s+document/i, /discharge\s+papers/i, /service\s+record/i
      ]
    },
    {
      id: 'rating-decision',
      label: 'VA Rating Decision',
      patterns: [
        /rating\s+decision/i, /combined\s+rating/i, /disability\s+rating/i,
        /service[-\s]connected/i, /non[-\s]service[-\s]connected/i,
        /percentage\s+rating/i, /rating\s+letter/i
      ]
    },
    {
      id: 'va-letter',
      label: 'VA Benefit Letter',
      patterns: [
        /benefit\s+letter/i, /award\s+letter/i, /va\s+letter/i,
        /compensation\s+letter/i, /pension\s+letter/i,
        /summary\s+of\s+benefits/i, /benefits\s+verification/i
      ]
    },
    {
      id: 'medical',
      label: 'Medical Record or Treatment Record',
      patterns: [
        /medical\s+record/i, /treatment\s+record/i, /clinical\s+note/i,
        /nexus\s+letter/i, /buddy\s+statement/i, /dbq/i,
        /disability\s+benefits\s+questionnaire/i, /va\s+medical/i,
        /diagnosis/i, /prognosis/i
      ]
    },
    {
      id: 'appeal',
      label: 'VA Appeal Document',
      patterns: [
        /notice\s+of\s+disagreement/i, /nod\b/i, /board\s+of\s+veterans/i,
        /bva\b/i, /higher.level\s+review/i, /supplemental\s+claim/i,
        /decision\s+review/i, /appeal\s+document/i
      ]
    },
    {
      id: 'transcript',
      label: 'Military Training or Education Transcript',
      patterns: [
        /transcript/i, /course\s+completion/i, /military\s+education/i,
        /joint\s+service\s+transcript/i, /jst\b/i, /aarts\b/i, /smart\b/i
      ]
    }
  ];

  /* ── Detect document type from uploadContext string ─────── */
  function _detectDocType(userInput) {
    if (!userInput) return 'unknown';
    for (var i = 0; i < TYPE_PATTERNS.length; i++) {
      var typeObj = TYPE_PATTERNS[i];
      for (var j = 0; j < typeObj.patterns.length; j++) {
        if (typeObj.patterns[j].test(userInput)) {
          return typeObj.id;
        }
      }
    }
    return 'unknown';
  }

  /* ── Detect placeholder content (PDF/image not extracted) ── */
  function _isPlaceholder(userInput) {
    if (!userInput) return false;
    return /\[PDF content not yet extracted\]|\[Image content not yet extracted\]|\[Binary file\]/i.test(userInput);
  }

  /* ── Build base instructions shared by all document types ── */
  var BASE_INSTRUCTIONS = [
    '## DOCUMENT ANALYSIS MODE',
    '',
    'The veteran has uploaded a document. Analyze it using these rules:',
    '',
    '### ABSOLUTE RULES — never break these:',
    '- Base ALL analysis ONLY on text that appears in the document content below.',
    '- Do NOT invent, assume, or fill in any field that is absent from the document.',
    '- Do NOT overclaim eligibility or guaranteed outcomes.',
    '- If the document text is a placeholder (e.g., "[PDF content not yet extracted]"),',
    '  explain that the file could not be read as text, then ask the veteran to',
    '  describe the document or copy and paste key sections.',
    '- If you are uncertain what type of document this is, state your best guess and',
    '  ask the veteran to confirm.',
    '',
    '### RESPONSE STRUCTURE — follow this order:',
    '1. **Document Type** — Identify what type of document this is.',
    '2. **Key Information Found** — List the specific facts present in the document.',
    '3. **What This Means For You** — Explain the significance in plain language.',
    '4. **Recommended Next Steps** — Give 2–4 concrete actions based on this document.',
    '5. **Questions** — If any field is missing that would change the advice, ask for it.',
    ''
  ].join('\n');

  /* ── Type-specific extraction guidance ─────────────────── */
  var TYPE_GUIDANCE = {

    'dd214': [
      '### DD-214 EXTRACTION CHECKLIST',
      'Look for and report these fields if present:',
      '- Character of Discharge (Honorable / General / OTH / Bad Conduct / Dishonorable)',
      '- Branch of Service and Component (Active / Reserve / Guard)',
      '- Service Entry and Separation Dates (total time in service)',
      '- Military Occupational Specialty (MOS), Rate, or AFSC',
      '- Decorations, Medals, and Awards',
      '- Combat Service Indicator (Box 13 — served in combat theater?)',
      '- Separation Code and Reentry Code (RE code)',
      '',
      '### DD-214 NEXT-STEP GUIDANCE (use only if relevant fields are present):',
      '- Honorable discharge → veteran is eligible for VA healthcare and benefits; suggest filing for benefits',
      '- General Under Honorable Conditions → most VA benefits still available; clarify what the veteran wants',
      '- OTH or Bad Conduct → mention Character of Discharge review process without guaranteeing outcome',
      '- Dishonorable → mention limited VA eligibility; do not speculate on specifics',
      '- Combat service indicator present → mention VA Priority Group 6 eligibility for combat veterans',
      '- Purple Heart or combat awards present → mention VA Priority Group 3',
      ''
    ].join('\n'),

    'rating-decision': [
      '### VA RATING DECISION EXTRACTION CHECKLIST',
      'Look for and report these fields if present:',
      '- Combined Disability Rating percentage',
      '- Effective Date of the rating',
      '- Each rated condition and its individual percentage',
      '- Any conditions denied and the stated reason for denial',
      '- Any "not service-connected" determinations',
      '- Monthly compensation amount (if stated)',
      '',
      '### RATING DECISION NEXT-STEP GUIDANCE:',
      '- Rating < 100%: Mention that additional conditions can be added via new claim; do not guarantee increase',
      '- Denied conditions: Mention the right to appeal (Supplemental Claim, Higher-Level Review, or BVA appeal)',
      '- 70%+ rating: Note TDIU (Total Disability based on Individual Unemployability) may be possible if veteran cannot work',
      '- Effective date present: Explain what effective date means for back-pay',
      '- Do NOT calculate combined rating math — the VA uses a specific formula; just report what the document states',
      ''
    ].join('\n'),

    'va-letter': [
      '### VA BENEFIT LETTER EXTRACTION CHECKLIST',
      'Look for and report these fields if present:',
      '- Type of benefit confirmed (compensation, pension, education, home loan, etc.)',
      '- Monthly payment amount and effective date',
      '- Current disability rating (if stated)',
      '- Dependent information (if any)',
      '- Any recertification or renewal deadlines',
      '- Contact information or claim number',
      '',
      '### VA BENEFIT LETTER NEXT-STEP GUIDANCE:',
      '- Compensation letter: Confirm veteran knows how to update dependents if needed',
      '- Pension letter: Note income and net-worth limits may affect future eligibility',
      '- Education (GI Bill) letter: Ask if veteran wants help finding approved programs',
      '- Home loan letter: Note the COE is used to obtain a VA-backed mortgage',
      ''
    ].join('\n'),

    'medical': [
      '### MEDICAL RECORD EXTRACTION CHECKLIST',
      'Look for and report these fields if present:',
      '- Diagnosed conditions or injuries',
      '- Any mention of service connection or nexus language',
      '- Treatment dates',
      '- Provider name and facility (VA vs. private)',
      '- Functional limitations described',
      '',
      '### MEDICAL RECORD NEXT-STEP GUIDANCE:',
      '- Nexus language present ("due to", "caused by", "related to" military service): Explain this strengthens a VA claim',
      '- Diagnosis without nexus: Mention that a nexus letter from a doctor may help connect it to service',
      '- VA treatment record: Note it is already in the VA system; may support existing or new claim',
      '- Private medical record: Recommend submitting it to VA as evidence via VA Form 21-4142',
      '- Buddy Statement / DBQ: Explain its role as supporting evidence in a claim',
      '- Caution: Do NOT diagnose, do NOT predict VA rating outcomes based on diagnosis alone',
      ''
    ].join('\n'),

    'appeal': [
      '### VA APPEAL DOCUMENT EXTRACTION CHECKLIST',
      'Look for and report these fields if present:',
      '- Appeal type (Notice of Disagreement, Supplemental Claim, Higher-Level Review, BVA)',
      '- Issue(s) being appealed',
      '- Decision date being appealed from',
      '- Deadline dates for filing',
      '- Any docket or claim number',
      '',
      '### APPEAL NEXT-STEP GUIDANCE:',
      '- Notice of Disagreement / BVA appeal: Explain 3 decision review lanes (Supplemental, HLR, BVA)',
      '- Supplemental Claim: Note that new and relevant evidence is required',
      '- Higher-Level Review: Note that no new evidence is submitted; a senior reviewer reconsiders',
      '- Deadlines present: Emphasize acting before any stated deadline',
      '- Recommend VSO assistance for appeal prep without making specific outcome promises',
      ''
    ].join('\n'),

    'transcript': [
      '### MILITARY TRANSCRIPT EXTRACTION CHECKLIST',
      'Look for and report these fields if present:',
      '- Courses completed and credit hour recommendations',
      '- ACE (American Council on Education) credit recommendations',
      '- Military Occupational Specialty training listed',
      '- College-level equivalency recommendations',
      '',
      '### TRANSCRIPT NEXT-STEP GUIDANCE:',
      '- Recommend submitting transcript to colleges for credit evaluation',
      '- Mention that ACE credit recommendations are not guaranteed acceptance — each school decides',
      '- Ask if veteran is using a GI Bill benefit for college — that affects school selection',
      ''
    ].join('\n'),

    'unknown': [
      '### UNKNOWN DOCUMENT TYPE',
      '- State that you are not certain what type of document this is.',
      '- Describe what the document appears to contain based on its content.',
      '- Ask the veteran: "Can you tell me more about this document so I can give you the right guidance?"',
      '- Still extract any factual information visible in the document content.',
      '- Do NOT guess at eligibility or benefits based on an unidentified document.',
      ''
    ].join('\n')

  };

  /* ── Placeholder prompt (PDF/image not readable) ────────── */
  var PLACEHOLDER_PROMPT = [
    '## DOCUMENT ANALYSIS MODE — FILE NOT READABLE AS TEXT',
    '',
    'The veteran uploaded a file, but its content could not be extracted as readable text.',
    'This typically happens with PDFs that are scanned images, or with image files.',
    '',
    'Your response should:',
    '1. Acknowledge that the file was received but cannot be read directly.',
    '2. Explain this in simple terms (no technical jargon).',
    '3. Ask the veteran to either:',
    '   a) Describe what the document says, or',
    '   b) Copy and paste the key information from it.',
    '4. Tell them that once you know the content, you can help them understand it',
    '   and figure out next steps.',
    '',
    'Do NOT attempt to guess or fill in document content.',
    ''
  ].join('\n');

  /* ── Main build function ────────────────────────────────── */
  function _buildPrompt(docType, isPlaceholder) {
    if (isPlaceholder) {
      return PLACEHOLDER_PROMPT;
    }
    var typeGuidance = TYPE_GUIDANCE[docType] || TYPE_GUIDANCE['unknown'];
    return BASE_INSTRUCTIONS + '\n' + typeGuidance;
  }

  /* ── Skill definition ───────────────────────────────────── */
  var DocumentAnalyzer = {

    id: 'document-analyzer',
    name: 'Document Analyzer',
    description: 'Extracts key data from uploaded veteran documents and recommends next steps.',

    triggers: [
      'upload', 'document', 'DD-214', 'DD214',
      'VA letter', 'medical record', 'discharge papers',
      'service record', 'benefit letter', 'rating decision'
    ],

    prompt: '',  // Base prompt unused — run() builds it dynamically

    requiredFields: [],

    supportedTypes: ['dd214', 'va-letter', 'medical', 'rating-decision', 'appeal', 'transcript', 'unknown'],

    /**
     * Execute the skill against the current context.
     * @param {Object} context - { profile, history, userInput, document }
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      var userInput = (context && context.userInput) ? String(context.userInput) : '';

      var placeholder = _isPlaceholder(userInput);
      var docType     = placeholder ? 'unknown' : _detectDocType(userInput);

      var prompt = _buildPrompt(docType, placeholder);

      var data = {};
      if (docType === 'unknown' && !placeholder) {
        data.unknownFields = ['document type could not be determined — ask veteran to confirm'];
      }

      return { prompt: prompt, data: data };
    }

  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['document-analyzer'] = DocumentAnalyzer;

})();
