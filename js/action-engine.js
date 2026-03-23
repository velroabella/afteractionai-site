/* ══════════════════════════════════════════════════════════
   AfterAction AI — Action Engine v1
   Smart matching + connectivity layer
   Connects: Reports → Templates → Resources → Checklist
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ── ISSUE TAXONOMY ────────────────────────────────────
  // Maps keywords in user text to structured issue tags
  var ISSUE_PATTERNS = [
    // VA / Benefits
    { pattern: /va\s*claim|disability\s*claim|file\s*(a\s*)?claim|service[\s-]connected/i, issue: 'va_claim', category: 'va_benefits' },
    { pattern: /claim\s*denied|denied\s*claim|appeal|supplemental\s*claim|higher[\s-]level\s*review/i, issue: 'va_appeal', category: 'va_benefits' },
    { pattern: /disability\s*rating|rating\s*(increase|decrease)|c\s*&?\s*p\s*exam|comp\s*and\s*pen/i, issue: 'va_rating', category: 'va_benefits' },
    { pattern: /nexus\s*letter|medical\s*opinion|service[\s-]connection/i, issue: 'nexus', category: 'va_benefits' },
    { pattern: /records?\s*request|dd[\s-]?214|service\s*records?|personnel\s*file/i, issue: 'records', category: 'va_benefits' },
    { pattern: /va\s*health|va\s*hospital|va\s*clinic|enroll.*health/i, issue: 'va_healthcare', category: 'healthcare' },
    { pattern: /gi\s*bill|education\s*benefit|tuition|school|college|training/i, issue: 'education', category: 'education' },
    { pattern: /vr\s*&?\s*e|vocational\s*rehab|chapter\s*31/i, issue: 'voc_rehab', category: 'career' },

    // Career / Employment
    { pattern: /resume|civilian\s*job|job\s*search|career|employment|hire|interview/i, issue: 'career', category: 'career' },
    { pattern: /linkedin|networking|professional\s*profile/i, issue: 'linkedin', category: 'career' },
    { pattern: /federal\s*(resume|job)|usajobs|government\s*job/i, issue: 'federal_career', category: 'career' },
    { pattern: /business|startup|entrepreneur|self[\s-]employ/i, issue: 'business', category: 'business' },
    { pattern: /salary|negotiat|compensation|pay/i, issue: 'salary', category: 'career' },
    { pattern: /licens|certificat|credential/i, issue: 'licensing', category: 'licensing' },

    // Financial
    { pattern: /debt|creditor|collection|hardship|behind\s*on\s*payment/i, issue: 'debt', category: 'financial' },
    { pattern: /credit\s*(report|score|dispute|bureau)/i, issue: 'credit', category: 'financial' },
    { pattern: /budget|financ|money|saving|income/i, issue: 'budget', category: 'financial' },
    { pattern: /va\s*loan|home\s*loan|mortgage|buy\s*(a\s*)?home/i, issue: 'va_loan', category: 'housing' },
    { pattern: /rent|apartment|lease|landlord|housing/i, issue: 'rental', category: 'housing' },
    { pattern: /property\s*tax/i, issue: 'property_tax', category: 'property_tax' },

    // Legal / Life Planning
    { pattern: /will|testament|estate\s*plan/i, issue: 'will', category: 'legal' },
    { pattern: /power\s*of\s*attorney|poa/i, issue: 'poa', category: 'legal' },
    { pattern: /living\s*will|advance\s*directive|end[\s-]of[\s-]life/i, issue: 'living_will', category: 'legal' },
    { pattern: /hipaa|medical\s*record\s*release|health\s*information/i, issue: 'hipaa', category: 'legal' },
    { pattern: /emergency\s*(contact|plan|preparedness)/i, issue: 'emergency', category: 'legal' },
    { pattern: /burial|funeral|cemetery|memorial/i, issue: 'burial', category: 'burial' },
    { pattern: /dependent|spouse|survivor|family\s*care/i, issue: 'dependent', category: 'dependent' },

    // Transition
    { pattern: /transition|separati|ets|getting\s*out|leaving\s*(the\s*)?military/i, issue: 'transition', category: 'transition' },

    // Crisis (handled separately but tagged for routing)
    { pattern: /homeless|no\s*place\s*to\s*(stay|live)|on\s*the\s*street/i, issue: 'housing_crisis', category: 'crisis' },
    { pattern: /crisis|suicid|self[\s-]harm|not\s*safe/i, issue: 'mental_health_crisis', category: 'crisis' }
  ];

  // ── TEMPLATE RECOMMENDATIONS ──────────────────────────
  // Maps issues to recommended document templates (template-flow.html?id=X)
  // AND to template-engine templates (AAAI.templates.launch(X))
  var ISSUE_TO_TEMPLATES = {
    va_claim:     { flow: ['va-claim-personal-statement'], engine: ['va_claim'] },
    va_appeal:    { flow: ['va-claim-personal-statement', 'va-appeal-letter'], engine: ['va_claim'] },
    va_rating:    { flow: ['va-claim-personal-statement', 'nexus-letter-prep'], engine: ['va_claim'] },
    nexus:        { flow: ['nexus-letter-prep', 'va-claim-personal-statement'], engine: ['va_claim'] },
    records:      { flow: ['records-request-letter'], engine: [] },
    va_healthcare:{ flow: ['benefits-eligibility-summary'], engine: [] },
    education:    { flow: ['benefits-eligibility-summary'], engine: [] },
    voc_rehab:    { flow: ['benefits-eligibility-summary', 'resume-builder'], engine: [] },
    career:       { flow: ['resume-builder', 'linkedin-profile-builder', 'interview-prep-script'], engine: ['resume'] },
    linkedin:     { flow: ['linkedin-profile-builder'], engine: ['resume'] },
    federal_career:{ flow: ['federal-resume', 'interview-prep-script'], engine: ['resume'] },
    business:     { flow: [], engine: ['business_launch'] },
    salary:       { flow: ['salary-negotiation-script'], engine: [] },
    licensing:    { flow: [], engine: [] },
    debt:         { flow: ['debt-hardship-letter', 'budget-financial-recovery-plan'], engine: ['financial_plan'] },
    credit:       { flow: ['credit-dispute-letter'], engine: [] },
    budget:       { flow: ['budget-financial-recovery-plan'], engine: ['financial_plan'] },
    va_loan:      { flow: ['va-loan-readiness-checklist'], engine: [] },
    rental:       { flow: ['rental-application-packet'], engine: [] },
    property_tax: { flow: ['benefits-eligibility-summary'], engine: [] },
    will:         { flow: ['last-will-and-testament'], engine: ['will'] },
    poa:          { flow: ['general-power-of-attorney', 'durable-power-of-attorney'], engine: ['poa'] },
    living_will:  { flow: ['living-will'], engine: ['living_will'] },
    hipaa:        { flow: ['hipaa-authorization-form'], engine: ['hipaa_auth'] },
    emergency:    { flow: ['emergency-contact-family-care-plan', 'personal-emergency-action-plan'], engine: ['emergency_contacts', 'emergency_action'] },
    burial:       { flow: ['benefits-eligibility-summary'], engine: ['burial_preferences'] },
    dependent:    { flow: ['emergency-contact-family-care-plan'], engine: ['dependent_care'] },
    transition:   { flow: ['resume-builder', 'benefits-eligibility-summary', 'budget-financial-recovery-plan'], engine: ['transition_plan'] }
  };

  // ── RESOURCE RECOMMENDATIONS ──────────────────────────
  // Maps issues to resource pages + category filters
  var ISSUE_TO_RESOURCES = {
    va_claim:     [{ page: 'hotlines-escalation.html', label: 'VA Hotlines' }, { page: 'state-benefits.html', label: 'State Benefits', filter: 'disabled_veteran' }],
    va_appeal:    [{ page: 'hotlines-escalation.html', label: 'VA Hotlines' }],
    va_rating:    [{ page: 'hotlines-escalation.html', label: 'VA Hotlines' }],
    nexus:        [{ page: 'hotlines-escalation.html', label: 'VA Hotlines' }],
    records:      [],
    va_healthcare:[{ page: 'state-benefits.html', label: 'State Health Benefits', filter: 'healthcare' }],
    education:    [{ page: 'state-benefits.html', label: 'State Education Benefits', filter: 'education' }, { page: 'grants-scholarships.html', label: 'Grants & Scholarships' }],
    voc_rehab:    [{ page: 'grants-scholarships.html', label: 'Grants & Scholarships' }],
    career:       [{ page: 'state-benefits.html', label: 'State Employment Benefits', filter: 'employment' }, { page: 'licensure.html', label: 'Licensure & Certifications' }],
    linkedin:     [],
    federal_career:[],
    business:     [{ page: 'grants-scholarships.html', label: 'Grants & Scholarships' }],
    salary:       [],
    licensing:    [{ page: 'licensure.html', label: 'Licensure & Certifications' }],
    debt:         [{ page: 'hotlines-escalation.html', label: 'Financial Hotlines' }],
    credit:       [],
    budget:       [],
    va_loan:      [{ page: 'state-benefits.html', label: 'State Housing Benefits', filter: 'housing' }],
    rental:       [{ page: 'state-benefits.html', label: 'State Housing Benefits', filter: 'housing' }],
    property_tax: [{ page: 'state-benefits.html', label: 'Property Tax Benefits', filter: 'property_tax' }],
    will:         [],
    poa:          [],
    living_will:  [],
    hipaa:        [],
    emergency:    [{ page: 'hotlines-escalation.html', label: 'Emergency Hotlines' }],
    burial:       [{ page: 'state-benefits.html', label: 'State Burial Benefits', filter: 'burial' }],
    dependent:    [{ page: 'state-benefits.html', label: 'Spouse/Dependent Benefits', filter: 'dependent' }],
    transition:   [{ page: 'state-benefits.html', label: 'State Benefits' }, { page: 'licensure.html', label: 'Licensure' }, { page: 'grants-scholarships.html', label: 'Grants' }],
    housing_crisis:[{ page: 'hotlines-escalation.html', label: 'Emergency Housing' }],
    mental_health_crisis: [{ page: 'hotlines-escalation.html', label: 'Crisis Hotlines' }]
  };

  // ── CHECKLIST TEMPLATES ───────────────────────────────
  // Auto-generate checklist items from detected issues
  var ISSUE_TO_CHECKLIST = {
    va_claim: [
      { category: 'immediate', title: 'Gather supporting documents', description: 'Collect DD-214, medical records, and any buddy statements' },
      { category: 'immediate', title: 'Write your personal statement', description: 'Use the VA Claim Personal Statement template' },
      { category: 'short_term', title: 'File your VA claim', description: 'Submit VA Form 21-526EZ with supporting evidence' },
      { category: 'short_term', title: 'Schedule C&P exam', description: 'Attend your Compensation & Pension exam when scheduled' }
    ],
    va_appeal: [
      { category: 'immediate', title: 'Review your denial letter', description: 'Identify the specific reason for denial' },
      { category: 'immediate', title: 'Choose your appeal pathway', description: 'Supplemental Claim, Higher-Level Review, or Board Appeal' },
      { category: 'short_term', title: 'Gather new evidence', description: 'Get nexus letter, new medical records, or buddy statements' },
      { category: 'short_term', title: 'Submit your appeal', description: 'File within 1 year of denial date' }
    ],
    career: [
      { category: 'immediate', title: 'Build your civilian resume', description: 'Translate military experience using the Resume Builder' },
      { category: 'immediate', title: 'Update your LinkedIn profile', description: 'Use the LinkedIn Profile Builder template' },
      { category: 'short_term', title: 'Prepare for interviews', description: 'Practice STAR method responses' },
      { category: 'short_term', title: 'Apply to target positions', description: 'Submit tailored resume to at least 5 positions per week' }
    ],
    debt: [
      { category: 'immediate', title: 'List all debts', description: 'Creditor, balance, minimum payment, interest rate' },
      { category: 'immediate', title: 'Send hardship letter', description: 'Use the Debt Hardship Letter template' },
      { category: 'short_term', title: 'Create a monthly budget', description: 'Use the Budget Recovery Plan template' },
      { category: 'strategic', title: 'Dispute inaccurate credit items', description: 'Use the Credit Dispute Letter template' }
    ],
    transition: [
      { category: 'immediate', title: 'Secure your DD-214', description: 'Ensure you have certified copies' },
      { category: 'immediate', title: 'Enroll in VA healthcare', description: 'Apply at va.gov/health-care/apply' },
      { category: 'short_term', title: 'Build your civilian resume', description: 'Use the Resume Builder template' },
      { category: 'short_term', title: 'File for VA disability', description: 'If you have service-connected conditions' },
      { category: 'short_term', title: 'Check state benefits', description: 'Review state-specific veteran benefits for your state' },
      { category: 'strategic', title: 'Build financial stability', description: 'Create a budget and build emergency fund' }
    ],
    will: [
      { category: 'immediate', title: 'Draft your will', description: 'Use the Last Will and Testament template' },
      { category: 'short_term', title: 'Have an attorney review', description: 'Free legal help available through VA' },
      { category: 'short_term', title: 'Complete related documents', description: 'Power of Attorney, Living Will, HIPAA Authorization' }
    ],
    va_loan: [
      { category: 'immediate', title: 'Get your Certificate of Eligibility', description: 'Request at va.gov or through your lender' },
      { category: 'immediate', title: 'Check your credit score', description: 'Free at annualcreditreport.com' },
      { category: 'short_term', title: 'Get pre-approved', description: 'Contact 2-3 VA-approved lenders to compare rates' },
      { category: 'short_term', title: 'Complete VA Loan Readiness Checklist', description: 'Use the template to verify all requirements' }
    ]
  };

  // ── CORE ENGINE ───────────────────────────────────────

  /**
   * Detect issues from free text (conversation, report, or user input)
   * @param {string} text - Text to analyze
   * @returns {Array} - Array of {issue, category, confidence} objects
   */
  function detectIssues(text) {
    if (!text) return [];
    var found = [];
    var seen = {};

    ISSUE_PATTERNS.forEach(function(p) {
      if (p.pattern.test(text) && !seen[p.issue]) {
        seen[p.issue] = true;
        found.push({
          issue: p.issue,
          category: p.category
        });
      }
    });

    return found;
  }

  /**
   * Get recommended templates for a set of detected issues
   * @param {Array} issues - Array from detectIssues()
   * @returns {Object} - { flow: [{id, title}], engine: [{id, title}] }
   */
  function getTemplateRecommendations(issues) {
    var flowIds = {};
    var engineIds = {};

    issues.forEach(function(iss) {
      var mapping = ISSUE_TO_TEMPLATES[iss.issue];
      if (!mapping) return;
      (mapping.flow || []).forEach(function(id) { flowIds[id] = true; });
      (mapping.engine || []).forEach(function(id) { engineIds[id] = true; });
    });

    return {
      flow: Object.keys(flowIds),
      engine: Object.keys(engineIds)
    };
  }

  /**
   * Get recommended resources for a set of detected issues
   * @param {Array} issues - Array from detectIssues()
   * @param {string} [userState] - User's state abbreviation for state-specific links
   * @returns {Array} - Array of {page, label, url} objects
   */
  function getResourceRecommendations(issues, userState) {
    var seen = {};
    var recs = [];

    issues.forEach(function(iss) {
      var resources = ISSUE_TO_RESOURCES[iss.issue];
      if (!resources) return;
      resources.forEach(function(r) {
        var key = r.page + (r.filter || '');
        if (seen[key]) return;
        seen[key] = true;

        var url = r.page;
        // Add state filter for state-benefits if we know the user's state
        if (r.page === 'state-benefits.html' && userState) {
          url += '#' + userState;
        }

        recs.push({
          page: r.page,
          label: r.label,
          url: url,
          filter: r.filter || null
        });
      });
    });

    return recs;
  }

  /**
   * Generate checklist items from detected issues
   * @param {Array} issues - Array from detectIssues()
   * @returns {Array} - Array of checklist item objects
   */
  function generateChecklist(issues) {
    var items = [];
    var seen = {};
    var sortOrder = 0;

    issues.forEach(function(iss) {
      var checkItems = ISSUE_TO_CHECKLIST[iss.issue];
      if (!checkItems) return;
      checkItems.forEach(function(item) {
        var key = item.title;
        if (seen[key]) return;
        seen[key] = true;
        items.push({
          category: item.category,
          title: item.title,
          description: item.description,
          sort_order: sortOrder++,
          is_completed: false,
          source_issue: iss.issue
        });
      });
    });

    return items;
  }

  /**
   * Get a full action plan from text analysis
   * @param {string} text - User input, report content, or conversation
   * @param {Object} [userProfile] - Optional user profile {state, branch, disability_rating}
   * @returns {Object} - Complete action plan
   */
  function getActionPlan(text, userProfile) {
    var issues = detectIssues(text);
    var state = userProfile && userProfile.state ? userProfile.state : null;

    return {
      issues: issues,
      templates: getTemplateRecommendations(issues),
      resources: getResourceRecommendations(issues, state),
      checklist: generateChecklist(issues),
      userState: state
    };
  }

  /**
   * Render a "Next Best Actions" panel as HTML
   * @param {Object} actionPlan - From getActionPlan()
   * @param {Object} [options] - {maxTemplates, maxResources, compact}
   * @returns {string} - HTML string
   */
  function renderActionPanel(actionPlan, options) {
    var opts = options || {};
    var maxT = opts.maxTemplates || 4;
    var maxR = opts.maxResources || 4;
    var compact = opts.compact || false;

    if (actionPlan.issues.length === 0) {
      return '';
    }

    var html = '<div class="action-panel">';

    // Templates section
    var allTemplates = actionPlan.templates.flow.concat(actionPlan.templates.engine.map(function(id) { return '_engine:' + id; }));
    if (allTemplates.length > 0) {
      html += '<div class="action-panel__section">';
      html += '<h4 class="action-panel__heading">Recommended Templates</h4>';
      html += '<div class="action-panel__items">';
      allTemplates.slice(0, maxT).forEach(function(id) {
        if (id.startsWith('_engine:')) {
          var engineId = id.replace('_engine:', '');
          html += '<a href="index.html?template=' + engineId + '" class="action-panel__link action-panel__link--engine">' +
            formatTemplateLabel(engineId) + '</a>';
        } else {
          html += '<a href="template-flow.html?id=' + id + '" class="action-panel__link">' +
            formatTemplateLabel(id) + '</a>';
        }
      });
      html += '</div></div>';
    }

    // Resources section
    if (actionPlan.resources.length > 0) {
      html += '<div class="action-panel__section">';
      html += '<h4 class="action-panel__heading">Helpful Resources</h4>';
      html += '<div class="action-panel__items">';
      actionPlan.resources.slice(0, maxR).forEach(function(r) {
        html += '<a href="' + r.url + '" class="action-panel__link action-panel__link--resource">' +
          r.label + '</a>';
      });
      html += '</div></div>';
    }

    html += '</div>';
    return html;
  }

  // ── HELPERS ───────────────────────────────────────────

  var TEMPLATE_LABELS = {
    'resume-builder': 'Resume Builder',
    'linkedin-profile-builder': 'LinkedIn Profile',
    'interview-prep-script': 'Interview Prep (STAR)',
    'federal-resume': 'Federal Resume (USAJobs)',
    'salary-negotiation-script': 'Salary Negotiation',
    'military-civilian-skills-translator': 'Skills Translator',
    'va-claim-personal-statement': 'VA Claim Statement',
    'va-appeal-letter': 'VA Appeal Letter',
    'nexus-letter-prep': 'Nexus Letter Prep',
    'records-request-letter': 'Records Request',
    'benefits-eligibility-summary': 'Benefits Eligibility',
    'general-power-of-attorney': 'Power of Attorney',
    'durable-power-of-attorney': 'Durable POA',
    'medical-power-of-attorney': 'Medical POA',
    'last-will-and-testament': 'Last Will & Testament',
    'living-will': 'Living Will',
    'hipaa-authorization-form': 'HIPAA Authorization',
    'emergency-contact-family-care-plan': 'Family Care Plan',
    'personal-emergency-action-plan': 'Emergency Plan',
    'debt-hardship-letter': 'Debt Hardship Letter',
    'credit-dispute-letter': 'Credit Dispute Letter',
    'budget-financial-recovery-plan': 'Budget Recovery Plan',
    'va-loan-readiness-checklist': 'VA Loan Checklist',
    'rental-application-packet': 'Rental Application',
    // Engine templates
    'resume': 'AI Resume Builder',
    'va_claim': 'AI VA Claim Builder',
    'transition_plan': 'Transition Plan',
    'business_launch': 'Business Launch Plan',
    'financial_plan': 'Financial Plan',
    'daily_mission': 'Daily Mission Planner',
    'will': 'Will Builder',
    'poa': 'POA Builder',
    'medical_poa': 'Medical POA Builder',
    'living_will': 'Living Will Builder',
    'hipaa_auth': 'HIPAA Builder',
    'emergency_contacts': 'Emergency Contacts',
    'dependent_care': 'Dependent Care Plan',
    'burial_preferences': 'Burial Preferences',
    'emergency_action': 'Emergency Action Plan'
  };

  function formatTemplateLabel(id) {
    return TEMPLATE_LABELS[id] || id.replace(/[-_]/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  }

  // ── TAG PERSISTENCE ──────────────────────────────────

  /**
   * Save detected issues to user profile (merges with existing)
   * @param {Array} issues - From detectIssues()
   * @returns {Promise|null}
   */
  function persistTags(issues) {
    if (!issues || issues.length === 0) return null;
    if (typeof AAAI !== 'undefined' && AAAI.auth && AAAI.auth.isLoggedIn && AAAI.auth.isLoggedIn()) {
      return AAAI.auth.saveIssueTags(issues);
    }
    return null;
  }

  /**
   * Get enriched action plan that combines fresh analysis with saved tags
   * Prioritizes issues the user has seen multiple times
   * @param {string} text - Current text to analyze
   * @param {Object} [userProfile] - User profile with issue_tags
   * @returns {Object} - Enriched action plan with priority scoring
   */
  function getEnrichedPlan(text, userProfile) {
    var plan = getActionPlan(text, userProfile);

    // If user has saved tags, merge and prioritize
    var savedTags = [];
    if (userProfile && userProfile.issue_tags && Array.isArray(userProfile.issue_tags)) {
      savedTags = userProfile.issue_tags;
    }

    if (savedTags.length > 0) {
      var tagMap = {};
      savedTags.forEach(function(t) { tagMap[t.issue] = t; });

      // Score current issues: higher if they've appeared before
      plan.issues.forEach(function(iss) {
        var saved = tagMap[iss.issue];
        if (saved) {
          iss.priority = (saved.count || 1) + 1;
          iss.recurring = true;
        } else {
          iss.priority = 1;
          iss.recurring = false;
        }
      });

      // Sort by priority (recurring issues first)
      plan.issues.sort(function(a, b) { return (b.priority || 1) - (a.priority || 1); });

      // Add any saved issues NOT in current text as secondary recommendations
      var currentIssueMap = {};
      plan.issues.forEach(function(iss) { currentIssueMap[iss.issue] = true; });

      savedTags.forEach(function(t) {
        if (!currentIssueMap[t.issue] && (t.count || 1) >= 2) {
          plan.issues.push({
            issue: t.issue,
            category: t.category,
            priority: 0,
            recurring: true,
            fromHistory: true
          });
        }
      });

      // Regenerate recommendations with enriched issues
      plan.templates = getTemplateRecommendations(plan.issues);
      plan.resources = getResourceRecommendations(plan.issues, plan.userState);
    }

    plan.savedTagCount = savedTags.length;
    return plan;
  }

  /**
   * Auto-save checklist items from action engine to Supabase
   * @param {string} reportId - Report ID to link to
   * @param {Array} issues - Detected issues
   * @returns {Promise|null}
   */
  function autoSaveChecklist(reportId, issues) {
    if (!issues || issues.length === 0) return null;
    if (typeof AAAI !== 'undefined' && AAAI.auth && AAAI.auth.isLoggedIn && AAAI.auth.isLoggedIn()) {
      var checklistItems = generateChecklist(issues);
      if (checklistItems.length > 0) {
        return AAAI.auth.saveAutoChecklist(reportId, checklistItems);
      }
    }
    return null;
  }

  /**
   * Render enriched action panel with priority indicators
   * @param {Object} actionPlan - From getEnrichedPlan()
   * @param {Object} [options]
   * @returns {string} - HTML string
   */
  function renderEnrichedPanel(actionPlan, options) {
    var baseHtml = renderActionPanel(actionPlan, options);
    if (!baseHtml) return '';

    // Add recurring issue badges
    var recurringIssues = actionPlan.issues.filter(function(i) { return i.recurring; });
    if (recurringIssues.length > 0) {
      var badgeHtml = '<div class="action-panel__section">';
      badgeHtml += '<h4 class="action-panel__heading">Your Focus Areas</h4>';
      badgeHtml += '<div class="action-panel__items">';
      recurringIssues.forEach(function(iss) {
        var label = formatTemplateLabel(iss.issue);
        var badge = iss.fromHistory ? ' (from previous sessions)' : '';
        badgeHtml += '<span class="action-panel__tag">' + label + badge + '</span>';
      });
      badgeHtml += '</div></div>';

      // Insert focus areas before the templates section
      baseHtml = baseHtml.replace('<div class="action-panel__section">', badgeHtml + '<div class="action-panel__section">');
    }

    return baseHtml;
  }

  // ── PUBLIC API ────────────────────────────────────────
  window.AAAI = window.AAAI || {};
  window.AAAI.actions = {
    detectIssues: detectIssues,
    getTemplateRecommendations: getTemplateRecommendations,
    getResourceRecommendations: getResourceRecommendations,
    generateChecklist: generateChecklist,
    getActionPlan: getActionPlan,
    renderActionPanel: renderActionPanel,
    persistTags: persistTags,
    getEnrichedPlan: getEnrichedPlan,
    autoSaveChecklist: autoSaveChecklist,
    renderEnrichedPanel: renderEnrichedPanel,
    ISSUE_PATTERNS: ISSUE_PATTERNS,
    ISSUE_TO_TEMPLATES: ISSUE_TO_TEMPLATES,
    ISSUE_TO_RESOURCES: ISSUE_TO_RESOURCES,
    ISSUE_TO_CHECKLIST: ISSUE_TO_CHECKLIST
  };

})();
