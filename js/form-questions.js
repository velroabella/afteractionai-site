/* ============================================================
   PHASE 4.1 — Form Question Schemas
   Defines guided question flows for each form type.
   Used by the orchestration layer in app.js to collect
   structured user input before document generation.
   ============================================================ */

(function () {
  'use strict';

  var FORM_QUESTIONS = {

    /* ── LEGAL FORMS ── */

    'general-power-of-attorney': [
      { key: 'fullName', question: 'What is your full legal name (the person granting power)?' },
      { key: 'agentName', question: 'Who are you appointing as your agent (full name)?' },
      { key: 'state', question: 'What state do you live in?' },
      { key: 'county', question: 'What county do you live in?' },
      { key: 'powers', question: 'What powers are you granting? (e.g., financial, property, legal matters, or "all")' }
    ],

    'durable-power-of-attorney': [
      { key: 'fullName', question: 'What is your full legal name?' },
      { key: 'agentName', question: 'Who are you appointing as your durable agent (full name)?' },
      { key: 'state', question: 'What state do you live in?' },
      { key: 'county', question: 'What county do you live in?' },
      { key: 'powers', question: 'What powers should this agent have? (e.g., financial, healthcare, property, or "all")' },
      { key: 'effectiveCondition', question: 'Should this take effect immediately or only if you become incapacitated?' }
    ],

    'medical-power-of-attorney': [
      { key: 'fullName', question: 'What is your full legal name?' },
      { key: 'agentName', question: 'Who are you appointing as your healthcare agent (full name)?' },
      { key: 'state', question: 'What state do you live in?' },
      { key: 'alternateAgent', question: 'Do you have an alternate agent if the first is unavailable? If yes, their full name.' },
      { key: 'specificWishes', question: 'Any specific medical wishes? (e.g., organ donation preferences, life support preferences, or "none")' }
    ],

    'living-will': [
      { key: 'fullName', question: 'What is your full legal name?' },
      { key: 'state', question: 'What state do you live in?' },
      { key: 'lifeSupport', question: 'What is your preference regarding life-sustaining treatment? (e.g., "no life support if terminally ill", "all available treatment", or specific wishes)' },
      { key: 'painManagement', question: 'What are your preferences for pain management and comfort care?' },
      { key: 'organDonation', question: 'What is your organ donation preference? (yes, no, or specific organs only)' }
    ],

    'last-will-and-testament': [
      { key: 'fullName', question: 'What is your full legal name?' },
      { key: 'state', question: 'What state do you live in?' },
      { key: 'county', question: 'What county do you live in?' },
      { key: 'executorName', question: 'Who do you want as executor of your will (full name)?' },
      { key: 'beneficiaries', question: 'Who are your beneficiaries and what should they receive? (List names and what they inherit)' },
      { key: 'dependents', question: 'Do you have minor children? If yes, who should be their guardian?' }
    ],

    'hipaa-authorization-form': [
      { key: 'fullName', question: 'What is your full legal name?' },
      { key: 'dob', question: 'What is your date of birth?' },
      { key: 'authorizedPerson', question: 'Who are you authorizing to receive your health information (full name)?' },
      { key: 'provider', question: 'What healthcare provider or facility holds your records?' },
      { key: 'infoType', question: 'What type of health information should be released? (e.g., "all medical records", "mental health only", specific conditions)' }
    ],

    /* ── VA / BENEFITS FORMS ── */

    'nexus-letter': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'branch', question: 'What branch did you serve in?' },
      { key: 'condition', question: 'What is the condition you are claiming?' },
      { key: 'serviceConnection', question: 'How is this condition connected to your military service? (event, exposure, injury, etc.)' },
      { key: 'currentTreatment', question: 'What treatment are you currently receiving for this condition?' },
      { key: 'doctorName', question: 'Who is the doctor you plan to ask for the nexus letter? (or "not sure yet")' }
    ],

    'va-appeal-letter': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'claimNumber', question: 'What is your VA claim or file number?' },
      { key: 'deniedCondition', question: 'What condition or benefit was denied?' },
      { key: 'denialDate', question: 'When was the denial decision issued? (approximate date)' },
      { key: 'disagreementReason', question: 'Why do you disagree with the decision? (briefly explain)' },
      { key: 'newEvidence', question: 'Do you have new evidence to submit? If yes, briefly describe it.' }
    ],

    'records-request-letter': [
      { key: 'fullName', question: 'What is your full legal name (as it appears on military records)?' },
      { key: 'branch', question: 'What branch did you serve in?' },
      { key: 'serviceNumber', question: 'What is your service number or last 4 of SSN?' },
      { key: 'recordType', question: 'What records are you requesting? (e.g., DD-214, medical records, service records, personnel file)' },
      { key: 'purpose', question: 'What is the purpose of this request? (e.g., VA claim, employment, personal records)' }
    ],

    'benefits-eligibility-summary': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'branch', question: 'What branch did you serve in?' },
      { key: 'yearsOfService', question: 'How many years did you serve?' },
      { key: 'dischargeType', question: 'What was your discharge type? (honorable, general, other than honorable, etc.)' },
      { key: 'vaRating', question: 'Do you have a VA disability rating? If yes, what percentage?' },
      { key: 'state', question: 'What state do you live in?' }
    ],

    'va-claim-personal-statement': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'claimNumber', question: 'What is your VA file number or claim number? (or "don\'t know")' },
      { key: 'condition', question: 'What condition are you claiming?' },
      { key: 'inServiceEvent', question: 'Describe the in-service event, injury, or exposure that caused or worsened this condition.' },
      { key: 'currentImpact', question: 'How does this condition affect your daily life today?' },
      { key: 'treatmentHistory', question: 'What treatment have you received (military and civilian)?' }
    ],

    /* ── FINANCIAL FORMS ── */

    'debt-hardship-letter': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'creditorName', question: 'Who is the creditor you are writing to?' },
      { key: 'accountNumber', question: 'What is the account number? (or "unknown")' },
      { key: 'amountOwed', question: 'Approximately how much do you owe?' },
      { key: 'hardshipReason', question: 'What caused your financial hardship? (job loss, medical emergency, military transition, etc.)' },
      { key: 'reliefRequested', question: 'What relief are you requesting? (lower payments, settlement, payment pause, etc.)' },
      { key: 'veteranStatus', question: 'Are you a veteran or active service member? (Yes / No)' }
    ],

    'credit-dispute-letter': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'address', question: 'What is your current mailing address?' },
      { key: 'creditBureau', question: 'Which credit bureau are you disputing with? (Equifax, Experian, TransUnion, or all three)' },
      { key: 'disputedItem', question: 'What item on your credit report is incorrect? (account name, type of error)' },
      { key: 'reason', question: 'Why is this item incorrect? (not yours, wrong balance, already paid, etc.)' },
      { key: 'veteranStatus', question: 'Are you a veteran or active service member? (Yes / No)' }
    ],

    'budget-financial-recovery-plan': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'monthlyIncome', question: 'What is your total monthly income? (all sources)' },
      { key: 'incomeBreakdown', question: 'What are your income sources? (e.g., salary, VA disability, retirement, GI Bill)' },
      { key: 'monthlyExpenses', question: 'What are your estimated monthly expenses?' },
      { key: 'totalDebt', question: 'What is your approximate total debt?' },
      { key: 'financialGoal', question: 'What is your top financial goal? (pay off debt, build savings, buy a home, etc.)' }
    ],

    'va-loan-readiness-checklist': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'branch', question: 'What branch did you serve in?' },
      { key: 'coeStatus', question: 'Do you have your Certificate of Eligibility (COE)? (Yes / No / Not sure)' },
      { key: 'creditScore', question: 'Do you know your approximate credit score? (number or "not sure")' },
      { key: 'monthlyIncome', question: 'What is your total monthly income?' },
      { key: 'monthlyDebts', question: 'What are your total monthly debt payments? (car loans, credit cards, student loans, etc.)' },
      { key: 'targetPrice', question: 'What home price range are you considering?' }
    ],

    'rental-application-packet': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'phone', question: 'What is your phone number?' },
      { key: 'email', question: 'What is your email address?' },
      { key: 'currentAddress', question: 'What is your current address?' },
      { key: 'propertyAddress', question: 'What is the address of the property you are applying for? (or "not decided yet")' },
      { key: 'monthlyIncome', question: 'What is your total monthly income?' },
      { key: 'reasonForMoving', question: 'What is your reason for moving? (PCS, new job, downsizing, etc.)' },
      { key: 'veteranStatus', question: 'Are you a veteran, active duty, Guard/Reserve, or military spouse?' }
    ],

    /* ── CAREER FORMS ── */

    'military-skills-translator': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'branch', question: 'What branch did you serve in?' },
      { key: 'mos', question: 'What was your military job code? (MOS, AFSC, Rating, or NEC)' },
      { key: 'mosTitle', question: 'What was your official military job title?' },
      { key: 'rank', question: 'What was your highest rank?' },
      { key: 'yearsOfService', question: 'How many years did you serve?' },
      { key: 'targetIndustry', question: 'What civilian industry are you targeting?' }
    ],

    'salary-negotiation-script': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'targetRole', question: 'What role or position are you negotiating for?' },
      { key: 'companyName', question: 'What company is this with?' },
      { key: 'offeredSalary', question: 'What salary did they offer (or what do you expect)?' },
      { key: 'desiredSalary', question: 'What salary do you want?' },
      { key: 'yearsExperience', question: 'How many total years of relevant experience do you have? (military + civilian)' },
      { key: 'keyStrength', question: 'What is your strongest qualification for this role?' }
    ],

    'federal-resume-usajobs': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'branch', question: 'What branch did you serve in?' },
      { key: 'mos', question: 'What was your MOS/AFSC/Rating?' },
      { key: 'rank', question: 'What was your rank?' },
      { key: 'serviceDates', question: 'What were your dates of service? (start to end)' },
      { key: 'targetPosition', question: 'What federal position are you applying for? (title, grade, or announcement number if known)' },
      { key: 'education', question: 'What is your highest level of education? (degree, school)' },
      { key: 'clearance', question: 'Do you hold a security clearance? (level, or "none")' }
    ],

    'resume-builder': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'branch', question: 'What branch did you serve in?' },
      { key: 'mos', question: 'What was your MOS/AFSC/Rating?' },
      { key: 'yearsOfService', question: 'How many years did you serve?' },
      { key: 'targetRole', question: 'What type of civilian role are you targeting?' },
      { key: 'topSkills', question: 'What are your top 3-5 skills? (in civilian language if possible)' },
      { key: 'education', question: 'What is your highest level of education?' }
    ],

    'linkedin-profile-builder': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'branch', question: 'What branch did you serve in?' },
      { key: 'mos', question: 'What was your MOS/AFSC/Rating?' },
      { key: 'targetIndustry', question: 'What civilian industry are you targeting?' },
      { key: 'personalBrand', question: 'In a few words, how would you describe your professional brand? (e.g., "leadership and logistics", or "not sure")' },
      { key: 'highlights', question: 'What are 2-3 career highlights you want to feature?' }
    ],

    'interview-prep-star': [
      { key: 'fullName', question: 'What is your full name?' },
      { key: 'targetRole', question: 'What role are you interviewing for?' },
      { key: 'companyName', question: 'What company is the interview with? (or "not sure yet")' },
      { key: 'branch', question: 'What branch did you serve in?' },
      { key: 'mos', question: 'What was your MOS/AFSC/Rating?' },
      { key: 'leadershipExample', question: 'Briefly describe a time you led a team through a tough situation. (This will become your STAR response.)' }
    ]
  };

  /* ---------- EXPOSE ON AAAI NAMESPACE ---------- */

  window.AAAI = window.AAAI || {};
  window.AAAI.formQuestions = {
    get: function (formType) {
      if (!formType) return null;
      var normalized = formType.toLowerCase().replace(/[\s_]+/g, '-');
      return FORM_QUESTIONS[normalized] || null;
    },
    has: function (formType) {
      if (!formType) return false;
      var normalized = formType.toLowerCase().replace(/[\s_]+/g, '-');
      return !!FORM_QUESTIONS[normalized];
    },
    SCHEMAS: FORM_QUESTIONS
  };

})();
