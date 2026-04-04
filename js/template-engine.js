/* ══════════════════════════════════════════════════════════
   AfterAction AI — Template Engine Core + Resume Engine
   CORE_03 + 05: Connects Checklist → Templates → Outputs
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ── TEMPLATE REGISTRY ─────────────────────────────────
  const TEMPLATES = {
    resume: {
      id: 'resume',
      title: 'Resume Translator',
      description: 'Create a high-performing civilian resume from your military experience',
      icon: '📄',
      systemPrompt: `You are the AfterAction AI Resume Engine — an elite military-to-civilian resume builder.

OBJECTIVE: Create a high-performing, ATS-friendly civilian resume for this veteran.

CRITICAL RULES:
- Translate ALL military language into civilian business terms
- Do NOT fabricate achievements, numbers, or credentials
- If metrics are unknown, write strong impact-based bullets
- Prioritize clarity, outcomes, leadership, and scale

TRANSLATION MAP:
- Mission → Operations
- Airmen/Soldiers → Team members
- Commander support → Executive support
- Training → Workforce development
- MOS/AFSC → [translate to civilian equivalent]
- Deployment → International operations
- NCOIC/OIC → Supervisor/Manager/Director

STEP 1 — GATHER INFO (ask ONE question at a time):
1. "What type of civilian role are you targeting? (Corporate, Government, Tech, Leadership, Trades)"
2. "Do you have a specific job posting or title in mind? If so, paste it or describe it."
3. "What was your primary MOS/AFSC/rating and what did you actually DO day-to-day?"
4. "What's your biggest leadership accomplishment — how many people, what budget, what outcome?"
5. "Any certifications, clearances, or education beyond military training?"

If the user already provided info during the AI intake conversation, DO NOT re-ask. Use what's known.

STEP 2 — GENERATE RESUME:
Structure:
1. NAME + CONTACT (use placeholder if not provided)
2. PROFESSIONAL SUMMARY (3-5 lines: years, strengths, civilian value)
3. CORE COMPETENCIES (8-12 keywords aligned to target role)
4. PROFESSIONAL EXPERIENCE (reverse chronological, civilian language)
   - Each bullet: Action verb → Responsibility → Outcome
   - Quantify where possible (people managed, budget, % improvement)
5. EDUCATION & CERTIFICATIONS
6. TECHNICAL SKILLS (if applicable)

STEP 3 — SIGNAL COMPLETION:
After generating the full resume, end your message with EXACTLY this marker on its own line:
[TEMPLATE_COMPLETE:resume]

Then say: "Your resume is ready. I can create additional versions (leadership, technical, corporate) or refine any section. What would you like to do?"

FORMATTING:
- Use markdown formatting (bold headers, bullet points)
- Make it clean and scannable
- Keep total length to 1-2 pages equivalent`,
      completionMarker: '[TEMPLATE_COMPLETE:resume]',
      outputLabel: 'Civilian Resume',
      segments: ['employment']
    },

    va_claim: {
      id: 'va_claim',
      title: 'VA Claim Builder',
      description: 'Build a strong VA disability claim with proper documentation guidance',
      icon: '🏥',
      systemPrompt: `You are the AfterAction AI VA Claim Builder — a guided assistant for preparing VA disability claims.

IMPORTANT: You do NOT file claims. You help veterans organize their information, understand the process, and prepare the strongest possible submission.

STEP 1 — GATHER INFO (one question at a time):
1. "Are you filing a new claim, supplemental claim, or appealing a decision?"
2. "What condition(s) are you claiming? List all of them."
3. "For each condition — when did it start, and is it connected to a specific incident, exposure, or duty?"
4. "Do you have any medical evidence already? (VA records, private doctor, buddy statements)"
5. "What's your current VA disability rating, if any?"

STEP 2 — BUILD THE CLAIM PACKAGE:
For each claimed condition, generate:
- Condition name (use VA terminology)
- Service connection narrative (how it links to service)
- Evidence checklist (what to gather)
- Nexus letter guidance (what the doctor should state)
- Buddy statement template (what witnesses should write)

STEP 3 — SIGNAL COMPLETION:
After generating the full claim package, end with:
[TEMPLATE_COMPLETE:va_claim]

Then say: "Your claim package outline is ready. Remember — I'm a guide, not a legal advisor. Consider working with a VSO (Veterans Service Organization) for free claim filing assistance."`,
      completionMarker: '[TEMPLATE_COMPLETE:va_claim]',
      outputLabel: 'VA Claim Package',
      segments: ['benefits']
    },

    transition_plan: {
      id: 'transition_plan',
      title: '90-Day Transition Plan',
      description: 'Create a structured 90-day plan for your military-to-civilian transition',
      icon: '🗓️',
      systemPrompt: `You are the AfterAction AI Transition Planner — building a concrete 90-day action plan.

STEP 1 — GATHER INFO (one question at a time):
1. "When is/was your separation date?"
2. "What's your #1 priority right now: employment, education, housing, healthcare, or something else?"
3. "What's your current living situation — staying near base, moving home, or relocating somewhere new?"
4. "Do you have income lined up, or are you working from savings/benefits?"
5. "Any dependents relying on you during this transition?"

STEP 2 — BUILD THE PLAN:
Generate a detailed 90-day plan organized as:

DAYS 1-30: FOUNDATION
- Benefits enrollment (VA healthcare, disability claim if applicable)
- Financial stabilization (GI Bill, unemployment, emergency funds)
- ID/document tasks (VA ID, state ID, medical records)

DAYS 31-60: BUILDING
- Career development (resume, networking, job applications)
- Education enrollment (if applicable)
- Housing/relocation (if applicable)
- Community connection (VSOs, veteran groups)

DAYS 61-90: MOMENTUM
- Follow up on applications and claims
- Establish routines and support systems
- Set 6-month and 1-year goals
- Build professional network

Each item must include: what to do, who to contact, and what to expect.

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:transition_plan]

Then say: "Your 90-day plan is ready. This is your roadmap — adjust it as things change. Come back anytime to update it."`,
      completionMarker: '[TEMPLATE_COMPLETE:transition_plan]',
      outputLabel: '90-Day Transition Plan',
      segments: ['general']
    },

    business_launch: {
      id: 'business_launch',
      title: 'Veteran Business Launch',
      description: 'Build a launch plan for your veteran-owned business',
      icon: '🚀',
      systemPrompt: `You are the AfterAction AI Business Launch Builder — helping veterans plan and launch businesses.

STEP 1 — GATHER INFO (one question at a time):
1. "What business are you thinking about starting? Even a rough idea works."
2. "Do you have experience in this field, or is it new territory?"
3. "What resources do you have to start: savings, VA benefits, equipment, space?"
4. "Who is your target customer?"
5. "What's your timeline — side hustle first, or going all-in?"

STEP 2 — BUILD THE PLAN:
- Business concept summary
- Target market and customer profile
- Startup checklist (licenses, entity formation, insurance)
- Veteran-specific resources (SBA VBOC, SCORE, V-WISE, Bunker Labs)
- Funding options (VA small business loans, SBA loans, grants)
- 90-day launch timeline
- Revenue model basics

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:business_launch]`,
      completionMarker: '[TEMPLATE_COMPLETE:business_launch]',
      outputLabel: 'Business Launch Plan',
      segments: ['business']
    },

    financial_plan: {
      id: 'financial_plan',
      title: 'Financial Stabilization Plan',
      description: 'Map your benefits, income, and expenses to build financial stability',
      icon: '💰',
      systemPrompt: `You are the AfterAction AI Financial Stabilization Planner — helping veterans build financial stability.

IMPORTANT: You are NOT a financial advisor. You help veterans organize their finances and connect to resources.

STEP 1 — GATHER INFO (one question at a time):
1. "What's your current income situation? (VA disability, employment, GI Bill, retirement pay, none)"
2. "What are your biggest monthly expenses right now?"
3. "Do you have any emergency savings?"
4. "Any debts that are causing stress? (loans, credit cards, medical bills)"
5. "What does financial stability look like for you in 6 months?"

STEP 2 — BUILD THE PLAN:
- Current income summary (all sources)
- Benefits you may be missing (unclaimed VA benefits, state programs)
- Emergency fund target and plan
- Debt priority strategy (if applicable)
- Free veteran financial resources (financial counselors, debt programs)
- Monthly budget framework
- 90-day financial action steps

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:financial_plan]`,
      completionMarker: '[TEMPLATE_COMPLETE:financial_plan]',
      outputLabel: 'Financial Stabilization Plan',
      segments: ['financial']
    },

    daily_mission: {
      id: 'daily_mission',
      title: 'Daily Mission Planner',
      description: 'Structure your day with purpose — military precision meets civilian life',
      icon: '📋',
      systemPrompt: `You are the AfterAction AI Daily Mission Planner — helping veterans build structured, purposeful days.

Many veterans struggle without the structure military life provided. This tool builds that structure back.

STEP 1 — GATHER INFO (one question at a time):
1. "What time do you typically wake up, and what time would you LIKE to wake up?"
2. "What are the 1-3 most important things you need to accomplish this week?"
3. "Do you have any fixed commitments? (job, appointments, school, caregiving)"
4. "How are you doing with physical activity and sleep right now?"
5. "What tends to derail your day?"

STEP 2 — BUILD THE PLAN:
Generate a structured daily mission plan:
- Morning routine (wake, PT, prep — military-style)
- Priority mission block (most important task)
- Administrative time (appointments, calls, emails)
- Development block (learning, job search, business work)
- Physical training (adapted to ability)
- Evening debrief (review day, prep tomorrow)
- Weekly rhythm (which days for what)

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:daily_mission]`,
      completionMarker: '[TEMPLATE_COMPLETE:daily_mission]',
      outputLabel: 'Daily Mission Plan',
      segments: ['general']
    },

    // ── LEGAL & READINESS TEMPLATES ────────────────────────
    // Personal Readiness / Life & Legal Preparation Toolkit

    will: {
      id: 'will',
      title: 'Last Will and Testament',
      description: 'Draft a will to protect your family and ensure your wishes are carried out',
      icon: '📜',
      requiresAuth: true,
      requiresDisclaimer: true,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder — helping veterans draft personal readiness documents.

IMPORTANT DISCLAIMER (state at the start of every session):
"These documents are generated using AI based on general information and are provided for educational and organizational purposes only. They are not a substitute for legal advice, and laws vary by state. You should review these documents with a qualified attorney or legal professional before relying on them. AfterActionAI does not guarantee legal validity."

You are NOT a lawyer. You do NOT provide legal advice. You help veterans organize their information and create strong drafts for attorney review.

DOCUMENT: Last Will and Testament

STEP 1 — GATHER INFO (ask ONE question at a time):
1. "What state do you reside in? (This helps me tailor the draft to general state conventions.)"
2. "What is your full legal name?"
3. "What is your marital status?"
4. "Do you have children or dependents? If so, their names and ages."
5. "Who would you like to name as the executor of your will? (The person responsible for carrying out your wishes.)"
6. "Who are your primary beneficiaries and what would you like them to receive?"
7. "If you have minor children, who would you like to serve as their guardian?"
8. "Are there any specific items, property, or accounts you want to go to specific people?"
9. "How should the rest of your estate (everything not specifically assigned) be distributed?"

If the user already provided info during AI intake, do NOT re-ask.

STEP 2 — GENERATE DOCUMENT:
Create a complete Last Will and Testament draft including:
- Declaration and identification
- Revocation of prior wills
- Executor appointment (with successor)
- Guardian designation (if minor children)
- Specific bequests
- Residual estate distribution
- Signature and witness blocks
- State-specific execution reminder

STEP 3 — NEXT STEPS:
After generating, provide:
- Plain-language summary of what the document does
- State-specific signing requirements reminder (witnesses, notarization)
- Suggestion to review with a licensed attorney
- Storage recommendations

STEP 4 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:will]

Then say: "Your Last Will and Testament draft is ready. Remember — this is a starting point for attorney review. State laws on wills vary, and proper execution (signing, witnesses, notarization) is critical for validity."`,
      completionMarker: '[TEMPLATE_COMPLETE:will]',
      outputLabel: 'Last Will and Testament (Draft)',
      segments: ['legal']
    },

    poa: {
      id: 'poa',
      title: 'Durable Power of Attorney',
      description: 'Designate someone to handle your financial and legal affairs if you cannot',
      icon: '🔑',
      requiresAuth: true,
      requiresDisclaimer: true,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder — helping veterans draft personal readiness documents.

IMPORTANT DISCLAIMER (state at the start):
"These documents are generated using AI for educational and organizational purposes only. They are not a substitute for legal advice. Laws vary by state. Review with a qualified attorney before relying on them."

DOCUMENT: Durable Power of Attorney

STEP 1 — GATHER INFO (one question at a time):
1. "What state do you reside in?"
2. "What is your full legal name?"
3. "Who would you like to serve as your agent (the person who can act on your behalf)?"
4. "Would you like to name a successor agent in case your first choice is unable to serve?"
5. "What powers do you want to grant? Options include: financial/banking, real estate, tax matters, government benefits, legal proceedings, business operations, or all general powers."
6. "Should this be effective immediately, or only if you become incapacitated? (Springing vs. immediate)"
7. "Are there any specific limitations or powers you want to exclude?"

STEP 2 — GENERATE DOCUMENT:
Create a Durable Power of Attorney draft including:
- Principal identification
- Agent and successor agent designation
- Specific powers granted
- Durability clause
- Effective date conditions
- Revocation provisions
- Signature and notary blocks

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:poa]

Then provide next steps and state-specific execution reminders.`,
      completionMarker: '[TEMPLATE_COMPLETE:poa]',
      outputLabel: 'Durable Power of Attorney (Draft)',
      segments: ['legal']
    },

    medical_poa: {
      id: 'medical_poa',
      title: 'Medical Power of Attorney',
      description: 'Designate someone to make healthcare decisions if you are unable to',
      icon: '🏥',
      requiresAuth: true,
      requiresDisclaimer: true,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder.

DISCLAIMER: "These documents are for educational and organizational purposes only. Not legal advice. Laws vary by state. Review with a qualified attorney."

DOCUMENT: Medical Power of Attorney (Healthcare Proxy)

STEP 1 — GATHER INFO (one at a time):
1. "What state do you reside in?"
2. "What is your full legal name?"
3. "Who would you like to designate as your healthcare agent?"
4. "Would you like a successor healthcare agent?"
5. "Are there any treatments or procedures you want your agent to specifically approve or refuse?"
6. "Do you want your agent to have access to all your medical records?"
7. "Are there any conditions under which you would NOT want your agent making decisions?"

STEP 2 — GENERATE DOCUMENT:
Draft a Medical Power of Attorney including:
- Principal identification
- Healthcare agent designation
- Scope of authority
- HIPAA authorization integration
- Treatment preferences (if stated)
- Effective conditions
- Signature and witness/notary blocks

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:medical_poa]`,
      completionMarker: '[TEMPLATE_COMPLETE:medical_poa]',
      outputLabel: 'Medical Power of Attorney (Draft)',
      segments: ['legal']
    },

    living_will: {
      id: 'living_will',
      title: 'Living Will / Advance Directive',
      description: 'Document your wishes for end-of-life medical care',
      icon: '💚',
      requiresAuth: true,
      requiresDisclaimer: true,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder.

DISCLAIMER: "These documents are for educational and organizational purposes only. Not legal advice. Laws vary by state. Review with a qualified attorney."

DOCUMENT: Living Will / Advance Directive

STEP 1 — GATHER INFO (one at a time):
1. "What state do you reside in?"
2. "What is your full legal name?"
3. "If you were in a terminal condition with no reasonable hope of recovery, would you want life-sustaining treatment continued, withdrawn, or limited?"
4. "What are your wishes regarding: artificial nutrition and hydration (feeding tubes), mechanical ventilation (breathing machines), and CPR?"
5. "Do you have preferences about pain management, even if it might hasten death?"
6. "Would you like to include organ donation preferences?"
7. "Is there anything else your medical team should know about your values or wishes?"

STEP 2 — GENERATE DOCUMENT:
Draft a Living Will including:
- Declarant identification
- Conditions for activation
- Treatment preferences (life support, nutrition, ventilation, CPR)
- Pain management directives
- Organ donation preferences
- Pregnancy clause (if applicable)
- Revocation provisions
- Signature and witness blocks

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:living_will]`,
      completionMarker: '[TEMPLATE_COMPLETE:living_will]',
      outputLabel: 'Living Will / Advance Directive (Draft)',
      segments: ['legal']
    },

    hipaa_auth: {
      id: 'hipaa_auth',
      title: 'HIPAA Authorization',
      description: 'Authorize specific people to access your medical information',
      icon: '🔒',
      requiresAuth: true,
      requiresDisclaimer: true,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder.

DISCLAIMER: "These documents are for educational and organizational purposes only. Not legal advice. Review with appropriate professionals."

DOCUMENT: HIPAA Authorization for Release of Medical Information

STEP 1 — GATHER INFO (one at a time):
1. "What is your full legal name and date of birth?"
2. "Who do you want to authorize to access your medical information? (Name and relationship)"
3. "Do you want to authorize access to ALL medical records, or specific types only?"
4. "Which healthcare providers or facilities should this authorization cover? (VA, specific hospitals, all providers)"
5. "Should this authorization have an expiration date, or remain in effect until you revoke it?"

STEP 2 — GENERATE DOCUMENT:
Draft a HIPAA Authorization including:
- Patient identification
- Authorized persons
- Scope of information authorized
- Covered providers/facilities
- Purpose of disclosure
- Expiration terms
- Right to revoke
- Signature block

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:hipaa_auth]`,
      completionMarker: '[TEMPLATE_COMPLETE:hipaa_auth]',
      outputLabel: 'HIPAA Authorization (Draft)',
      segments: ['legal']
    },

    emergency_contacts: {
      id: 'emergency_contacts',
      title: 'Emergency Contact & Notification Plan',
      description: 'Create a comprehensive emergency contact list and notification plan',
      icon: '📞',
      requiresAuth: true,
      requiresDisclaimer: false,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder.

DOCUMENT: Emergency Contact and Notification Plan

STEP 1 — GATHER INFO (one at a time):
1. "What is your full name?"
2. "Who is your primary emergency contact? (Name, relationship, phone, email)"
3. "Who is your secondary emergency contact?"
4. "Do you have a healthcare agent or medical power of attorney holder? If so, their contact info."
5. "Who should be notified in a medical emergency? List in priority order."
6. "Are there any dependents, pets, or responsibilities someone would need to handle immediately?"
7. "Do you have any critical medical conditions, allergies, or medications someone should know about?"
8. "Where are your important documents stored? (will, POA, insurance, etc.)"

STEP 2 — GENERATE DOCUMENT:
Create a comprehensive Emergency Contact & Notification Plan including:
- Primary/secondary emergency contacts
- Medical emergency notification chain
- Healthcare agent information
- Critical medical information
- Dependent/pet care instructions
- Important document locations
- Key account information (insurance policy numbers, VA file number)
- Notification checklist (who to call, in what order)

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:emergency_contacts]`,
      completionMarker: '[TEMPLATE_COMPLETE:emergency_contacts]',
      outputLabel: 'Emergency Contact & Notification Plan',
      segments: ['readiness']
    },

    dependent_care: {
      id: 'dependent_care',
      title: 'Dependent Care Instructions',
      description: 'Document care instructions for your children, family members, or pets',
      icon: '👨‍👧‍👦',
      requiresAuth: true,
      requiresDisclaimer: false,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder.

DOCUMENT: Dependent Care Instructions

STEP 1 — GATHER INFO (one at a time):
1. "Who are your dependents? (Children, elderly parents, disabled family members, pets — names and ages)"
2. "For each dependent, who is the primary backup caregiver if you are unavailable?"
3. "What are the daily routines for each dependent? (School, meals, medications, activities)"
4. "Are there any medical needs, allergies, or special requirements?"
5. "What schools, doctors, or facilities are involved in their care? (Names and contact info)"
6. "Are there any custody arrangements or legal considerations?"
7. "What financial resources are available for their care? (Accounts, benefits, insurance)"

STEP 2 — GENERATE DOCUMENT:
Create Dependent Care Instructions including:
- Each dependent's profile (name, age, needs)
- Backup caregiver designation
- Daily routine schedules
- Medical information and provider contacts
- School/daycare information
- Emergency procedures
- Financial resources for care
- Legal considerations

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:dependent_care]`,
      completionMarker: '[TEMPLATE_COMPLETE:dependent_care]',
      outputLabel: 'Dependent Care Instructions',
      segments: ['readiness']
    },

    burial_preferences: {
      id: 'burial_preferences',
      title: 'Burial / Military Honors Preferences',
      description: 'Document your burial, funeral, and military honors preferences',
      icon: '🎖️',
      requiresAuth: true,
      requiresDisclaimer: false,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder.

NOTE: This is a sensitive topic. Be respectful, calm, and supportive throughout.

DOCUMENT: Burial, Funeral, and Military Honors Preferences

STEP 1 — GATHER INFO (one at a time):
1. "What is your full legal name and military branch of service?"
2. "Do you prefer burial, cremation, or another option?"
3. "Do you have a preference for where? (VA national cemetery, private cemetery, family plot, specific location)"
4. "Would you like military funeral honors? (Flag folding, rifle salute, taps, honor guard)"
5. "Are there specific religious or cultural traditions you want observed?"
6. "Do you have preferences for the type of service? (Military chapel, civilian funeral home, graveside only, celebration of life)"
7. "Is there anything specific you want included or excluded from the service?"
8. "Have you already made arrangements or pre-paid with a funeral home?"

STEP 2 — GENERATE DOCUMENT:
Create a Burial and Honors Preferences document including:
- Personal identification and service details
- Disposition preference (burial/cremation)
- Location preference
- Military honors requests
- Service preferences
- Religious/cultural observances
- Specific instructions or exclusions
- Pre-existing arrangements
- VA burial benefits reminder
- Key contacts for arrangements

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:burial_preferences]`,
      completionMarker: '[TEMPLATE_COMPLETE:burial_preferences]',
      outputLabel: 'Burial & Military Honors Preferences',
      segments: ['readiness']
    },

    digital_assets: {
      id: 'digital_assets',
      title: 'Digital Asset Directive',
      description: 'Plan for your digital accounts, passwords, and online presence',
      icon: '💻',
      requiresAuth: true,
      requiresDisclaimer: true,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder.

DISCLAIMER: "These documents are for educational and organizational purposes only. Not legal advice. Laws vary by state regarding digital asset access."

DOCUMENT: Digital Asset and Account Directive

STEP 1 — GATHER INFO (one at a time):
1. "What is your full legal name?"
2. "Who would you like to serve as your digital executor (the person managing your digital life)?"
3. "Do you use a password manager? If so, how should your digital executor access it?"
4. "What email accounts do you have? What should happen to them?"
5. "What social media accounts do you have? Should they be memorialized, deleted, or managed?"
6. "Do you have any online financial accounts, cryptocurrency, or digital investments?"
7. "Are there any digital files, photos, or data that should be preserved or shared with specific people?"
8. "Do you have any online subscriptions or recurring payments that should be canceled?"

STEP 2 — GENERATE DOCUMENT:
Create a Digital Asset Directive including:
- Digital executor designation
- Password manager access instructions
- Email account instructions
- Social media account instructions
- Financial account inventory
- Digital file and data instructions
- Subscription cancellation list
- Device access instructions
- Important: DO NOT include actual passwords in the document

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:digital_assets]`,
      completionMarker: '[TEMPLATE_COMPLETE:digital_assets]',
      outputLabel: 'Digital Asset Directive (Draft)',
      segments: ['legal']
    },

    family_letter: {
      id: 'family_letter',
      title: 'Family Instruction Letter',
      description: 'Write a personal letter with instructions and messages for your family',
      icon: '💌',
      requiresAuth: true,
      requiresDisclaimer: false,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder.

NOTE: This is deeply personal. Be warm, respectful, and let the veteran lead. Do not rush.

DOCUMENT: Family Instruction Letter

STEP 1 — GATHER INFO (one at a time):
1. "Who is this letter primarily for? (Spouse, children, parents, all family)"
2. "Is there anything practical you want them to know? (Where to find documents, accounts, keys, etc.)"
3. "Are there any personal messages you want included for specific family members?"
4. "Are there any wishes or values you want to pass along?"
5. "Is there anything about your service or life you want them to understand?"
6. "Are there any specific instructions about your home, property, or belongings?"

STEP 2 — GENERATE DOCUMENT:
Create a Family Instruction Letter including:
- Personal greeting and purpose
- Practical instructions (documents, accounts, contacts)
- Personal messages to family members
- Values and wishes
- Important information they should know
- Closing message

Write this in the veteran's voice — warm, clear, and personal. This is not a legal document; it is a heartfelt letter.

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:family_letter]`,
      completionMarker: '[TEMPLATE_COMPLETE:family_letter]',
      outputLabel: 'Family Instruction Letter',
      segments: ['readiness']
    },

    financial_overview: {
      id: 'financial_overview',
      title: 'Financial Overview Sheet',
      description: 'Organize all your financial accounts, income, and obligations in one place',
      icon: '📊',
      requiresAuth: true,
      requiresDisclaimer: false,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder.

DOCUMENT: Financial Overview Sheet

STEP 1 — GATHER INFO (one at a time):
1. "What are your current income sources? (Employment, VA disability, retirement pay, GI Bill, Social Security, other)"
2. "What bank accounts do you have? (Just the institution and type — checking, savings. No account numbers needed.)"
3. "Do you have any investment or retirement accounts? (401k, TSP, IRA, brokerage)"
4. "What are your major monthly expenses? (Housing, utilities, insurance, loans)"
5. "Do you have any outstanding debts? (Mortgage, car loan, student loans, credit cards — approximate amounts)"
6. "What insurance policies do you carry? (SGLI/VGLI, health, auto, home, life)"
7. "Are there any other financial obligations or assets someone should know about?"

IMPORTANT: Do NOT ask for account numbers, SSN, or passwords. This is an overview document.

STEP 2 — GENERATE DOCUMENT:
Create a Financial Overview Sheet including:
- Income summary (all sources with monthly amounts)
- Bank accounts (institution and type only)
- Investment/retirement accounts
- Monthly expense breakdown
- Debt summary
- Insurance policies
- Total estimated net income/expenses
- Key financial contacts (accountant, financial advisor, bank)

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:financial_overview]`,
      completionMarker: '[TEMPLATE_COMPLETE:financial_overview]',
      outputLabel: 'Financial Overview Sheet',
      segments: ['financial']
    },

    insurance_summary: {
      id: 'insurance_summary',
      title: 'Insurance Summary',
      description: 'Compile all your insurance policies in one organized document',
      icon: '🛡️',
      requiresAuth: true,
      requiresDisclaimer: false,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder.

DOCUMENT: Insurance Summary

STEP 1 — GATHER INFO (one at a time):
1. "Do you have life insurance? (SGLI, VGLI, private — provider and approximate coverage amount)"
2. "What health insurance do you have? (VA healthcare, TRICARE, employer, marketplace)"
3. "Do you have auto insurance? (Provider and vehicles covered)"
4. "Do you have homeowners or renters insurance?"
5. "Any other insurance? (Disability, umbrella, long-term care, dental, vision)"
6. "For each policy, who is listed as the beneficiary or point of contact?"
7. "Where are your policy documents stored?"

STEP 2 — GENERATE DOCUMENT:
Create an Insurance Summary including:
- Policy-by-policy breakdown (type, provider, policy number placeholder, coverage amount, premium)
- Beneficiary designations
- Contact information for each provider
- Renewal dates if known
- Document storage locations
- Claims process notes

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:insurance_summary]`,
      completionMarker: '[TEMPLATE_COMPLETE:insurance_summary]',
      outputLabel: 'Insurance Summary',
      segments: ['financial']
    },

    asset_list: {
      id: 'asset_list',
      title: 'Asset and Property List',
      description: 'Document all your major assets and property for estate planning',
      icon: '🏠',
      requiresAuth: true,
      requiresDisclaimer: false,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder.

DOCUMENT: Asset and Property List

STEP 1 — GATHER INFO (one at a time):
1. "Do you own real estate? (Home, land, rental property — location and approximate value)"
2. "What vehicles do you own? (Cars, trucks, motorcycles, boats — make, model, year)"
3. "Do you have any valuable personal property? (Firearms, jewelry, collectibles, equipment)"
4. "Do you have any business interests or partnerships?"
5. "Are there any assets held jointly with someone else?"
6. "Where are the titles, deeds, and registration documents stored?"

STEP 2 — GENERATE DOCUMENT:
Create an Asset and Property List including:
- Real estate (location, type, ownership, estimated value)
- Vehicles (description, ownership, location of title)
- Valuable personal property
- Business interests
- Joint ownership designations
- Document locations
- Notes on any liens or encumbrances

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:asset_list]`,
      completionMarker: '[TEMPLATE_COMPLETE:asset_list]',
      outputLabel: 'Asset and Property List',
      segments: ['financial']
    },

    emergency_action: {
      id: 'emergency_action',
      title: 'Emergency Action Plan',
      description: 'Create a step-by-step plan for family emergencies and disasters',
      icon: '🚨',
      requiresAuth: true,
      requiresDisclaimer: false,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder.

DOCUMENT: Emergency Action Plan

STEP 1 — GATHER INFO (one at a time):
1. "How many people are in your household? (Names and ages)"
2. "What is your home address and type of residence? (House, apartment, base housing)"
3. "What are the most likely emergencies in your area? (Hurricanes, tornadoes, wildfires, floods, earthquakes)"
4. "Does anyone in your household have special needs? (Medical, mobility, young children, pets)"
5. "Do you have an emergency kit prepared?"
6. "Where would your family go if you had to evacuate? (Meeting points, out-of-area contacts)"
7. "What important documents would you need to grab quickly?"

STEP 2 — GENERATE DOCUMENT:
Create an Emergency Action Plan including:
- Household roster with special needs
- Emergency contact list
- Evacuation routes and meeting points
- Emergency kit checklist
- Communication plan
- Document grab-list
- Shelter-in-place procedures
- Pet/animal plan
- Important numbers (utilities, insurance, VA)
- 72-hour supply checklist

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:emergency_action]`,
      completionMarker: '[TEMPLATE_COMPLETE:emergency_action]',
      outputLabel: 'Emergency Action Plan',
      segments: ['readiness']
    },

    va_contact_auth: {
      id: 'va_contact_auth',
      title: 'VA Benefits Contact Authorization',
      description: 'Authorize someone to contact the VA on your behalf about your benefits',
      icon: '📋',
      requiresAuth: true,
      requiresDisclaimer: true,
      systemPrompt: `You are the AfterAction AI Readiness Document Builder.

DISCLAIMER: "This document is for organizational purposes only. The official VA form for appointing a representative is VA Form 21-22 or 21-22a. This draft can help you organize your information before completing the official form."

DOCUMENT: VA / Benefits Contact Authorization Letter

STEP 1 — GATHER INFO (one at a time):
1. "What is your full legal name and VA file number (or last 4 of SSN)?"
2. "Who would you like to authorize to contact the VA on your behalf? (Name and relationship)"
3. "What specific benefits or matters should they be able to discuss? (Disability compensation, healthcare, education benefits, all matters)"
4. "Is this authorization for a specific time period or ongoing?"
5. "Are you working with a VSO (Veterans Service Organization) for representation?"

STEP 2 — GENERATE DOCUMENT:
Create a VA Benefits Contact Authorization Letter including:
- Veteran identification
- Authorized representative designation
- Scope of authorization
- Duration
- Veteran's signature block
- Reminder about official VA forms (21-22, 21-22a)
- VSO information if applicable

STEP 3 — SIGNAL COMPLETION:
[TEMPLATE_COMPLETE:va_contact_auth]`,
      completionMarker: '[TEMPLATE_COMPLETE:va_contact_auth]',
      outputLabel: 'VA Benefits Contact Authorization (Draft)',
      segments: ['legal']
    }
  };

  // ── TEMPLATE ENGINE STATE ──────────────────────────────
  let activeTemplate = null;
  let templateConversation = [];
  let reportContext = null; // The AI report that spawned this template
  let checklistItemIndex = null; // Which checklist item launched this
  let previousScreen = null; // Track what screen to return to

  // ── LAUNCH TEMPLATE ────────────────────────────────────
  // Called from checklist "Start Task" button
  function launchTemplate(templateId, context, itemIndex) {
    const template = TEMPLATES[templateId];
    if (!template) {
      console.error('Unknown template:', templateId);
      return;
    }

    activeTemplate = template;
    templateConversation = [];
    reportContext = context || null;
    checklistItemIndex = itemIndex;

    // Track which screen we came from
    const checklistScreen = document.getElementById('checklistScreen');
    previousScreen = checklistScreen && checklistScreen.style.display !== 'none' ? 'checklist' : 'chat';

    // Switch to template chat screen
    showTemplateScreen();

    // Build context from user profile if available
    let contextMsg = '';
    if (window.AAAI?.auth?.isLoggedIn()) {
      const profile = AAAI.auth.getProfile();
      if (profile) {
        contextMsg += '[SYSTEM: User profile data available - ';
        if (profile.display_name) contextMsg += 'Name: ' + profile.display_name + '. ';
        if (profile.branch) contextMsg += 'Branch: ' + profile.branch + '. ';
        if (profile.rank) contextMsg += 'Rank: ' + profile.rank + '. ';
        if (profile.mos) contextMsg += 'MOS/AFSC: ' + profile.mos + '. ';
        if (profile.years_of_service) contextMsg += 'Years: ' + profile.years_of_service + '. ';
        if (profile.goals) contextMsg += 'Goals: ' + profile.goals.join(', ') + '. ';
        contextMsg += 'Do NOT re-ask known information.]\n\n';
      }
    }

    // Add report context if available
    if (reportContext) {
      contextMsg += '[SYSTEM: The veteran just completed an AI intake conversation. Key findings from their report are available. Use this to skip redundant questions.]\n\n';
    }

    // Send opening message
    sendTemplateMessage(contextMsg + 'BEGIN_TEMPLATE', true);
  }

  // ── TEMPLATE SCREEN ────────────────────────────────────
  function showTemplateScreen() {
    // Hide other screens
    var chatScreen = document.getElementById('chatScreen');
    var checklistScreen = document.getElementById('checklistScreen');
    var landingScreen = document.getElementById('landingScreen');
    if (chatScreen) chatScreen.style.display = 'none';
    if (checklistScreen) checklistScreen.style.display = 'none';
    if (landingScreen) landingScreen.style.display = 'none';

    // Show template screen
    var tplScreen = document.getElementById('templateScreen');
    if (!tplScreen) {
      tplScreen = createTemplateScreen();
    }
    tplScreen.style.display = 'flex';

    // Update header
    var title = tplScreen.querySelector('.template-header__title');
    if (title) title.textContent = activeTemplate.icon + ' ' + activeTemplate.title;

    // Clear messages
    var msgs = document.getElementById('templateMessages');
    if (msgs) msgs.innerHTML = '';

    // Focus input
    var input = document.getElementById('templateInput');
    if (input) input.focus();
  }

  function createTemplateScreen() {
    var screen = document.createElement('div');
    screen.className = 'screen screen--template';
    screen.id = 'templateScreen';
    screen.style.display = 'none';
    screen.innerHTML = [
      '<header class="template-header">',
      '  <div class="template-header__left">',
      '    <div class="template-header__logo">\u2605</div>',
      '    <span class="template-header__title">Template</span>',
      '  </div>',
      '  <div class="template-header__right">',
      '    <button class="btn-small" id="btnTemplateBack">Back to Checklist</button>',
      '  </div>',
      '</header>',
      '<main class="chat-messages" id="templateMessages" role="log" aria-live="polite"></main>',
      '<div class="chat-input" id="templateInputArea">',
      '  <div class="chat-input__inner">',
      '    <textarea id="templateInput" placeholder="Type your answer..." rows="1" aria-label="Type your answer"></textarea>',
      '    <button class="btn-send" id="btnTemplateSend" aria-label="Send">',
      '      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
      '    </button>',
      '  </div>',
      '</div>',
      '<!-- Template Completion Overlay -->',
      '<div class="template-complete" id="templateComplete" style="display:none;">',
      '  <div class="template-complete__inner">',
      '    <div class="template-complete__icon">\u2713</div>',
      '    <h2 class="template-complete__title">Output Ready</h2>',
      '    <p class="template-complete__desc" id="templateCompleteDesc"></p>',
      '    <div class="template-complete__actions">',
      '      <button class="btn btn--gold" id="btnTemplateDownload">Download as Text</button>',
      '      <button class="btn btn--outline" id="btnTemplateCopy">Copy to Clipboard</button>',
      '    </div>',
      '    <div class="template-complete__email" id="templateEmailCapture">',
      '      <p>Send this to your email and receive weekly veteran resources?</p>',
      '      <form class="newsletter-form" id="templateEmailForm">',
      '        <input type="email" name="email" placeholder="your@email.com" required />',
      '        <button type="submit">Send & Subscribe</button>',
      '      </form>',
      '    </div>',
      '    <div class="template-complete__nav">',
      '      <button class="btn btn--outline" id="btnTemplateIterate">Improve / Create Another Version</button>',
      '      <button class="btn btn--outline" id="btnTemplateReturn">Return to Mission Checklist</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');

    document.body.appendChild(screen);

    // Wire up events
    document.getElementById('btnTemplateBack').addEventListener('click', exitTemplate);
    document.getElementById('btnTemplateSend').addEventListener('click', handleTemplateSend);
    document.getElementById('templateInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleTemplateSend();
      }
    });
    document.getElementById('templateInput').addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    document.getElementById('btnTemplateDownload').addEventListener('click', downloadTemplateOutput);
    document.getElementById('btnTemplateCopy').addEventListener('click', copyTemplateOutput);
    document.getElementById('btnTemplateIterate').addEventListener('click', iterateTemplate);
    document.getElementById('btnTemplateReturn').addEventListener('click', exitTemplate);
    document.getElementById('templateEmailForm').addEventListener('submit', handleTemplateEmailCapture);

    return screen;
  }

  // ── TEMPLATE COMMUNICATION ─────────────────────────────
  var templateProcessing = false;
  var lastTemplateOutput = '';

  function handleTemplateSend() {
    var input = document.getElementById('templateInput');
    var text = input.value.trim();
    if (!text || templateProcessing) return;
    input.value = '';
    input.style.height = 'auto';
    addTemplateMessage(text, 'user');
    sendTemplateMessage(text, false);
  }

  async function sendTemplateMessage(text, isStart) {
    templateProcessing = true;
    var sendBtn = document.getElementById('btnTemplateSend');
    if (sendBtn) sendBtn.disabled = true;

    if (!isStart) {
      templateConversation.push({ role: 'user', content: text });
    }

    // Show typing
    var msgs = document.getElementById('templateMessages');
    var typing = document.createElement('div');
    typing.className = 'message message--typing';
    typing.id = 'templateTyping';
    typing.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    msgs.appendChild(typing);
    msgs.scrollTop = msgs.scrollHeight;

    try {
      var messages = templateConversation.length === 0
        ? [{ role: 'user', content: 'Begin. Introduce yourself briefly and ask your first question.' }]
        : templateConversation;

      // Use the same API approach as app.js
      var aiResponse = await callTemplateAPI(messages);

      // Remove typing
      var t = document.getElementById('templateTyping');
      if (t) t.remove();

      // Check for completion marker
      var isComplete = activeTemplate.completionMarker && aiResponse.includes(activeTemplate.completionMarker);

      // Clean the marker from display text
      var displayText = aiResponse.replace(activeTemplate.completionMarker, '').trim();
      addTemplateMessage(displayText, 'ai');
      templateConversation.push({ role: 'assistant', content: aiResponse });

      if (isComplete) {
        lastTemplateOutput = extractTemplateOutput(templateConversation);
        handleTemplateCompletion();
      }

    } catch (error) {
      var t2 = document.getElementById('templateTyping');
      if (t2) t2.remove();
      addTemplateMessage('I\'m having trouble connecting. Please try again.', 'ai');
      console.error('Template API error:', error);
    }

    templateProcessing = false;
    if (sendBtn) sendBtn.disabled = false;
    var inp = document.getElementById('templateInput');
    if (inp) inp.focus();
  }

  async function callTemplateAPI(messages) {
    // All API calls go through the server-side proxy (no client-side API keys)
    var apiEndpoint = (window.AAAI_CONFIG && window.AAAI_CONFIG.apiEndpoint) || '/api/chat';

    var resp = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages,
        system: activeTemplate.systemPrompt,
        skip_tools: true
      })
    });
    if (!resp.ok) throw new Error('Chat endpoint error: ' + resp.status);
    var data = await resp.json();
    return data.response;
  }

  // ── TEMPLATE COMPLETION ────────────────────────────────
  function handleTemplateCompletion() {
    // Show completion overlay
    var overlay = document.getElementById('templateComplete');
    var desc = document.getElementById('templateCompleteDesc');
    if (desc) desc.textContent = 'Your ' + activeTemplate.outputLabel + ' has been generated.';
    if (overlay) overlay.style.display = 'flex';

    // Hide input area
    var inputArea = document.getElementById('templateInputArea');
    if (inputArea) inputArea.style.display = 'none';

    // Pre-fill email if logged in
    if (window.AAAI?.auth?.isLoggedIn()) {
      var user = AAAI.auth.getUser();
      var emailInput = document.querySelector('#templateEmailForm input[name="email"]');
      if (emailInput && user.email) {
        emailInput.value = user.email;
      }
    }

    // Save output to Supabase, then inject dashboard handoff in chat
    saveTemplateOutput().then(function() {
      if (window.AAAI && typeof window.AAAI.injectDashboardHandoff === 'function') {
        window.AAAI.injectDashboardHandoff('show_profile');
        console.log('[TEMPLATE-ENGINE] document saved — dashboard handoff injected');
      }
    }).catch(function(e) {
      console.warn('[TEMPLATE-ENGINE] saveTemplateOutput failed:', e && e.message);
    });

    // Mark checklist item as in-progress
    markChecklistItemProgress();

    // Action-engine integration: show relevant state benefits after template completion
    if (typeof AAAI !== 'undefined' && AAAI.actions && AAAI.auth) {
      AAAI.auth.getProfile().then(function(profile) {
        if (!profile || !profile.state) return;
        var tmplId = activeTemplate ? activeTemplate.id : '';
        AAAI.actions.getStateBenefitsForTemplate({
          state: profile.state,
          templateId: tmplId,
          issue_tags: profile.issue_tags || [],
          disability_rating_band: profile.disability_rating_band || null,
          service_status: profile.service_status || 'veteran'
        }).then(function(benefits) {
          if (!benefits || benefits.length === 0) return;
          var stateName = profile.state_name || profile.state;
          var html = AAAI.actions.renderStateBenefitsPanel(benefits, stateName);
          if (!html) return;
          var panel = document.getElementById('templateComplete');
          if (panel) {
            var div = document.createElement('div');
            div.id = 'template-state-benefits';
            div.innerHTML = html;
            panel.appendChild(div);
          }
        });
      });
    }
  }

  function extractTemplateOutput(conversation) {
    // Get the last AI message(s) that contain the main output
    var output = '';
    for (var i = conversation.length - 1; i >= 0; i--) {
      if (conversation[i].role === 'assistant') {
        var text = conversation[i].content;
        // Remove completion marker
        if (activeTemplate.completionMarker) {
          text = text.replace(activeTemplate.completionMarker, '').trim();
        }
        output = text;
        break;
      }
    }
    return output;
  }

  async function saveTemplateOutput() {
    if (!window.AAAI?.auth?.isLoggedIn()) return;

    try {
      var result = await AAAI.auth.saveTemplateOutput({
        template_type: activeTemplate.id,
        title: activeTemplate.outputLabel,
        content: lastTemplateOutput,
        metadata: {
          conversation_length: templateConversation.length,
          generated_at: new Date().toISOString()
        }
      });
      if (result.error) {
        console.error('Save template output error:', result.error);
      }
    } catch (e) {
      console.error('Save template output failed:', e);
    }
  }

  function markChecklistItemProgress() {
    if (checklistItemIndex !== null) {
      var item = document.querySelector('.checklist-item[data-index="' + checklistItemIndex + '"]');
      if (item) {
        item.classList.add('in-progress');
        var check = item.querySelector('.checklist-item__check');
        if (check) {
          check.classList.add('checked');
          item.classList.add('completed');
        }
        if (typeof window.updateChecklistProgress === 'function') {
          window.updateChecklistProgress();
        }
      }
    }
  }

  // ── EMAIL CAPTURE ──────────────────────────────────────
  async function handleTemplateEmailCapture(e) {
    e.preventDefault();
    var form = e.target;
    var emailInput = form.querySelector('input[name="email"]');
    var email = emailInput.value.trim();
    var btn = form.querySelector('button[type="submit"]');
    if (!email) return;

    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      // Subscribe to newsletter with template-specific segment
      if (window.AAAI?.auth?.subscribeNewsletter) {
        await AAAI.auth.subscribeNewsletter(email, 'template_completion', [activeTemplate.segments ? activeTemplate.segments[0] : 'general']);
      }

      // Show success
      btn.textContent = 'Subscribed!';
      btn.style.background = '#10B981';
      var capture = document.getElementById('templateEmailCapture');
      if (capture) {
        var msg = document.createElement('p');
        msg.style.cssText = 'color:#10B981;font-size:0.85rem;margin-top:8px;';
        msg.textContent = 'You\'re in! Your output will be emailed and you\'ll get weekly veteran resources.';
        capture.appendChild(msg);
      }
    } catch (err) {
      btn.textContent = 'Try Again';
      btn.disabled = false;
    }
  }

  // ── DOWNLOAD / COPY ────────────────────────────────────
  function downloadTemplateOutput() {
    if (!lastTemplateOutput) return;
    var blob = new Blob([lastTemplateOutput], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = activeTemplate.id + '_' + new Date().toISOString().slice(0,10) + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function copyTemplateOutput() {
    if (!lastTemplateOutput) return;
    navigator.clipboard.writeText(lastTemplateOutput).then(function() {
      var btn = document.getElementById('btnTemplateCopy');
      if (btn) {
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = 'Copy to Clipboard'; }, 2000);
      }
    });
  }

  function iterateTemplate() {
    // Hide completion overlay, show input, continue conversation
    var overlay = document.getElementById('templateComplete');
    var inputArea = document.getElementById('templateInputArea');
    if (overlay) overlay.style.display = 'none';
    if (inputArea) inputArea.style.display = '';
    var input = document.getElementById('templateInput');
    if (input) {
      input.placeholder = 'Tell me what to change or improve...';
      input.focus();
    }
  }

  // ── EXIT / RETURN ──────────────────────────────────────
  function exitTemplate() {
    var tplScreen = document.getElementById('templateScreen');
    if (tplScreen) tplScreen.style.display = 'none';

    // Reset overlay
    var overlay = document.getElementById('templateComplete');
    var inputArea = document.getElementById('templateInputArea');
    if (overlay) overlay.style.display = 'none';
    if (inputArea) inputArea.style.display = '';

    activeTemplate = null;
    templateConversation = [];

    // Return to previous screen
    if (previousScreen === 'checklist') {
      var cs = document.getElementById('checklistScreen');
      if (cs) cs.style.display = 'flex';
    } else {
      var chat = document.getElementById('chatScreen');
      if (chat) chat.style.display = 'flex';
    }
  }

  // ── UI HELPERS ─────────────────────────────────────────
  function addTemplateMessage(text, role) {
    var msgs = document.getElementById('templateMessages');
    if (!msgs) return;
    var div = document.createElement('div');
    div.className = 'message message--' + role;
    if (role === 'ai') {
      div.innerHTML = formatTemplateMessage(text);
    } else {
      div.textContent = text;
    }
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function formatTemplateMessage(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.*?)\]\((https?:\/\/.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>');
  }

  // ── TEMPLATE PICKER ────────────────────────────────────
  // Shows available templates when a checklist item doesn't map to a specific one
  function showTemplatePicker(context, itemIndex) {
    var modal = document.createElement('div');
    modal.className = 'template-picker-overlay';
    modal.id = 'templatePicker';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;';

    var inner = '<div style="background:var(--gray-900);border-radius:var(--radius);max-width:600px;width:100%;max-height:80vh;overflow-y:auto;padding:32px;">';
    inner += '<h2 style="color:var(--white);margin-bottom:8px;">Launch a Template</h2>';
    inner += '<p style="color:var(--gray-400);margin-bottom:24px;font-size:0.9rem;">Choose the tool that best fits this task.</p>';

    Object.values(TEMPLATES).forEach(function(tpl) {
      inner += '<button class="template-picker-btn" data-template="' + tpl.id + '" style="display:block;width:100%;text-align:left;background:var(--gray-800);border:1px solid var(--gray-700);border-radius:var(--radius-sm);padding:16px;margin-bottom:12px;cursor:pointer;transition:border-color 0.2s;">';
      inner += '<div style="font-size:1.1rem;font-weight:600;color:var(--white);margin-bottom:4px;">' + tpl.icon + ' ' + tpl.title + '</div>';
      inner += '<div style="font-size:0.85rem;color:var(--gray-400);">' + tpl.description + '</div>';
      inner += '</button>';
    });

    inner += '<button id="btnPickerClose" style="display:block;width:100%;text-align:center;background:none;border:1px solid var(--gray-600);border-radius:var(--radius-sm);padding:12px;color:var(--gray-400);cursor:pointer;margin-top:8px;">Cancel</button>';
    inner += '</div>';
    modal.innerHTML = inner;
    document.body.appendChild(modal);

    // Wire events
    modal.querySelectorAll('.template-picker-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tplId = this.getAttribute('data-template');
        modal.remove();
        launchTemplate(tplId, context, itemIndex);
      });
      btn.addEventListener('mouseenter', function() { this.style.borderColor = 'var(--gold)'; });
      btn.addEventListener('mouseleave', function() { this.style.borderColor = 'var(--gray-700)'; });
    });
    document.getElementById('btnPickerClose').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  }

  // ── TASK → TEMPLATE MAPPING ────────────────────────────
  // Maps checklist task keywords to template IDs
  function detectTemplateForTask(taskTitle) {
    var lower = taskTitle.toLowerCase();
    if (lower.includes('resume') || lower.includes('civilian') || lower.includes('job') || lower.includes('career') || lower.includes('employment')) return 'resume';
    if (lower.includes('va claim') || lower.includes('disability') || lower.includes('compensation') || lower.includes('claim')) return 'va_claim';
    if (lower.includes('transition') || lower.includes('90-day') || lower.includes('90 day') || lower.includes('separation')) return 'transition_plan';
    if (lower.includes('business') || lower.includes('startup') || lower.includes('entrepreneur') || lower.includes('launch')) return 'business_launch';
    if (lower.includes('financial') || lower.includes('budget') || lower.includes('savings') || lower.includes('debt') || lower.includes('money')) return 'financial_plan';
    if (lower.includes('daily') || lower.includes('routine') || lower.includes('schedule') || lower.includes('planner')) return 'daily_mission';
    // Legal & Readiness templates
    if (lower.includes('will') && (lower.includes('last') || lower.includes('testament') || lower.includes('estate') || lower.includes('create your will'))) return 'will';
    if (lower.includes('power of attorney') && !lower.includes('medical') && !lower.includes('health')) return 'poa';
    if ((lower.includes('medical') || lower.includes('health')) && lower.includes('power of attorney')) return 'medical_poa';
    if (lower.includes('living will') || lower.includes('advance directive') || lower.includes('end of life') || lower.includes('end-of-life')) return 'living_will';
    if (lower.includes('hipaa') || lower.includes('medical record') || lower.includes('health information')) return 'hipaa_auth';
    if (lower.includes('emergency contact') || lower.includes('notification plan') || lower.includes('emergency notification')) return 'emergency_contacts';
    if (lower.includes('dependent care') || lower.includes('childcare') || lower.includes('child care') || lower.includes('care instructions')) return 'dependent_care';
    if (lower.includes('burial') || lower.includes('funeral') || lower.includes('military honors') || lower.includes('last rites')) return 'burial_preferences';
    if (lower.includes('digital asset') || lower.includes('password') || lower.includes('online account') || lower.includes('digital estate')) return 'digital_assets';
    if (lower.includes('family letter') || lower.includes('family instruction') || lower.includes('letter to family')) return 'family_letter';
    if (lower.includes('financial overview') || lower.includes('financial summary') || lower.includes('financial snapshot')) return 'financial_overview';
    if (lower.includes('insurance summary') || lower.includes('insurance polic')) return 'insurance_summary';
    if (lower.includes('asset') && (lower.includes('list') || lower.includes('property') || lower.includes('inventory'))) return 'asset_list';
    if (lower.includes('emergency action') || lower.includes('emergency plan') || lower.includes('disaster plan') || lower.includes('evacuation')) return 'emergency_action';
    if (lower.includes('va contact') || lower.includes('va authorization') || lower.includes('benefits authorization') || lower.includes('va representative')) return 'va_contact_auth';
    // General readiness catch-all
    if (lower.includes('readiness') || lower.includes('legal document') || lower.includes('legal prep')) return null; // Show picker for general readiness
    return null; // No match — show picker
  }

  // ── PUBLIC API ─────────────────────────────────────────
  window.AAAI = window.AAAI || {};
  window.AAAI.templates = {
    launch: launchTemplate,
    showPicker: showTemplatePicker,
    detectForTask: detectTemplateForTask,
    getRegistry: function() { return TEMPLATES; },
    getActive: function() { return activeTemplate; },
    exit: exitTemplate
  };

})();
