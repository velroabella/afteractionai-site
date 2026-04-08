/* ══════════════════════════════════════════════════════════
   AfterAction AI — Action Engine v1
   Smart matching + connectivity layer
   Connects: Reports → Templates → Resources → Checklist
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ── ISSUE TAXONOMY ────────────────────────────────────
  // Maps keywords in user text to structured issue tags.
  //
  // PRIORITY TIERS — evaluated top-to-bottom, first match wins per tier.
  // Tier 1 (CRITICAL): Crisis & emergency — must always route first
  // Tier 2 (URGENT):   Financial distress & emergency assistance
  // Tier 3 (DISCOVERY): Hidden/overlooked benefit detection
  // Tier 4 (STANDARD):  All other specific issue patterns
  //
  // IMPORTANT: Order matters! Higher-priority patterns MUST come before
  // lower-priority patterns that share overlapping keywords.
  //
  var ISSUE_PATTERNS = [

    // ════ TIER 1: CRISIS — always evaluated first ═══════════
    // NOTE: These use negation-aware matching. The detectIssues() function
    // checks for negation words (not, no, don't, isn't, aren't, never)
    // within 5 words before the trigger term and skips the match if found.
    { pattern: /crisis|suicid|self[\s-]harm|not\s*safe/i, issue: 'mental_health_crisis', category: 'crisis', priority: 1, negationAware: true },
    { pattern: /homeless|no\s*place\s*to\s*(stay|live)|on\s*the\s*street/i, issue: 'housing_crisis', category: 'crisis', priority: 1, negationAware: true },

    // ════ TIER 2: EMERGENCY / FINANCIAL DISTRESS ════════════
    // Context-specific compound patterns — must come BEFORE generic
    // keywords like "pay", "rent", "money", "food"
    { pattern: /can['\u2019]?t\s*(pay|afford)\s*(my\s*)?(rent|bills?|utilit|mortgage)|behind\s*on\s*(my\s*)?(rent|bills?|utilit|mortgage)/i, issue: 'emergency_aid', category: 'crisis', priority: 2 },
    { pattern: /about\s*to\s*(be\s*)?(evict|lose\s*(my\s*)?home|foreclos)|might\s*lose\s*(my\s*)?home/i, issue: 'emergency_aid', category: 'crisis', priority: 2 },
    { pattern: /utility\s*shutoff|shutoff\s*notice|power\s*(shut\s*off|disconnect|cut\s*off)|water\s*(shut\s*off|disconnect)|(electric|gas|water)\s*(bill|shutoff|disconnect|shut\s*off)|help\s*with\s*(my\s*)?(utilit|electric|gas|water)/i, issue: 'emergency_aid', category: 'crisis', priority: 2 },
    { pattern: /food\s*(bank|pantry|assist|stamp|insecur)|no\s*food|hungry|can['\u2019]?t\s*(afford|buy)\s*(food|groceries)|groceries/i, issue: 'emergency_aid', category: 'crisis', priority: 2 },
    { pattern: /emergency\s*(assist|help|fund|aid|financ|money|relief)/i, issue: 'emergency_aid', category: 'crisis', priority: 2 },
    { pattern: /urgent\s*(help|need|assist)|need\s*help\s*(now|immediate|today|right\s*now)/i, issue: 'emergency_aid', category: 'crisis', priority: 2 },
    { pattern: /need\s+.*help\s+.*paying|need\s*help\s*paying|need\s*money\s*for\s*(rent|food|bills?|utilit)/i, issue: 'emergency_aid', category: 'crisis', priority: 2 },
    { pattern: /financial\s*(crisis|emergency|distress|trouble|desperate)/i, issue: 'emergency_aid', category: 'crisis', priority: 2 },
    { pattern: /nowhere\s*to\s*(turn|go)|don['\u2019]?t\s*know\s*what\s*to\s*do|desperate/i, issue: 'emergency_aid', category: 'crisis', priority: 2 },
    { pattern: /low\s*on\s*money|running\s*(low\s*on|out\s*of)\s*money|programs?\s*to\s*help\s*with\s*(utilit|bills?|rent|electric|gas|water)/i, issue: 'emergency_aid', category: 'crisis', priority: 2 },
    { pattern: /financial\s*assist/i, issue: 'emergency_aid', category: 'crisis', priority: 2 },

    // ════ TIER 3: BENEFIT DISCOVERY ═════════════════════════
    { pattern: /hidden\s*(veteran\s*)?benefit|overlooked\s*benefit|unclaimed\s*benefit|missing\s*benefit/i, issue: 'hidden_benefit', category: 'va_benefits', priority: 3 },
    { pattern: /what\s*(benefits?|am\s*i)\s*(am\s*i\s*)?missing|benefits?\s*(i\s*)?don['\u2019]?t\s*(i\s*)?know|benefits?\s*(that\s*)?i\s*(don['\u2019]?t|should)\s*know/i, issue: 'hidden_benefit', category: 'va_benefits', priority: 3 },
    { pattern: /am\s*i\s*getting\s*everything|other\s*benefits?|what\s*else\s*(is|can|am)\s*(available|i\s*(eligible|entitled))/i, issue: 'hidden_benefit', category: 'va_benefits', priority: 3 },
    { pattern: /clothing\s*allowance|vmli|sdvi|vgli\s*conver|commissary\s*access|national\s*park\s*pass/i, issue: 'hidden_benefit', category: 'va_benefits', priority: 3 },

    // ════ TIER 4: STANDARD PATTERNS ═════════════════════════

    // VA / Benefits — va_appeal BEFORE va_claim so "claim denied" matches appeal first
    { pattern: /claim\s*(was\s*|got\s*)?denied|denied\s*claim|appeal|supplemental\s*claim|higher[\s-]level\s*review/i, issue: 'va_appeal', category: 'va_benefits', priority: 4 },
    { pattern: /va\s*claim|disability\s*claim|file\s*(a\s*)?claim|service[\s-]connected/i, issue: 'va_claim', category: 'va_benefits', priority: 4 },
    { pattern: /disability\s*rating|rating\s*(increase|decrease)|c\s*&?\s*p\s*exam|comp\s*and\s*pen/i, issue: 'va_rating', category: 'va_benefits', priority: 4 },
    { pattern: /nexus\s*letter|medical\s*opinion|service[\s-]connection/i, issue: 'nexus', category: 'va_benefits', priority: 4 },
    { pattern: /records?\s*request|dd[\s-]?214|service\s*records?|personnel\s*file/i, issue: 'records', category: 'va_benefits', priority: 4 },
    { pattern: /ptsd|mental\s*health|tbi|anxiety|depression|therapy|counseling/i, issue: 'mental_health', category: 'healthcare', priority: 4 },
    { pattern: /va\s*health|va\s*hospital|va\s*clinic|enroll.*health/i, issue: 'va_healthcare', category: 'healthcare', priority: 4 },
    { pattern: /gi\s*bill|education\s*benefit|tuition|school|college|training|grant|scholarship/i, issue: 'education', category: 'education', priority: 4 },
    { pattern: /vr\s*&?\s*e|vocational\s*rehab|chapter\s*31/i, issue: 'voc_rehab', category: 'career', priority: 4 },

    // Career / Employment
    { pattern: /resume|civilian\s*job|job\s*search|\bjob\b|career|employment|hire|interview/i, issue: 'career', category: 'career', priority: 4 },
    { pattern: /linkedin|networking|professional\s*profile/i, issue: 'linkedin', category: 'career', priority: 4 },
    { pattern: /federal\s*(resume|job)|usajobs|government\s*job/i, issue: 'federal_career', category: 'career', priority: 4 },
    { pattern: /business|startup|entrepreneur|self[\s-]employ/i, issue: 'business', category: 'business', priority: 4 },
    { pattern: /salary|negotiat|how\s*much\s*(do\s*i\s*)?(get\s*)?paid|pay\s*(raise|increase|grade|scale|band)/i, issue: 'salary', category: 'career', priority: 4 },
    { pattern: /licens|certificat|credential/i, issue: 'licensing', category: 'licensing', priority: 4 },

    // Financial Optimization — BEFORE budget/discount so "save money veteran" matches here first
    { pattern: /financial\s*(optimization|position|health)|maximize\s*(my\s*)?(va\s*)?benefits|save\s*money\s*(as\s*a\s*)?veteran|win\s*financially|money\s*after\s*(the\s*)?military|improve\s*(my\s*)?financial/i, issue: 'financial_optimization', category: 'financial', priority: 4 },

    // Financial (non-emergency)
    { pattern: /debt|creditor|collection|hardship|behind\s*on\s*payment/i, issue: 'debt', category: 'financial', priority: 4 },
    { pattern: /credit\s*(report|score|dispute|bureau)/i, issue: 'credit', category: 'financial', priority: 4 },
    { pattern: /budget|financ|money\s*(manage|plan|save)|saving|income/i, issue: 'budget', category: 'financial', priority: 4 },
    { pattern: /va\s*loan|home\s*loan|mortgage|buy\s*(a\s*)?home/i, issue: 'va_loan', category: 'housing', priority: 4 },
    { pattern: /rent|apartment|lease|landlord|housing/i, issue: 'rental', category: 'housing', priority: 4 },
    { pattern: /property\s*tax/i, issue: 'property_tax', category: 'property_tax', priority: 4 },
    { pattern: /state\s*(veteran|vet)\s*benefit/i, issue: 'state_benefits', category: 'state_benefits', priority: 4 },

    // Legal / Life Planning — living_will BEFORE will so "living will" matches specific first
    { pattern: /living\s*will|advance\s*directive|end[\s-]of[\s-]life/i, issue: 'living_will', category: 'legal', priority: 4 },
    { pattern: /\b(last\s*)?will\s*(and\s*testament)?(?=\s|$)|testament|estate\s*plan/i, issue: 'will', category: 'legal', priority: 4 },
    { pattern: /power\s*of\s*attorney|poa/i, issue: 'poa', category: 'legal', priority: 4 },
    { pattern: /hipaa|medical\s*record\s*release|health\s*information/i, issue: 'hipaa', category: 'legal', priority: 4 },
    { pattern: /emergency\s*(contact|plan|preparedness)/i, issue: 'emergency', category: 'legal', priority: 4 },
    { pattern: /burial|funeral|cemetery|memorial/i, issue: 'burial', category: 'burial', priority: 4 },
    { pattern: /dependent|spouse|survivor|family\s*(care|support|resource|benefit)/i, issue: 'dependent', category: 'dependent', priority: 4 },

    // Discounts / Savings
    { pattern: /discount|coupon|deal|promo|save\s*money|savings|military\s*(rate|price|offer)/i, issue: 'discount', category: 'financial', priority: 4 },

    // Service Dogs
    { pattern: /service\s*dog|therapy\s*dog|canine\s*(assist|compan)|emotional\s*support\s*animal/i, issue: 'service_dog', category: 'healthcare', priority: 4 },

    // Wellness & Fitness
    { pattern: /wellness|fitness\s*program|adaptive\s*sport|equine\s*therapy|yoga|meditation|surf\s*therapy|outdoor\s*therapy|veteran\s*(recreation|fitness)/i, issue: 'wellness', category: 'healthcare', priority: 4 },

    // Advocacy / Elected Officials
    { pattern: /congressman|senator|representat|elected\s*official|legislat|congress|veteran.*committee/i, issue: 'advocacy', category: 'legal', priority: 4 },

    // Medical Treatment / Alternative Therapy
    { pattern: /alternative\s*therap|psychedelic|ketamine|ibogaine|psilocybin|ayahuasca|holistic\s*treat|telehealth|brain\s*injury\s*treat/i, issue: 'medical_treatment', category: 'healthcare', priority: 4 },

    // Transition
    { pattern: /transition|separati|ets\b|getting\s*out|got\s*out\s*(of\s*)?(the\s*)?military|leaving\s*(the\s*)?military|left\s*(the\s*)?military|after\s*(the\s*)?military|civilian\s*life|post[\s-]military|what\s*do\s*i\s*do\s*after|skillbridge/i, issue: 'transition', category: 'transition', priority: 4 },

    // Outdoor Recreation
    { pattern: /outdoor\s*(recreation|discount|program|benefit)|park\s*pass|national\s*park|state\s*park\s*(pass|discount|free)|hunting\s*license|fishing\s*license|camping\s*discount|ski\s*(resort|discount|pass|military)|veteran\s*(outdoor|recreation|hiking|camping)/i, issue: 'outdoor_recreation', category: 'recreation', priority: 4 },

    // Contractor Careers
    { pattern: /contractor|defense\s*contract|security\s*clearance|cleared\s*(job|position|professional)|dod\s*8(140|570)|lockheed|raytheon|northrop|booz\s*allen|intelligence\s*career|skillbridge\s*employer/i, issue: 'contractor_career', category: 'employment', priority: 4 }
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
    mental_health:{ flow: ['benefits-eligibility-summary'], engine: [] },
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
    transition:   { flow: ['resume-builder', 'benefits-eligibility-summary', 'budget-financial-recovery-plan'], engine: ['transition_plan'] },
    discount:             { flow: [], engine: [] },
    outdoor_recreation:   { flow: [], engine: [] },
    contractor_career:    { flow: ['resume-builder'], engine: ['career'] },
    service_dog:          { flow: [], engine: [] },
    wellness:             { flow: [], engine: [] },
    advocacy:             { flow: [], engine: [] },
    medical_treatment:    { flow: ['benefits-eligibility-summary'], engine: [] },
    financial_optimization: { flow: ['budget-financial-recovery-plan', 'benefits-eligibility-summary'], engine: ['financial_plan'] },
    state_benefits:       { flow: ['benefits-eligibility-summary'], engine: [] },
    hidden_benefit:       { flow: ['benefits-eligibility-summary'], engine: [] },
    emergency_aid:        { flow: ['personal-emergency-action-plan', 'budget-financial-recovery-plan'], engine: ['emergency_action'] },
    housing_crisis:       { flow: ['personal-emergency-action-plan'], engine: ['emergency_action'] },
    mental_health_crisis: { flow: ['personal-emergency-action-plan', 'emergency-contact-family-care-plan'], engine: ['emergency_action'] }
  };

  // ── RESOURCE RECOMMENDATIONS ──────────────────────────
  // Maps issues to resource pages + category filters
  var ISSUE_TO_RESOURCES = {
    va_claim:     [{ page: 'hotlines-escalation.html', label: 'VA Hotlines' }, { page: 'state-benefits.html', label: 'State Benefits', filter: 'disabled_veteran' }],
    va_appeal:    [{ page: 'hotlines-escalation.html', label: 'VA Hotlines' }],
    va_rating:    [{ page: 'hotlines-escalation.html', label: 'VA Hotlines' }],
    nexus:        [{ page: 'hotlines-escalation.html', label: 'VA Hotlines' }],
    records:      [{ page: 'document-templates.html', label: 'Document Templates' }],
    mental_health:[{ page: 'medical-help.html', label: 'Mental Health Resources' }, { page: 'wellness.html', label: 'Wellness & Fitness' }, { page: 'hotlines-escalation.html', label: 'VA Hotlines' }],
    va_healthcare:[{ page: 'medical-help.html', label: 'VA Healthcare' }, { page: 'state-benefits.html', label: 'State Health Benefits', filter: 'healthcare' }, { page: 'wellness.html', label: 'Wellness & Fitness' }],
    education:    [{ page: 'education.html', label: 'Education Benefits' }, { page: 'state-benefits.html', label: 'State Education Benefits', filter: 'education' }, { page: 'grants-scholarships.html', label: 'Grants & Scholarships' }],
    voc_rehab:    [{ page: 'education.html', label: 'Education Benefits' }, { page: 'grants-scholarships.html', label: 'Grants & Scholarships' }],
    career:       [{ page: 'resources.html', label: 'Employment Resources', filter: 'employment' }, { page: 'state-benefits.html', label: 'State Employment Benefits', filter: 'employment' }, { page: 'licensure.html', label: 'Licensure & Certifications' }, { page: 'military-discounts.html', label: 'Military Discounts' }],
    linkedin:     [{ page: 'resources.html', label: 'Career Resources', filter: 'employment' }],
    federal_career:[{ page: 'resources.html', label: 'Employment Resources', filter: 'employment' }],
    business:     [{ page: 'resources.html', label: 'Entrepreneurship Resources', filter: 'entrepreneurship' }, { page: 'grants-scholarships.html', label: 'Grants & Scholarships' }, { page: 'military-discounts.html', label: 'Military Discounts' }],
    salary:       [{ page: 'resources.html', label: 'Career Resources', filter: 'employment' }, { page: 'military-discounts.html', label: 'Military Discounts' }],
    licensing:    [{ page: 'licensure.html', label: 'Licensure & Certifications' }, { page: 'state-benefits.html', label: 'State Licensing Benefits', filter: 'licensing' }],
    debt:         [{ page: 'financial-optimization.html', label: 'Financial Optimization' }, { page: 'hotlines-escalation.html', label: 'Financial Hotlines' }, { page: 'military-discounts.html', label: 'Military Discounts' }, { page: 'emergency-assistance.html', label: 'Emergency Assistance' }],
    credit:       [{ page: 'hotlines-escalation.html', label: 'Financial Hotlines' }],
    budget:       [{ page: 'financial-optimization.html', label: 'Financial Optimization' }, { page: 'resources.html', label: 'Financial Resources', filter: 'benefits' }, { page: 'military-discounts.html', label: 'Military Discounts' }, { page: 'hidden-benefits.html', label: 'Hidden Benefits' }],
    va_loan:      [{ page: 'grants-scholarships.html', label: 'Housing Grants' }, { page: 'state-benefits.html', label: 'State Housing Benefits', filter: 'housing' }],
    rental:       [{ page: 'resources.html', label: 'Housing Resources', filter: 'housing' }, { page: 'state-benefits.html', label: 'State Housing Benefits', filter: 'housing' }],
    property_tax: [{ page: 'state-benefits.html', label: 'Property Tax Benefits', filter: 'property_tax' }],
    will:         [{ page: 'document-templates.html', label: 'Legal Templates' }],
    poa:          [{ page: 'document-templates.html', label: 'Legal Templates' }],
    living_will:  [{ page: 'document-templates.html', label: 'Legal Templates' }],
    hipaa:        [{ page: 'document-templates.html', label: 'Legal Templates' }],
    emergency:    [{ page: 'hotlines-escalation.html', label: 'Emergency Hotlines' }, { page: 'emergency-assistance.html', label: 'Emergency Assistance' }],
    burial:       [{ page: 'state-benefits.html', label: 'State Burial Benefits', filter: 'burial' }],
    dependent:    [{ page: 'families-support.html', label: 'Family Support' }, { page: 'state-benefits.html', label: 'Spouse/Dependent Benefits', filter: 'dependent' }],
    transition:   [{ page: 'transition-guide.html', label: 'Transition Guide' }, { page: 'resources.html', label: 'Career Resources', filter: 'employment' }, { page: 'state-benefits.html', label: 'State Benefits' }, { page: 'licensure.html', label: 'Licensure' }, { page: 'grants-scholarships.html', label: 'Grants' }, { page: 'military-discounts.html', label: 'Military Discounts' }, { page: 'hidden-benefits.html', label: 'Hidden Benefits' }],
    discount:     [{ page: 'military-discounts.html', label: 'Military Discounts' }, { page: 'outdoor-recreation.html', label: 'Outdoor Discounts' }],
    outdoor_recreation: [{ page: 'outdoor-recreation.html', label: 'Outdoor Recreation & Discounts' }, { page: 'military-discounts.html', label: 'Military Discounts' }, { page: 'hidden-benefits.html', label: 'Hidden Recreation Benefits', filter: 'recreation' }, { page: 'wellness.html', label: 'Wellness & Fitness' }],
    contractor_career: [{ page: 'contractor-careers.html', label: 'Defense Contractor Careers' }, { page: 'resources.html', label: 'Employment Resources', filter: 'employment' }, { page: 'licensure.html', label: 'Certifications & Licensing' }, { page: 'transition-guide.html', label: 'Transition Guide' }, { page: 'education.html', label: 'Education & Training' }],
    service_dog:  [{ page: 'service-dogs.html', label: 'Service Dog Resources' }],
    wellness:     [{ page: 'wellness.html', label: 'Wellness & Fitness' }],
    advocacy:     [{ page: 'elected-officials.html', label: 'Elected Officials' }],
    medical_treatment: [{ page: 'medical-help.html', label: 'Medical & Treatment Resources' }, { page: 'wellness.html', label: 'Wellness Programs' }],
    financial_optimization: [{ page: 'financial-optimization.html', label: 'Financial Optimization' }, { page: 'hidden-benefits.html', label: 'Hidden Benefits' }, { page: 'military-discounts.html', label: 'Military Discounts' }, { page: 'state-benefits.html', label: 'State Benefits' }],
    state_benefits: [{ page: 'state-benefits.html', label: 'State Benefits' }],
    hidden_benefit: [{ page: 'hidden-benefits.html', label: 'Hidden Benefits' }, { page: 'state-benefits.html', label: 'State Benefits' }],
    emergency_aid: [{ page: 'emergency-assistance.html', label: 'Emergency Assistance' }, { page: 'hotlines-escalation.html', label: 'Crisis Hotlines' }],
    housing_crisis:[{ page: 'hotlines-escalation.html', label: 'Emergency Housing' }, { page: 'emergency-assistance.html', label: 'Emergency Assistance' }],
    mental_health_crisis: [{ page: 'hotlines-escalation.html', label: 'Crisis Hotlines' }]
  };

  // ── CHECKLIST TEMPLATES ───────────────────────────────
  // Auto-generate checklist items from detected issues
  var ISSUE_TO_CHECKLIST = {
    va_claim: [
      { category: 'immediate', title: 'Gather supporting documents', description: 'Collect DD-214, medical records, and any buddy statements' },
      { category: 'immediate', title: 'Write your personal statement', description: 'Use the VA Claim Personal Statement template' },
      { category: 'short_term', title: 'File your VA claim', description: 'Submit VA Form 21-526EZ with supporting evidence',
        resource_link: 'https://www.va.gov/disability/file-disability-claim-form-21-526ez/' },
      { category: 'short_term', title: 'Schedule C&P exam', description: 'Attend your Compensation & Pension exam when scheduled',
        resource_link: 'https://www.va.gov/disability/va-claim-exam/' }
    ],
    va_appeal: [
      { category: 'immediate', title: 'Review your denial letter', description: 'Identify the specific reason for denial' },
      { category: 'immediate', title: 'Choose your appeal pathway', description: 'Supplemental Claim, Higher-Level Review, or Board Appeal',
        resource_link: 'https://www.va.gov/decision-reviews/' },
      { category: 'short_term', title: 'Gather new evidence', description: 'Get nexus letter, new medical records, or buddy statements' },
      { category: 'short_term', title: 'Submit your appeal', description: 'File within 1 year of denial date',
        resource_link: 'https://www.va.gov/decision-reviews/' }
    ],
    career: [
      { category: 'immediate', title: 'Build your civilian resume', description: 'Translate military experience using the Resume Builder' },
      { category: 'immediate', title: 'Update your LinkedIn profile', description: 'Use the LinkedIn Profile Builder template',
        resource_link: 'https://www.linkedin.com/in/' },
      { category: 'short_term', title: 'Prepare for interviews', description: 'Practice STAR method responses',
        resource_link: 'https://www.dol.gov/agencies/vets/programs/tap' },
      { category: 'short_term', title: 'Search federal jobs', description: 'Veterans have hiring preference on USAJobs',
        resource_link: 'https://www.usajobs.gov/Help/working-in-government/unique-hiring-paths/veterans/' }
    ],
    debt: [
      { category: 'immediate', title: 'List all debts', description: 'Creditor, balance, minimum payment, interest rate' },
      { category: 'immediate', title: 'Send hardship letter', description: 'Use the Debt Hardship Letter template' },
      { category: 'short_term', title: 'Create a monthly budget', description: 'Use the Budget Recovery Plan template' },
      { category: 'strategic', title: 'Dispute inaccurate credit items', description: 'Use the Credit Dispute Letter template',
        resource_link: 'https://www.annualcreditreport.com/' }
    ],
    transition: [
      { category: 'immediate', title: 'Secure your DD-214', description: 'Ensure you have certified copies',
        resource_link: 'https://www.archives.gov/veterans/military-service-records' },
      { category: 'immediate', title: 'Enroll in VA healthcare', description: 'Apply online at VA.gov — takes about 30 minutes',
        resource_link: 'https://www.va.gov/health-care/apply-for-va-health-care/' },
      { category: 'short_term', title: 'Build your civilian resume', description: 'Use the Resume Builder template' },
      { category: 'short_term', title: 'File for VA disability', description: 'If you have service-connected conditions',
        resource_link: 'https://www.va.gov/disability/how-to-file-claim/' },
      { category: 'short_term', title: 'Check state benefits', description: 'Review state-specific veteran benefits for your state',
        resource_link: 'state-benefits.html' },
      { category: 'strategic', title: 'Build financial stability', description: 'Create a budget and build emergency fund' }
    ],
    will: [
      { category: 'immediate', title: 'Draft your will', description: 'Use the Last Will and Testament template' },
      { category: 'short_term', title: 'Find free legal assistance', description: 'Veterans Legal Services and nonprofit legal aid are available',
        resource_link: 'https://www.nvlsp.org/' },
      { category: 'short_term', title: 'Complete related documents', description: 'Power of Attorney, Living Will, HIPAA Authorization' }
    ],
    va_loan: [
      { category: 'immediate', title: 'Get your Certificate of Eligibility', description: 'Request directly from VA or through your lender',
        resource_link: 'https://www.va.gov/housing-assistance/home-loans/how-to-apply/' },
      { category: 'immediate', title: 'Check your credit score', description: 'Free — no credit impact',
        resource_link: 'https://www.annualcreditreport.com/' },
      { category: 'short_term', title: 'Get pre-approved', description: 'Contact 2-3 VA-approved lenders to compare rates',
        resource_link: 'https://www.benefits.va.gov/homeloans/lenders.asp' },
      { category: 'short_term', title: 'Complete VA Loan Readiness Checklist', description: 'Use the template to verify all requirements' }
    ],
    credit: [
      { category: 'immediate', title: 'Pull your free credit reports', description: 'Check all three bureaus — Equifax, Experian, TransUnion',
        resource_link: 'https://www.annualcreditreport.com/' },
      { category: 'immediate', title: 'Dispute inaccurate items', description: 'Use the Credit Dispute Letter template' },
      { category: 'short_term', title: 'Request fraud alert or freeze if needed', description: 'Free at each bureau — blocks unauthorized credit',
        resource_link: 'https://www.identitytheft.gov/' }
    ],
    va_healthcare: [
      { category: 'immediate', title: 'Enroll in VA healthcare', description: 'Apply online — most veterans are eligible',
        resource_link: 'https://www.va.gov/health-care/apply-for-va-health-care/' },
      { category: 'short_term', title: 'Schedule your first appointment', description: 'Contact your nearest VA medical center',
        resource_link: 'https://www.va.gov/find-locations/' },
      { category: 'short_term', title: 'Check eligibility for mental health services', description: 'Mental health care is available to all enrolled veterans',
        resource_link: 'https://www.va.gov/health-care/health-needs-conditions/mental-health/' }
    ],
    education: [
      { category: 'immediate', title: 'Check your GI Bill eligibility', description: 'Determine which chapter you qualify for',
        resource_link: 'https://www.va.gov/education/eligibility/' },
      { category: 'immediate', title: 'Apply for education benefits', description: 'Submit VA Form 22-1990 online',
        resource_link: 'https://www.va.gov/education/apply-for-education-benefits/application/1990/' },
      { category: 'short_term', title: 'Compare school GI Bill approval status', description: 'Verify school is VA-approved before enrolling',
        resource_link: 'https://www.va.gov/education/gi-bill-comparison-tool/' }
    ]
  };

  // ── EXECUTION PAGE PARAM ROUTING (Phase 6) ───────────
  // Maps {issue}:{page} pairs to URL param strings appended when routing
  // to execution-enabled pages (hidden-benefits, financial-optimization,
  // emergency-assistance, outdoor-recreation, contractor-careers).
  // Format: 'auto=1&param1=value1&param2=value2' (no leading ?)
  // Consumed by getResourceRecommendations() to build parameterized URLs.
  var ISSUE_TO_EXEC_PARAMS = {
    // Hidden Benefits
    'hidden_benefit:hidden-benefits.html':       'auto=1&goal=see_everything',
    'mental_health:hidden-benefits.html':        'auto=1&goal=medical',
    'va_healthcare:hidden-benefits.html':        'auto=1&goal=medical',
    'education:hidden-benefits.html':            'auto=1&goal=education',
    'voc_rehab:hidden-benefits.html':            'auto=1&goal=employment',
    'career:hidden-benefits.html':               'auto=1&goal=employment',
    'budget:hidden-benefits.html':               'auto=1&goal=money_saving',
    'discount:hidden-benefits.html':             'auto=1&goal=money_saving',
    'outdoor_recreation:hidden-benefits.html':   'auto=1&goal=recreation',
    'dependent:hidden-benefits.html':            'auto=1&goal=family',
    'rental:hidden-benefits.html':               'auto=1&goal=housing',
    'va_loan:hidden-benefits.html':              'auto=1&goal=housing',
    'state_benefits:hidden-benefits.html':       'auto=1&goal=state_specific',
    'transition:hidden-benefits.html':           'auto=1&goal=see_everything',
    'financial_optimization:hidden-benefits.html': 'auto=1&goal=money_saving',

    // Financial Optimization
    'financial_optimization:financial-optimization.html': 'auto=1&goal=see_everything',
    'debt:financial-optimization.html':          'auto=1&goal=reduce_debt&situation=employed',
    'budget:financial-optimization.html':        'auto=1&goal=lower_bills',
    'va_loan:financial-optimization.html':       'auto=1&goal=housing',
    'education:financial-optimization.html':     'auto=1&goal=education',
    'business:financial-optimization.html':      'auto=1&goal=business',
    'transition:financial-optimization.html':    'auto=1&goal=lower_bills&situation=transitioning',
    'property_tax:financial-optimization.html':  'auto=1&goal=taxes',

    // Emergency Assistance
    'debt:emergency-assistance.html':                   'auto=1&need=financial&urgency=soon',
    'emergency_aid:emergency-assistance.html':          'auto=1&need=financial&urgency=immediate',
    'housing_crisis:emergency-assistance.html':         'auto=1&need=housing&urgency=immediate',
    'mental_health_crisis:emergency-assistance.html':   'auto=1&need=mental_health&urgency=immediate',
    'emergency:emergency-assistance.html':              'auto=1&need=all&urgency=immediate',

    // Outdoor Recreation
    'outdoor_recreation:outdoor-recreation.html': 'auto=1&goal=parks_access',
    'discount:outdoor-recreation.html':           'auto=1&goal=save_money',
    'wellness:outdoor-recreation.html':           'auto=1&goal=outdoor_activities',

    // Contractor Careers
    'contractor_career:contractor-careers.html':  'auto=1&goal=get_hired',
    'transition:contractor-careers.html':         'auto=1&goal=skillbridge',
    'career:contractor-careers.html':             'auto=1&goal=get_hired',
    'licensing:contractor-careers.html':          'auto=1&goal=certifications'
  };

  // ── CORE ENGINE ───────────────────────────────────────

  /**
   * Detect issues from free text (conversation, report, or user input).
   *
   * PRIORITY LOGIC (v2):
   *   1. ALL patterns are tested and scored (no longer first-match-only).
   *   2. Results are sorted by priority tier (lower number = higher priority).
   *   3. Within a tier, results maintain pattern order.
   *   4. The PRIMARY issue (result[0]) drives the main routing; secondary
   *      issues still populate template/resource recommendations.
   *
   * @param {string} text - Text to analyze
   * @returns {Array} - Array of {issue, category, priority} objects,
   *                     sorted by priority tier (ascending)
   */
  // Negation words for negation-aware patterns
  var NEGATION_RE = /\b(not|no|don['\u2019]?t|isn['\u2019]?t|aren['\u2019]?t|never|wasn['\u2019]?t|weren['\u2019]?t|am\s*not)\b/i;

  /**
   * Check if a pattern match is negated by a preceding negation word.
   * Looks for negation words within 5 words before the match position.
   * @param {string} text - Full input text
   * @param {RegExp} pattern - The regex pattern that matched
   * @returns {boolean} - true if the match is negated (should be skipped)
   */
  function isNegated(text, pattern) {
    var match = pattern.exec(text);
    if (!match) return false;

    var matchStart = match.index;
    // Get up to 50 chars before the match (covers ~5 words)
    var prefix = text.substring(Math.max(0, matchStart - 50), matchStart);
    // Split into words, take last 5
    var words = prefix.trim().split(/\s+/).slice(-5);
    var prefixStr = words.join(' ');

    return NEGATION_RE.test(prefixStr);
  }

  function detectIssues(text) {
    if (!text) return [];
    var found = [];
    var seen = {};

    ISSUE_PATTERNS.forEach(function(p) {
      if (!p.pattern.test(text) || seen[p.issue]) return;

      // Negation-aware patterns: skip if preceded by negation words
      if (p.negationAware) {
        // Reset lastIndex for regex reuse
        p.pattern.lastIndex = 0;
        if (isNegated(text, new RegExp(p.pattern.source, p.pattern.flags))) {
          return; // Negated — skip this match
        }
      }

      seen[p.issue] = true;
      found.push({
        issue: p.issue,
        category: p.category,
        priority: p.priority || 4
      });
    });

    // Sort by priority tier — crisis (1) surfaces first, then emergency (2),
    // discovery (3), then standard (4). Preserves pattern order within tiers.
    found.sort(function(a, b) { return a.priority - b.priority; });

    // Same-tier promotion: when transition-context language is present,
    // promote 'transition' above 'career' within T4. This ensures queries
    // like "post-military career options" route to transition as primary.
    if (found.length > 1) {
      var TRANSITION_CONTEXT = /post[\s-]military|after\s*(the\s*)?military|civilian\s*life|getting\s*out|got\s*out|leaving\s*(the\s*)?military|left\s*(the\s*)?military/i;
      if (TRANSITION_CONTEXT.test(text)) {
        var transIdx = -1;
        var careerIdx = -1;
        for (var ti = 0; ti < found.length; ti++) {
          if (found[ti].issue === 'transition') transIdx = ti;
          if (found[ti].issue === 'career') careerIdx = ti;
        }
        // Only promote if both exist AND same tier AND transition is currently after career
        if (transIdx > careerIdx && careerIdx >= 0 &&
            found[transIdx].priority === found[careerIdx].priority) {
          var transItem = found.splice(transIdx, 1)[0];
          found.splice(careerIdx, 0, transItem);
        }
      }
    }

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

        // Build URL with proper query params for filtered pages
        var url = r.page;
        var params = [];

        // state-benefits.html: ?state=XX&category=YY
        if (r.page === 'state-benefits.html') {
          if (userState) params.push('state=' + encodeURIComponent(userState));
          if (r.filter) params.push('category=' + encodeURIComponent(r.filter));
        }
        // resources.html: ?category=YY
        if (r.page === 'resources.html' && r.filter) {
          params.push('category=' + encodeURIComponent(r.filter));
        }

        if (params.length > 0) url += '?' + params.join('&');

        // Phase 6: Execution page param routing — append auto=1 + pre-fill params
        // Only applies when no other params have already been set for this URL.
        if (params.length === 0) {
          var execKey = iss.issue + ':' + r.page;
          if (ISSUE_TO_EXEC_PARAMS[execKey]) {
            url = r.page + '?' + ISSUE_TO_EXEC_PARAMS[execKey];
          }
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
  // Priority map — keeps action-engine in sync with DB convention
  var CATEGORY_PRIORITY = { immediate: 1, short_term: 2, strategic: 3, optional: 4 };

  // Max IMMEDIATE tasks allowed per report — any excess downgrades to short_term.
  // Prevents overwhelming the user with an undifferentiated urgent list.
  var MAX_IMMEDIATE = 3;

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
          category:     item.category,
          title:        item.title,
          description:  item.description,
          sort_order:   sortOrder++,
          is_completed: false,
          source_issue: iss.issue,
          // AIOS fields
          priority:      item.priority || CATEGORY_PRIORITY[item.category] || 2,
          source:        'ai_report',
          resource_link: item.resource_link || null,
          due_context:   item.due_context   || null
        });
      });
    });

    // ── PRIORITY CAP ─────────────────────────────────────
    // Enforce MAX_IMMEDIATE.  Items beyond the cap downgrade to short_term
    // so the user always has a clear, focused set of urgent actions.
    var immediateIndexes = [];
    items.forEach(function(item, idx) {
      if (item.category === 'immediate') immediateIndexes.push(idx);
    });
    if (immediateIndexes.length > MAX_IMMEDIATE) {
      immediateIndexes.slice(MAX_IMMEDIATE).forEach(function(idx) {
        items[idx].category = 'short_term';
        items[idx].priority = CATEGORY_PRIORITY['short_term'];
      });
    }

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
      // Phase 55: Map engine template IDs to their closest flow template equivalent
      var ENGINE_TO_FLOW = {
        'resume':            'resume-builder',
        'va_claim':          'va-claim-personal-statement',
        'transition_plan':   'benefits-eligibility-summary',
        'business_launch':   'budget-financial-recovery-plan',
        'financial_plan':    'budget-financial-recovery-plan',
        'daily_mission':     'personal-emergency-action-plan',
        'will':              'last-will-and-testament',
        'poa':               'general-power-of-attorney',
        'medical_poa':       'medical-power-of-attorney',
        'living_will':       'living-will',
        'hipaa_auth':        'hipaa-authorization-form',
        'emergency_contacts':'emergency-contact-family-care-plan',
        'dependent_care':    'emergency-contact-family-care-plan',
        'burial_preferences':'benefits-eligibility-summary',
        'emergency_action':  'personal-emergency-action-plan'
      };
      allTemplates.slice(0, maxT).forEach(function(id) {
        if (id.startsWith('_engine:')) {
          var engineId = id.replace('_engine:', '');
          var flowId = ENGINE_TO_FLOW[engineId] || engineId;
          html += '<a href="template-flow.html?id=' + flowId + '" class="action-panel__link action-panel__link--engine">' +
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

    // Phase 55: Recurring issue "Focus Areas" badges removed —
    // now rendered once in the static HTML block (#dashGoals / #dashIssueTags)
    // inside the unified "Next Recommended Actions" card.

    return baseHtml;
  }

  // ── STATE BENEFITS MATCHING ──────────────────────────
  // Maps action-engine issue categories → state benefit categories
  var ISSUE_CAT_TO_BENEFIT_CAT = {
    'va_benefits':  ['property_tax', 'disabled_veteran', 'income_tax'],
    'healthcare':   ['healthcare'],
    'education':    ['education'],
    'career':       ['employment', 'licensing'],
    'business':     ['employment', 'education'],
    'financial':    ['property_tax', 'income_tax', 'vehicle'],
    'housing':      ['housing', 'property_tax'],
    'property_tax': ['property_tax'],
    'licensing':    ['licensing'],
    'burial':       ['burial'],
    'dependent':    ['dependent', 'education'],
    'transition':   ['education', 'employment', 'property_tax', 'income_tax', 'vehicle'],
    'legal':        [],
    'crisis':       []
  };

  // ── TEMPLATE → BENEFIT CATEGORY MAPPING ─────────────
  // Maps template IDs to relevant state benefit categories for post-completion suggestions
  var TEMPLATE_TO_BENEFIT_CATS = {
    // VA / Claims
    'va-claim-personal-statement':    ['disabled_veteran', 'property_tax', 'income_tax', 'housing'],
    'va-appeal-letter':               ['disabled_veteran', 'property_tax', 'income_tax', 'housing'],
    'nexus-letter-prep':              ['disabled_veteran', 'property_tax', 'healthcare'],
    'benefits-eligibility-summary':   ['property_tax', 'education', 'employment', 'income_tax', 'vehicle', 'recreation'],
    // Career
    'resume-builder':                 ['employment', 'education', 'licensing'],
    'linkedin-profile-builder':       ['employment', 'education'],
    'federal-resume':                 ['employment', 'education'],
    'interview-prep-script':          ['employment', 'education'],
    'salary-negotiation-script':      ['employment', 'income_tax'],
    'military-civilian-skills-translator': ['employment', 'licensing', 'education'],
    // Financial
    'debt-hardship-letter':           ['property_tax', 'income_tax', 'housing', 'vehicle'],
    'credit-dispute-letter':          ['property_tax', 'income_tax', 'housing'],
    'budget-financial-recovery-plan': ['property_tax', 'income_tax', 'vehicle', 'housing'],
    // Housing
    'va-loan-readiness-checklist':    ['housing', 'property_tax', 'vehicle'],
    'rental-application-packet':      ['housing', 'property_tax'],
    // Legal / Life
    'general-power-of-attorney':      ['property_tax', 'vehicle', 'income_tax'],
    'durable-power-of-attorney':      ['property_tax', 'vehicle', 'income_tax'],
    'medical-power-of-attorney':      ['healthcare', 'disabled_veteran'],
    'last-will-and-testament':        ['property_tax', 'burial'],
    'living-will':                    ['healthcare', 'burial'],
    'hipaa-authorization-form':       ['healthcare'],
    'emergency-contact-family-care-plan': ['dependent', 'education'],
    'personal-emergency-action-plan':     ['housing', 'healthcare'],
    // Records
    'records-request-letter':         ['education', 'employment', 'property_tax']
  };

  /**
   * Get relevant state benefit categories for a template type
   * Falls back to broad categories if template ID is not mapped
   * @param {string} templateId - Template identifier
   * @returns {Array} - Array of benefit category strings
   */
  function getBenefitCatsForTemplate(templateId) {
    if (TEMPLATE_TO_BENEFIT_CATS[templateId]) {
      return TEMPLATE_TO_BENEFIT_CATS[templateId];
    }
    return ['property_tax', 'education', 'employment', 'income_tax'];
  }

  /**
   * Get state benefits relevant to a completed template
   * @param {Object} context
   *   - state {string} - Full state name OR two-letter abbreviation
   *   - templateId {string} - The template that was just completed
   *   - issue_tags {Array} - Optional detected issues
   *   - disability_rating_band {string} - Optional
   *   - service_status {string} - Optional
   * @returns {Promise<Array>} - Top 3-5 scored benefits
   */
  function getStateBenefitsForTemplate(context) {
    if (!context || !context.state) {
      return Promise.resolve([]);
    }

    // Convert full state name to abbreviation if needed
    var stateAbbr = context.state.length === 2 ? context.state.toUpperCase() : null;
    if (!stateAbbr) {
      var stList = (typeof ResourceHub !== 'undefined' && ResourceHub.STATES) ? ResourceHub.STATES : [];
      for (var si = 0; si < stList.length; si++) {
        if (stList[si].name.toLowerCase() === context.state.toLowerCase()) {
          stateAbbr = stList[si].abbr;
          break;
        }
      }
    }
    if (!stateAbbr) return Promise.resolve([]);

    var templateCats = getBenefitCatsForTemplate(context.templateId);
    var disabilityBand = context.disability_rating_band || null;
    var serviceStatus = context.service_status || 'veteran';

    return loadStateBenefits().then(function(allBenefits) {
      var stateBenefits = allBenefits.filter(function(b) {
        return b.state === stateAbbr;
      });
      if (stateBenefits.length === 0) return [];

      var scored = stateBenefits.map(function(b) {
        var score = 1;
        if (templateCats.indexOf(b.category) !== -1) score += 3;
        if (context.issue_tags && context.issue_tags.length > 0) {
          var issueCats = {};
          context.issue_tags.forEach(function(tag) {
            var cats = ISSUE_CAT_TO_BENEFIT_CAT[tag.category];
            if (cats) cats.forEach(function(c) { issueCats[c] = true; });
          });
          if (issueCats[b.category]) score += 2;
        }
        if (disabilityBand && disabilityBand !== '0') {
          if (b.disability_threshold) score += 2;
          if (b.category === 'disabled_veteran') score += 2;
        }
        if (serviceStatus === 'guard_reserve' && b.guard_reserve_eligible === true) score += 1;
        if ((serviceStatus === 'spouse' || serviceStatus === 'survivor') && b.spouse_survivor_eligible === true) score += 1;
        if (b.applies_to && Array.isArray(b.applies_to) && b.applies_to.indexOf('all_veterans') !== -1) score += 1;
        return {
          benefit_name: b.benefit_name, summary: b.summary, category: b.category,
          official_link: b.official_link, state: b.state, score: score
        };
      });

      scored.sort(function(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return a.benefit_name.localeCompare(b.benefit_name);
      });
      return scored.slice(0, 5);
    });
  }

  // Cache for loaded state benefits data
  var _stateBenefitsCache = null;
  var _stateBenefitsLoading = null;

  /**
   * Load all state benefits JSON files (cached after first load)
   * @returns {Promise<Array>} - All state benefit records
   */
  function loadStateBenefits() {
    if (_stateBenefitsCache) {
      return Promise.resolve(_stateBenefitsCache);
    }
    if (_stateBenefitsLoading) {
      return _stateBenefitsLoading;
    }
    _stateBenefitsLoading = Promise.all([
      fetch('data/state-benefits.json').then(function(r) { return r.json(); }),
      fetch('data/state-benefits-batch1.json').then(function(r) { return r.json(); }),
      fetch('data/state-benefits-batch2.json').then(function(r) { return r.json(); }),
      fetch('data/state-benefits-batch3.json').then(function(r) { return r.json(); })
    ]).then(function(results) {
      _stateBenefitsCache = [].concat(results[0], results[1], results[2], results[3]);
      _stateBenefitsLoading = null;
      return _stateBenefitsCache;
    }).catch(function(err) {
      _stateBenefitsLoading = null;
      console.error('StateBenefits: load error', err);
      return [];
    });
    return _stateBenefitsLoading;
  }

  /**
   * Get top relevant state benefits for a user context
   * @param {Object} userContext
   *   - state {string} - Two-letter state abbreviation (required)
   *   - issue_tags {Array} - From action engine detectIssues() [{issue, category}]
   *   - disability_rating_band {string} - e.g. '0', '10-40', '50-90', '100' (optional)
   *   - service_status {string} - e.g. 'veteran', 'active', 'guard_reserve', 'spouse' (optional)
   * @returns {Promise<Array>} - Top 5 scored benefits [{benefit_name, summary, category, official_link, score}]
   */
  function getStateBenefitsForUser(userContext) {
    if (!userContext || !userContext.state) {
      return Promise.resolve([]);
    }

    var state = userContext.state.toUpperCase();
    var issueTags = userContext.issue_tags || [];
    var disabilityBand = userContext.disability_rating_band || null;
    var serviceStatus = userContext.service_status || 'veteran';

    // Collect relevant benefit categories from issue tags
    var relevantCats = {};
    issueTags.forEach(function(tag) {
      var cats = ISSUE_CAT_TO_BENEFIT_CAT[tag.category];
      if (cats) {
        cats.forEach(function(c) { relevantCats[c] = true; });
      }
    });
    var relevantCatKeys = Object.keys(relevantCats);

    return loadStateBenefits().then(function(allBenefits) {
      // Filter to user's state only
      var stateBenefits = allBenefits.filter(function(b) {
        return b.state === state;
      });

      if (stateBenefits.length === 0) return [];

      // Score each benefit for relevance
      var scored = stateBenefits.map(function(b) {
        var score = 1; // Base score for being in the user's state

        // Category match with detected issues (+3 each)
        if (relevantCatKeys.indexOf(b.category) !== -1) {
          score += 3;
        }

        // Disability match (+2 if user has disability and benefit is disability-related)
        if (disabilityBand && disabilityBand !== '0') {
          if (b.disability_threshold) score += 2;
          if (b.category === 'disabled_veteran') score += 2;
        }

        // Service status match (+1)
        if (serviceStatus === 'guard_reserve' && b.guard_reserve_eligible === true) {
          score += 1;
        }
        if ((serviceStatus === 'spouse' || serviceStatus === 'survivor') && b.spouse_survivor_eligible === true) {
          score += 1;
        }

        // Applies-to match (+1 for broad applicability)
        if (b.applies_to && Array.isArray(b.applies_to)) {
          if (b.applies_to.indexOf('all_veterans') !== -1) {
            score += 1;
          }
        }

        return {
          benefit_name: b.benefit_name,
          summary: b.summary,
          category: b.category,
          official_link: b.official_link,
          state: b.state,
          score: score
        };
      });

      // Sort by score descending, then alphabetical
      scored.sort(function(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return a.benefit_name.localeCompare(b.benefit_name);
      });

      // Return top 5
      return scored.slice(0, 5);
    });
  }

  /**
   * Render a "Recommended State Benefits" HTML section
   * @param {Array} benefits - From getStateBenefitsForUser()
   * @param {string} stateName - Full state name for display
   * @returns {string} - HTML string
   */
  function renderStateBenefitsPanel(benefits, stateName) {
    if (!benefits || benefits.length === 0) return '';

    var CAT_LABELS = {
      property_tax: 'Property Tax', education: 'Education', recreation: 'Recreation',
      employment: 'Employment', healthcare: 'Healthcare', housing: 'Housing',
      vehicle: 'Vehicle', burial: 'Burial', licensing: 'Licensing',
      business: 'Business', long_term_care: 'Long-Term Care',
      disabled_veteran: 'Disabled Veteran', dependent: 'Dependent',
      income_tax: 'Income Tax', 'employment-pref': 'Employment'
    };

    var html = '<div class="action-panel">';
    html += '<div class="action-panel__section">';
    html += '<h4 class="action-panel__heading">Recommended State Benefits' +
            (stateName ? ' — ' + stateName : '') + '</h4>';
    html += '<div class="state-benefits-recs">';

    benefits.forEach(function(b) {
      var catLabel = CAT_LABELS[b.category] || b.category.replace(/[_-]/g, ' ');
      html += '<div class="state-benefit-rec">';
      html += '<div class="state-benefit-rec__header">';
      html += '<strong class="state-benefit-rec__name">' + (b.benefit_name || '') + '</strong>';
      html += '<span class="state-benefit-rec__cat">' + catLabel + '</span>';
      html += '</div>';
      html += '<p class="state-benefit-rec__summary">' + (b.summary || '') + '</p>';
      if (b.official_link) {
        html += '<a href="' + b.official_link + '" class="action-panel__link action-panel__link--resource" target="_blank" rel="noopener noreferrer">Official Info</a>';
      }
      html += '</div>';
    });

    html += '</div></div>';
    html += '<div style="margin-top:8px;text-align:right;">';
    html += '<a href="state-benefits.html" class="action-panel__link action-panel__link--resource" style="font-size:0.85rem;">View all state benefits &rarr;</a>';
    html += '</div>';
    html += '</div>';
    return html;
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
    getStateBenefitsForUser: getStateBenefitsForUser,
    getStateBenefitsForTemplate: getStateBenefitsForTemplate,
    getBenefitCatsForTemplate: getBenefitCatsForTemplate,
    renderStateBenefitsPanel: renderStateBenefitsPanel,
    loadStateBenefits: loadStateBenefits,
    ISSUE_PATTERNS: ISSUE_PATTERNS,
    ISSUE_TO_TEMPLATES: ISSUE_TO_TEMPLATES,
    ISSUE_TO_RESOURCES: ISSUE_TO_RESOURCES,
    ISSUE_TO_CHECKLIST: ISSUE_TO_CHECKLIST,
    ISSUE_CAT_TO_BENEFIT_CAT: ISSUE_CAT_TO_BENEFIT_CAT,
    TEMPLATE_TO_BENEFIT_CATS: TEMPLATE_TO_BENEFIT_CATS,
    ISSUE_TO_EXEC_PARAMS: ISSUE_TO_EXEC_PARAMS
  };

})();
