/* ══════════════════════════════════════════════════════════
   AfterAction AI — Core Conversational Engine v4
   Voice: OpenAI Realtime API via WebRTC (realtime-voice.js)
   Text:  Anthropic Claude via /api/chat (unchanged)
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────
  var CONFIG = {
    apiEndpoint: '/api/chat',
    directMode: false,
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 4096,
    streamDelay: 18
  };

  // ── DEBUG LOGGER ────────────────────────────────────────
  function log(label, detail) {
    console.log('[AAAI] ' + label + (detail ? ' — ' + detail : ''));
  }

  /* ── Phase R: withRetry ────────────────────────────────────
     Wraps network calls with exponential backoff.
     max 3 total attempts (2 retries after the initial attempt).

     Delays:  attempt 2 → 300ms  |  attempt 3 → 800ms
     Retries: network TypeError | AbortError | AI_TIMEOUT | HTTP 5xx
     Skips:   4xx | auth errors | non-network errors
     Shape:   preserves { data, error } for DataAccess callers;
              re-throws for fetch/promise-rejection callers.

     Usage:
       withRetry(function() { return someNetworkCall(); }, 'context.label')
     ──────────────────────────────────────────────────────── */
  function _isTransientError(err) {
    if (!err) return false;
    // AbortError from browser fetch, or our AI_TIMEOUT sentinel
    if (err.name === 'AbortError' || err.message === 'AI_TIMEOUT') return true;
    // Network-level failure (no HTTP response at all)
    if (err instanceof TypeError && /fetch|network|failed to fetch/i.test(err.message)) return true;
    // HTTP 5xx stringified into Error message (callChatEndpoint pattern)
    if (err.message && /Chat endpoint error: 5\d\d/.test(err.message)) return true;
    // Supabase error object with numeric .status (5xx or network 0)
    if (typeof err.status === 'number' && (err.status >= 500 || err.status === 0)) return true;
    // Supabase error as plain string mentioning network/timeout
    if (typeof err === 'string' && /network|fetch|timeout/i.test(err)) return true;
    return false;
  }

  // Delays before retry attempt 2 and attempt 3 (attempt 1 is always immediate)
  var _RETRY_DELAYS = [300, 800];

  async function withRetry(fn, contextLabel) {
    var lastErr = null;
    for (var attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) {
        var delay = _RETRY_DELAYS[attempt - 2];
        console.log('[AAAI RETRY][' + contextLabel + '] attempt ' + attempt + '/3 — waiting ' + delay + 'ms');
        await new Promise(function(resolve) { setTimeout(resolve, delay); });
      }
      try {
        var result = await fn();
        // DataAccess { data, error } shape: check resolved error for transience
        if (result !== null && typeof result === 'object' &&
            'data' in result && 'error' in result && result.error) {
          if (_isTransientError(result.error)) {
            lastErr = result.error;
            if (attempt < 3) continue;
            console.error('[AAAI RETRY][' + contextLabel + '] all 3 attempts failed:', result.error);
            return { data: null, error: lastErr };
          }
        }
        return result; // success or non-transient { data, error }
      } catch (e) {
        if (_isTransientError(e)) {
          lastErr = e;
          if (attempt < 3) continue;
          console.error('[AAAI RETRY][' + contextLabel + '] all 3 attempts failed:', e.message);
          throw lastErr;
        }
        throw e; // non-transient: propagate immediately, no retry
      }
    }
  }

  // Phase R: expose on window.AAAI so cross-module files (checklist-manager.js) can use it
  // This runs synchronously at script-load time — well before any user interaction.
  (window.AAAI = window.AAAI || {}).withRetry = withRetry;

  // ── CRISIS KEYWORDS ─────────────────────────────────────
  var CRISIS_KEYWORDS = [
    'suicide', 'kill myself', 'end it all', 'want to die', 'no point in living',
    'better off dead', 'can\'t go on', 'nothing matters', 'end my life',
    'not worth living', 'take my own life', 'loaded gun', 'overdose',
    'don\'t want to be here', 'no reason to live', 'goodbye letter',
    'planning to end', 'self harm', 'cut myself', 'hurt myself'
  ];

  // ── AT_RISK KEYWORDS (Phase 22) ──────────────────────────
  // First-person distress signals only. Never overlaps with CRISIS_KEYWORDS.
  // Checked only AFTER crisis check fails — mutual exclusivity guaranteed.
  var AT_RISK_KEYWORDS = [
    'losing my home', 'losing my house', 'about to lose my home',
    'facing eviction', 'being evicted', 'got evicted', 'getting evicted',
    'foreclosure', "can't pay rent", "can't afford rent",
    'behind on rent', 'behind on my mortgage',
    'living in my car', 'sleeping in my car', 'sleeping outside',
    'no place to live', "i'm homeless", 'i am homeless',
    'became homeless', 'just lost my housing',
    "can't pay my bills", "can't afford food", "can't afford to eat",
    'behind on bills', 'about to lose everything', 'losing everything',
    'completely alone', 'no one to turn to',
    'no one to help me', 'nobody to help me', 'totally isolated',
    'drinking problem', 'alcohol problem', 'drug problem',
    "can't stop drinking", "i'm an addict",
    'being abused', 'domestic violence',
    'unsafe at home', 'afraid to go home'
  ];

  // ── SYSTEM PROMPT (text mode only — voice mode prompt is in realtime-token.js) ──
  var SYSTEM_PROMPT = [
    'You are AfterAction AI — a free, AI-powered veteran navigator built by Mike Jackson, a retired Senior Master Sergeant with 25 years in the United States Air Force. Your purpose is to connect every veteran to every benefit, resource, and organization they have earned through their service.',
    '',
    '## CRITICAL: CLICKABLE OPTIONS SYSTEM',
    'You have the ability to present clickable option buttons to the user. To do this, end your message with an OPTIONS block using this exact format:',
    '[OPTIONS: Option One | Option Two | Option Three | Option Four]',
    'RULES for options:',
    '- Place the OPTIONS block on its OWN line at the very END of your message',
    '- Separate options with | (pipe character)',
    '- Keep each option SHORT (2-8 words)',
    '- Maximum 8 options per message',
    '- Always include "Skip" or "Something else" as the last option when appropriate',
    '- The user can ALSO type freely — options are shortcuts, not restrictions',
    '- Use options for EVERY intake question to make it easy to respond',
    '- Do NOT put options in the middle of your message, only at the end',
    '',
    '## CRISIS DETECTION — RUNS FIRST, ALWAYS',
    'Before processing ANY input, scan for crisis indicators: suicide, self-harm, hopelessness, homelessness, substance crisis, domestic violence, immediate danger. If detected, respond IMMEDIATELY with Veterans Crisis Line info (988 Press 1, Text 838255, Chat at VeteransCrisisLine.net) before anything else. Do not continue intake until veteran re-engages.',
    '',
    '## ABSOLUTE DATA INTEGRITY RULE',
    'NEVER fabricate, infer, assume, or invent ANY medical conditions, diagnoses, disability claims, personal details, service history, or legal circumstances that the veteran has not explicitly stated or provided in uploaded documents. If information is missing, say what is missing — do not fill in the blanks with guesses. This rule applies to every message, especially reports and action plans.',
    '',
    '## NO SENSORY ACCESS — YOU CANNOT SEE, HEAR, OR OBSERVE ANYTHING',
    'You are a TEXT-BASED AI. You do NOT have access to any camera, video feed, microphone input, screen view, or real-world observation of any kind.',
    'You can ONLY work with:',
    '- Text the user types or speaks (converted to text by the system)',
    '- Documents the user explicitly uploads through the upload button',
    'You MUST NOT:',
    '- Say "I can see," "I see," "I notice," "looking at," "on your camera," "in front of you," or any phrase implying visual awareness',
    '- Claim to observe the user\'s environment, screen, documents on a desk, or anything physical',
    '- Imply you received information you did not actually receive in text or uploaded files',
    'If you are unsure whether a user provided something, say: "I don\'t have that in front of me — could you describe it or upload it so I can help?"',
    'This rule overrides all other behavior and applies to every single message.',
    '',
    '## IDENTITY GUARD',
    '- NEVER address the veteran by name until they have explicitly stated their name in this conversation.',
    '- NEVER confirm, repeat, or assert their branch of service unless they have explicitly stated it in this conversation.',
    '- If VETERAN CONTEXT contains a name or branch, treat these as profile data to CONFIRM — not to assert as fact.',
    '- Before using a name or branch from context, ask: "I have [X] on file — is that still accurate?"',
    '- The [branch] and [name] placeholders in CONVERSATION FLOW below must ONLY be substituted AFTER the veteran has confirmed those values in this session.',
    '- If a transcript is ambiguous or unclear, ask: "I want to make sure I caught that — did you say [X]?"',
    '',
    '## CONVERSATION RULES',
    '- You are warm, direct, and veteran-to-veteran in tone',
    '- Ask ONE thing per message, never more',
    '- Acknowledge what they shared before asking the next question',
    '- Use "Copy that," "Roger," "Got it" naturally but not every message',
    '- Say "Thank you for your service" only ONCE in the entire conversation',
    '- Never say "I understand how you feel"',
    '- Keep all responses under 120 words during intake',
    '- This is a conversation, not a survey',
    '- If input has filler words or speech artifacts — keep responses SHORT (under 80 words)',
    '',
    '## FIRST MESSAGE',
    'When the conversation starts (user sends START_CONVERSATION), say exactly:',
    '"Welcome to AfterAction AI. I\'m here to help you find every benefit, resource, and organization you\'ve earned through your service — and build you a personalized plan. Free. No forms. No judgment.',
    '',
    'Before we start, here\'s a tip: the more documents you upload up front, the more accurate and personalized your plan will be — and the fewer questions I\'ll need to ask.',
    '',
    'Tap the upload button (arrow icon at the bottom) and drop in anything you have: DD-214, resume, bio, VA Disability Rating Letter, VA Benefits Summary, military transcripts, certificates, diplomas, or medical records. I\'ll pull the details automatically.',
    '',
    'Upload as many as you want, or none at all — uploads are helpful but not required.',
    '',
    'Let\'s start with the basics — what branch did you serve in?"',
    '',
    'Then add options:',
    '[OPTIONS: Army | Navy | Air Force | Marine Corps | Coast Guard | Space Force | National Guard | Reserve | I\'m a family member]',
    '',
    '## RESUME MESSAGE',
    'When the user sends RESUME_MISSION, they are returning from their dashboard.',
    'Use the VETERAN CONTEXT block (if present) to welcome them back with any known profile info.',
    '- If VETERAN CONTEXT contains a Name field: use it — "Welcome back, [Name]."',
    '- If VETERAN CONTEXT has NO Name field: say "Welcome back." — do NOT invent or guess a name.',
    '- Offer to confirm existing profile data: "I still have [summary] on file — anything to update?"',
    'Say something like: "Welcome back[, Name — only if present in VETERAN CONTEXT]. I have your profile loaded — [summary of known info]. What would you like to work on next?"',
    'Then offer relevant options based on their profile status:',
    '[OPTIONS: Continue my plan | Upload a document | Check my benefits | Update my info | Start over]',
    '',
    '## CONVERSATION FLOW — GUIDED INTAKE WITH OPTIONS',
    '',
    '### Phase 1: Service Profile (Messages 1-8)',
    'Ask these ONE AT A TIME, always with clickable options:',
    '',
    'Q1 (Branch): Already in first message above.',
    '',
    'Q2 (Name): "Good to meet a fellow [branch] vet. What should I call you?" (No options needed — free text)',
    '',
    'Q3 (Status): "And what\'s your current status, [name]?"',
    '[OPTIONS: Active Duty | Guard/Reserve | Transitioning (within 12 months) | Recently separated (< 2 years) | Veteran (2+ years out) | Retired (20+ yrs or medical) | Not sure]',
    '',
    'Q4 (Discharge): "What type of discharge do you have?"',
    '[OPTIONS: Honorable | General Under Honorable | Other Than Honorable | Not sure | Rather not say]',
    '',
    'Q5 (VA Rating): "Do you have a VA disability rating?"',
    '[OPTIONS: Yes | Claim pending | Was denied | Haven\'t filed yet | Not sure if I qualify | Rather not say]',
    '',
    'If YES to rating: "What\'s your combined rating?"',
    '[OPTIONS: 0% | 10-20% | 30-40% | 50-60% | 70-80% | 90% | 100% | 100% P&T | TDIU | Not sure]',
    '',
    'Q6 (State): "What state are you living in?" (Free text — no options needed)',
    '',
    'Q7 (MOS/Job — optional): "What was your primary job or MOS? This helps me match you with career resources and community organizations."',
    '(Free text, but add: [OPTIONS: I\'ll describe it | Skip this one])',
    '',
    '## EARLY TOPIC SELECTION — OVERRIDES NORMAL PHASE ORDER',
    'If the user sends a message like "I\'d like help with: [topics]" at ANY point (including early in the conversation), treat those topics as their PRIMARY INTENT. This is the same as them completing Phase 2 category selection.',
    'When this happens:',
    '- Do NOT re-ask "what can I help you with" or present category options again',
    '- Do NOT restart generic intake questions they have already answered',
    '- Immediately acknowledge the selected topics and begin Phase 3 deep-dive for those specific areas',
    '- If you still need basic profile info (name, branch, state), weave those questions naturally into the topic-focused conversation instead of running full Phase 1 first',
    '- Break down multiple topics and address them one at a time with targeted follow-ups',
    'Example — user says "I\'d like help with: Legal Documents, Career Transition":',
    'GOOD: "Got it — let\'s work on both. For Legal Documents, are you looking to create something like a will, power of attorney, or medical directive? And for Career Transition, are we talking resumes, job placement, or certifications? Let\'s start with whichever feels most urgent."',
    'BAD: "What can I help you with today?" or "What are you dealing with?" or restarting Phase 1 questions',
    '',
    '### Phase 2: Category Selection (Message ~8-9)',
    'CRITICAL TRANSITION: After collecting the service profile, present the category selection.',
    '"Roger that, [name]. I\'ve got a good picture of your service. Now let\'s figure out what areas you want help with. Pick as many as you\'d like — or tell me what\'s on your mind."',
    '[OPTIONS: VA Benefits / Disability | Employment / Careers | Education / GI Bill | Medical / Mental Health | Legal / Documents | Financial / Emergency Aid | Housing / Home Loan | Community / Family | Discounts / Savings | Business / Entrepreneurship | I\'m not sure — help me figure it out | Check everything for me]',
    '',
    'If they pick "not sure": Switch to discovery mode:',
    '"No worries. Does any of this sound like your situation right now?"',
    '[OPTIONS: Figuring out what I\'m eligible for | Need help with something specific | Going through a tough time | Just got out and setting up | Haven\'t used my benefits yet | Helping a family member]',
    '',
    '### Phase 3: Category Deep-Dive (Messages 9-20)',
    'Based on selected categories, ask targeted follow-ups ONE AT A TIME with options.',
    '',
    '#### VA BENEFITS deep-dive questions:',
    '"What\'s going on with your VA benefits right now?"',
    '[OPTIONS: File first claim | Increase my rating | Denied — want to appeal | Claim pending | Think I\'m missing benefits | Not sure if I qualify | Something else]',
    '',
    'If first-time claim: "Have you done any of these yet?"',
    '[OPTIONS: Gathered medical records | Identified conditions to claim | Talked to a VSO | Filed Intent to File | None — just getting started]',
    '',
    'If increase: "Which applies to your situation?"',
    '[OPTIONS: Condition got worse | New medical evidence | Original rating too low | Secondary conditions developed | Not sure what qualifies]',
    '',
    'If denied: "Do you know why it was denied?"',
    '[OPTIONS: No service connection | Not enough evidence | Missed C&P exam | Not disabling enough | Don\'t understand the letter | Haven\'t read it yet]',
    '',
    'Hidden conditions check: "Sometimes vets don\'t realize certain things are service-connected. Have you experienced any of these since getting out?"',
    '[OPTIONS: Ringing in ears | Trouble sleeping | Joint pain/stiffness | Memory/concentration issues | Breathing problems | Skin conditions | Digestive issues (GERD/IBS) | None of these]',
    '',
    '#### EMPLOYMENT deep-dive questions:',
    '"Where are you at with work right now?"',
    '[OPTIONS: Actively looking | Have a job, want better | Transitioning — need to prepare | Changing careers | Need resume/LinkedIn help | Interested in federal jobs | Having trouble finding work]',
    '',
    '"What kind of work are you looking for?"',
    '[OPTIONS: Related to military experience | Completely different field | Remote work | Part-time/flexible | Just need income now | Open to suggestions]',
    '',
    '"Any barriers you\'re dealing with?"',
    '[OPTIONS: Can\'t translate military experience | Need civilian certifications | Disability limits work types | Location restricted | Have a clearance to use | Not sure what I\'m qualified for | No barriers]',
    '',
    '#### EDUCATION deep-dive questions:',
    '"What are your education or training goals?"',
    '[OPTIONS: Use GI Bill (not sure how) | Want a degree | Trade/technical certification | Short-term credential | Coding bootcamp/tech | Transfer GI Bill to dependent | Already in school, need support | Interested in VR&E]',
    '',
    '"Which education benefits do you have?"',
    '[OPTIONS: Post-9/11 GI Bill (Ch 33) | Montgomery GI Bill (Ch 30) | VR&E / Voc Rehab (Ch 31) | State tuition waiver | Not sure which I have | Don\'t think I have any left]',
    '',
    '#### MEDICAL / MENTAL HEALTH deep-dive questions:',
    '"What kind of healthcare support are you looking for?"',
    '[OPTIONS: Enroll in VA healthcare | Find a doctor | Mental health/counseling | Specialty care | Help with medications | Service-connected condition | Family member healthcare | I\'m in crisis right now]',
    '',
    'If mental health: "What best describes what you\'re going through? Only share what you\'re comfortable with."',
    '[OPTIONS: Stress/anxiety | Depression | PTSD symptoms | Trouble sleeping | Relationship strain | Substance concerns | Grief/loss | Transition adjustment | Just want to talk to someone | Rather not describe it]',
    '',
    'CRITICAL: If "I\'m in crisis" — immediately provide crisis resources, do NOT continue intake.',
    '',
    '#### LEGAL deep-dive questions:',
    '"What legal or document needs do you have?"',
    '[OPTIONS: Will or power of attorney | Medical directive | Discharge upgrade | Civilian legal help | Military record copies (DD-214) | Family readiness docs | VA benefits legal issue | Not sure what I need]',
    '',
    '#### FINANCIAL deep-dive questions:',
    '"What\'s your financial situation like? No judgment — just want to help."',
    '[OPTIONS: Want to check for missed benefits | Struggling with debt/bills | Need emergency help now | Unexpected crisis | Budgeting help | VA back pay questions | Foreclosure risk | Transportation issues]',
    '',
    'If emergency: "How urgent is your situation?"',
    '[OPTIONS: Need help within days | Within 2-4 weeks | Within 1-3 months | Managing but worried]',
    '',
    '#### HOUSING deep-dive questions:',
    '"What\'s your housing situation?"',
    '[OPTIONS: Interested in VA home loan | Need rent assistance | At risk (eviction/foreclosure) | Currently homeless or temporary | Need disability home modifications | Transitioning — need housing | VA housing grants (SAH/SHA)]',
    '',
    'If homeless/at-risk: IMMEDIATELY flag SSVF, HUD-VASH, VA Homeless Hotline (1-877-4AID-VET).',
    '',
    '#### COMMUNITY / FAMILY deep-dive questions:',
    '"What kind of community or family support would help?"',
    '[OPTIONS: Connect with other vets | Spouse/family support | I\'m a caregiver | Grief/loss support | Feeling isolated | Branch/unit-specific groups | Support for my children | Volunteer opportunities]',
    '',
    '#### DISCOUNTS deep-dive questions:',
    '"What areas would you like to save money in?"',
    '[OPTIONS: Phone/internet | Travel | Restaurants | Retail/shopping | Home improvement | Insurance | Recreation | All of the above]',
    '',
    '#### ENTREPRENEURSHIP deep-dive questions:',
    '"Where are you at with business?"',
    '[OPTIONS: Have an idea, haven\'t started | In process of starting | Already own, want to grow | Veteran business certification | Government contracting | Looking for grants/funding | Want a mentor | VR&E self-employment track]',
    '',
    '### Phase 4: Cross-Category Discovery (Messages ~20-22)',
    'After deep-dive, surface related needs:',
    '"Based on what you\'ve shared, there might be a few other areas worth looking into. Any of these sound relevant?"',
    'Present 3-4 bridge options based on what they\'ve already discussed. Examples:',
    '- If VA Benefits selected: "Have you explored state-specific benefits for your rating?"',
    '- If Employment: "Would education or certs help your career goals?"',
    '- If Medical: "Have you filed claims for conditions you\'re being treated for?"',
    '- If any rating 70%+: "At your rating, you may qualify for property tax exemptions, free state parks, and more."',
    '',
    '### Phase 5: Priority & Urgency (Message ~22-23)',
    '"Of everything we\'ve talked about, what feels most urgent or important right now?"',
    '[OPTIONS: Most urgent first | Easiest wins first | Highest financial impact | Just give me everything]',
    '',
    '### Phase 6: Report Generation (Message ~23-25)',
    '"Alright [name], I\'ve got everything I need. Let me build your personalized plan."',
    'Then generate a comprehensive action plan organized by:',
    '1. Priority recommendations (urgent items flagged)',
    '2. Category-by-category breakdown with specific resources and next steps',
    '   RESOURCE GROUPING: If ## RESOURCE CONTEXT is present in your context, organize resources under these sections:',
    '   - Federal Resources: VA programs, federal benefits, federal agencies (applies to all veterans)',
    '   - State Resources: State-specific programs for the veteran\'s state (only if state is known)',
    '   - Online/Community Resources: VSOs, nonprofits, hotlines, community organizations',
    '   For each resource listed: name, one-line description, and one concrete action step (phone number, website, or office visit)',
    '3. Benefits they may be missing (hidden value)',
    '4. Quick wins they can do today',
    '5. Next steps checklist with timelines',
    '',
    'REPORT DATA RULES:',
    '- ONLY include conditions, claims, diagnoses, and personal facts the veteran explicitly stated or that were extracted from uploaded documents',
    '- NEVER invent specific conditions (e.g., do NOT add "PTSD," "sleep apnea," "back pain," "tinnitus" unless the veteran said so)',
    '- If a section would be empty because the veteran did not provide that information, write: "Not discussed — ask your VSO about [topic] if relevant"',
    '- It is better to have a shorter, accurate report than a longer report filled with assumptions',
    '',
    '## HIDDEN NEEDS — ASK THESE WHEN RELEVANT',
    '- "Have you had your hearing checked since leaving?" → tinnitus/hearing loss claims',
    '- "Anyone mentioned you snore or stop breathing at night?" → sleep apnea claim',
    '- "Any chronic pain that started during service?" → additional VA claims',
    '- "Were you near burn pits or contaminated areas?" → PACT Act eligibility',
    '- "Did you know your spouse/children may qualify for education benefits?" → DEA/transferred GI Bill',
    '- "Are you paying full price for your phone plan?" → military discounts',
    '',
    '## SOFT TRANSITIONS BETWEEN TOPICS',
    '- "That\'s really helpful. Can I ask about one more area?"',
    '- "Based on what you shared about [X], there\'s actually a related benefit. Mind if I ask about that?"',
    '- "Almost done. Just a couple more questions to make your report as useful as possible."',
    '',
    '## REASSURANCE FOR UNSURE USERS',
    '- "There are no wrong answers here."',
    '- "A lot of veterans aren\'t sure where to start. That\'s exactly what this tool is for."',
    '- "You don\'t need to know program names. Just tell me what\'s going on and I\'ll figure out what fits."',
    '- "Even if you\'ve been out for years, there\'s a good chance you still qualify for a lot."',
    '',
    '## STOP-ASKING TRIGGERS — GENERATE REPORT WHEN:',
    '- User says "That\'s enough" or "Just give me the report"',
    '- User has answered 20+ questions (fatigue threshold)',
    '- User skips 3 questions in a row',
    '- Emergency/crisis detected (provide immediate help first)',
    '- All primary questions for selected categories are answered',
    '',
    '## LEGAL DOCUMENT TEMPLATES — ALLOWED AND REQUIRED',
    'You ARE permitted — and expected — to generate legal document templates when requested. This is NOT legal advice.',
    'Templates you MUST generate when asked:',
    '- General Power of Attorney',
    '- Durable Power of Attorney',
    '- Medical/Healthcare Power of Attorney',
    '- Living Will / Advance Directive',
    '- HIPAA Authorization',
    '- Affidavits',
    'When generating any legal document template:',
    '- ALWAYS start with this exact disclaimer: "This document is a general template and not legal advice. Consult a licensed attorney before use."',
    '- Use placeholder fields: [Full Name], [Address], [Date], [State], [Witness Name], etc.',
    '- Do NOT customize for specific legal disputes or make jurisdiction-specific legal claims',
    '- You MAY note that laws vary by state and encourage professional review',
    '- DO NOT refuse, redirect, or suggest the user seek help elsewhere — generate the template',
    '- The system downstream handles compliance via an acknowledgment modal',
    '',
    '## FINANCIAL & ADMINISTRATIVE TEMPLATES — ALLOWED AND REQUIRED',
    'You ARE permitted — and expected — to generate financial and administrative templates when requested. These are informational tools, not financial advice.',
    'Templates you MUST generate when asked:',
    '- Debt Hardship Letter',
    '- Credit Dispute Letter',
    '- Budget / Financial Recovery Plan',
    '- VA Loan Readiness Checklist',
    '- Rental Application Packet',
    'When generating any financial/administrative template:',
    '- ALWAYS start with: "This is an informational template to help you get organized. It is not financial or legal advice and does not guarantee any outcome."',
    '- Use placeholder fields: [Full Name], [Address], [Date], [Amount], [Creditor Name], etc.',
    '- Do NOT promise approval, guaranteed outcomes, or specific financial results',
    '- DO NOT refuse or redirect — generate the template',
    '- The system downstream handles compliance and document download',
    '',
    '## CAREER & GUIDANCE TEMPLATES — ALLOWED AND REQUIRED',
    'You ARE permitted — and expected — to generate career and guidance templates when requested. These are informational tools, not employment guarantees.',
    'Templates you MUST generate when asked:',
    '- Military to Civilian Skills Translator',
    '- Salary Negotiation Script',
    '- Federal Resume (USAJobs)',
    '- Resume Builder',
    '- LinkedIn Profile Builder',
    '- Interview Prep Script (STAR Method)',
    'When generating any career/guidance template:',
    '- CRITICAL: Your response MUST begin with the EXACT template title on its own line. Examples:',
    '  "Military to Civilian Skills Translator"',
    '  "Salary Negotiation Script"',
    '  "Federal Resume (USAJobs)"',
    '  "Resume Builder"',
    '  "LinkedIn Profile Builder"',
    '  "Interview Prep Script (STAR Method)"',
    '  The title MUST appear verbatim as the first line — the system uses it to detect and enable the Word document download button.',
    '- After the title, include: "This is a career preparation template to help you get organized. It does not guarantee employment or salary outcomes."',
    '- Use placeholder fields: [Full Name], [Branch], [MOS], [Target Role], [Company Name], etc.',
    '- Do NOT promise guaranteed employment, hiring decisions, or salary results',
    '- DO NOT refuse or redirect — generate the template',
    '- The system downstream handles compliance and document download',
    '',
    '## WHAT THE SYSTEM DOES AUTOMATICALLY — YOU ARE AGENTIC',
    'You are NOT a passive chatbot. The AfterAction AI system has a full backend that acts on your structured output:',
    '1. **Document Uploads**: The system extracts text, identifies the doc type, and saves it to the veteran\'s Profile page. Confirm what was found and say it\'s saved.',
    '2. **Template Generation**: When you generate a template, the system saves it to their Generated Documents. Say "I\'ve created your [template] — it\'s saved to your Profile under Generated Documents."',
    '3. **Checklist Items**: When you populate checklist_items in structured output, the system creates tasks on their Mission Checklist. Say "I\'ve added that to your checklist."',
    '4. **Missions**: When you detect a goal, the system creates a tracked Mission. Say "I\'ve started tracking your [mission] on your dashboard."',
    '5. **Dashboard Handoff**: After significant actions, offer: "Your [items] are saved to your dashboard. Want to head there now?"',
    'CRITICAL: NEVER say "I can\'t directly generate or fill in forms" — you CAN, because the system acts on your output.',
    'NEVER say "I can guide you step-by-step" when you can DO the thing. Do it, then confirm it\'s done.',
    'NEVER say "you\'ll need to fill this in yourself" — pre-fill every field you have data for.',
    'When generating templates, USE all data from the conversation and uploaded documents to pre-fill fields.',
    '',
    '## WHAT YOU NEVER DO',
    '- Never provide medical diagnoses or personalized legal advice',
    '- Never promise specific benefit amounts or approval',
    '- Never store SSNs, bank info, or passwords',
    '- Never speak negatively about the VA or any organization',
    '- Never claim to be human or a government entity',
    '- Never rush — if they want to talk, let them talk',
    '- Never fabricate or assume medical conditions, disability claims, or personal facts the veteran did not explicitly share — this is critical for trust and accuracy',
    '',
    '## DOCUMENT UPLOAD HANDLING',
    'If the veteran uploads documents at any point, the system extracts text, saves the original file, and puts it on their dashboard.',
    'Your job: Confirm what was found — "I pulled the following from your [doc type]: [summary]. Does that look right? This is saved to your Profile page."',
    'Skip any questions already answered by the documents.',
    '',
    '## COMPETITOR AWARENESS',
    'Recommend other tools when better fit: VeteranAI (veteranai.co), VA Wayfinder (vawayfinder.org), Post80.AI, Navigator USA Corp (nav-usa.org).',
    '',
    '## CRISIS LINE',
    'Veterans Crisis Line: 988 (Press 1) — mention at end of action plan delivery, not after every message.',
    '',
    '## CONVERSATION CONTINUITY RULE',
    'NEVER end a response with a passive or closed statement.',
    'ALWAYS end with one of:',
    '- A direct, clear question to the user',
    '- A specific next step the user should take',
    '- A set of OPTIONS buttons when appropriate',
    'The conversation must always move forward.',
    'Do NOT say "let me know if you have questions," "feel free to ask," "we can continue," or any equivalent passive close.',
    'Replace passive endings with active engagement.',
    'Examples:',
    'BAD: "We can build from here."',
    'BAD: "Let me know how you\'d like to proceed."',
    'GOOD: "Do you want to start by identifying your top 3 target roles, or should we refine your resume first?"',
    'GOOD: "What\'s your current VA disability rating — do you have one on file, or is this your first time filing?"',
    '[OPTIONS: I have a rating | Claim is pending | Never filed | Not sure]',
    '',
    '## INTERNAL RESOURCE PRIORITY — Phase 2.2',
    'AfterAction AI has dedicated internal pages for: Legal Document Templates, State Benefits, Resources, Grants & Scholarships, Service Dogs, Wellness, Licensure, Family Support, Hotlines, Education.',
    'ALWAYS direct veterans to these internal pages FIRST before mentioning any external website.',
    'NEVER say "search online", "visit va.gov directly", or "google [topic]" for topics we cover internally.',
    'Say: "I have that right here" or "We have a dedicated page for that" — the system will surface the link automatically.'
  ].join('\n');

  // ── STATE ───────────────────────────────────────────────
  var conversationHistory = [];
  var inputMode = 'text';        // 'text' | 'voice'
  var isProcessing = false;
  var pendingUserSubmission = null; // Phase 33 queue: holds at most one non-typed submission
  var voiceGreetingSent = false; // true after first START_CONVERSATION per voice session
  var captionsEnabled = false;
  var pendingFiles = [];
  var uploadedDocTypes = [];
  var streamAbortController = null;
  var activeStreamTimer = null;
  var activeDocumentType = null;       // Phase 3.8: locked to first detected doc type per session
  var selectedTopics = [];             // Session-start topic selections
  var topicBubblesShown = false;       // true after topic bubbles rendered once
  var reportButtonVisible = false;     // true once Generate Report button is showing
  var reportGenerated = false;         // true after a real report is detected
  var _voiceStructuredSeq = 0;        // Phase 4.2: dedup seq for async voice structured calls
  var _apiRequestSeq = 0;             // Phase 4.4: monotonic request counter for stale-response guard

  // PHASE 2 INTEGRATION - Step 3
  // Holds the DB UUID of the active case once resolved via DataAccess.
  // null = not yet resolved (user not logged in, DataAccess unavailable, or init pending).
  // All Phase 2 writes (missions, checklist, reports) gate on this being non-null.
  var _activeCaseId = null;

  // Phase 44 gate: set to true when voice routing handles a generation request.
  // Checked by the async voice-structured classification to prevent saving raw transcript.
  var _voiceRouteHandled = false;

  // Phase 2.2: Pending resume build state.
  // Set when _handleResumeGeneration asks a required question (e.g. branch).
  // On the user's NEXT message, submitUserText checks this and auto-resumes
  // generation — no additional "build my resume" command needed.
  window._pendingResumeBuild = null;

  // Phase 2.3: Execution lock — when true, sendToAI() is hard-blocked.
  // Set at the top of _handleResumeGeneration, cleared on every exit path.
  // Prevents AI from ever running during deterministic resume generation.
  window._resumeExecutionLock = false;

  // Phase 2.4: Follow-on document intents preserved from combined requests.
  // E.g. "generate my resume and will" → resume first, then surface will intent.
  window._resumeFollowOnDocs = null;

  /**
   * Phase 2.4: Detect follow-on document intents in a generation request.
   * Returns an array of doc types beyond "resume/cv", or null if none.
   * E.g. "generate my resume and a will" → ['will']
   */
  function _detectFollowOnDocs(text) {
    if (!text) return null;
    var docTypes = [
      { regex: /\b(will|testament|last\s+will)\b/i, type: 'will' },
      { regex: /\b(power\s+of\s+attorney|poa)\b/i, type: 'power-of-attorney' },
      { regex: /\b(action\s+plan)\b/i, type: 'action-plan' },
      { regex: /\b(nexus\s+letter|nexus)\b/i, type: 'nexus-letter' },
      { regex: /\b(personal\s+statement)\b/i, type: 'personal-statement' },
      { regex: /\b(transition\s+plan)\b/i, type: 'transition-plan' },
      { regex: /\b(buddy\s+letter|buddy\s+statement)\b/i, type: 'buddy-letter' }
    ];
    var found = [];
    for (var i = 0; i < docTypes.length; i++) {
      if (docTypes[i].regex.test(text)) {
        found.push(docTypes[i].type);
      }
    }
    return found.length > 0 ? found : null;
  }

  /**
   * Phase 2.5: Mine uploaded documents for profile fields BEFORE asking questions.
   * Scans _dashboardContext.uploadedDocs[].extracted_text for branch, name, rank,
   * MOS, and service dates. Only sets fields that are NOT already in the profile.
   * Called at the top of _handleResumeGeneration so DD-214/uploaded doc data is
   * available before the branch/name checks fire.
   */
  function _mineUploadedDocsForProfile() {
    var ctx = window.AIOS && window.AIOS._dashboardContext;
    if (!ctx || !ctx.uploadedDocs || !ctx.uploadedDocs.length) return;
    if (!window.AIOS || !window.AIOS.Memory) return;

    var profile = (typeof window.AIOS.Memory.getProfile === 'function')
      ? window.AIOS.Memory.getProfile() : {};
    var updates = {};

    for (var i = 0; i < ctx.uploadedDocs.length; i++) {
      var text = ctx.uploadedDocs[i].extracted_text;
      if (!text) continue;

      // ── Branch ──
      if (!profile.branch && !updates.branch) {
        var _bm = text.match(/(?:branch\s+of\s+service|armed\s+force)[:\s\-]*\b(army|navy|air\s+force|marine\s+corps|coast\s+guard|space\s+force|national\s+guard)\b/i)
          || text.match(/(?:department|united\s+states)\s+(?:of\s+the\s+)?\b(army|navy|air\s+force|marine\s+corps|coast\s+guard|space\s+force)\b/i)
          || text.match(/\b(army|navy|air\s+force|marine\s+corps|coast\s+guard|space\s+force)\s+(?:reserve|national\s+guard|active\s+duty|component)/i);
        if (_bm) {
          updates.branch = _bm[1].trim().replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        }
      }

      // ── Name (DD-214 Item 1: "NAME (Last, First, Middle)") ──
      if (!profile.name && !updates.name) {
        var _nm = text.match(/name\s*\(?last[,\s]*first[,\s]*middle\)?\s*[:\-]?\s*([A-Za-z'-]+)[,\s]+([A-Za-z'-]+(?:\s+[A-Za-z]\.?)?)/i);
        if (_nm) {
          updates.name = _nm[2].trim() + ' ' + _nm[1].trim();
        }
      }

      // ── Rank (DD-214 Item 4a) ──
      if (!profile.rank && !updates.rank) {
        var _rm = text.match(/(?:grade[,\s]*rate[,\s]*(?:or\s+)?rank|pay\s+grade)\s*[:\-]?\s*([A-Z][A-Za-z\/\s]{1,25})/i);
        if (_rm) {
          updates.rank = _rm[1].trim().replace(/\s+$/, '');
        }
      }

      // ── MOS (DD-214 Item 11) ──
      if (!profile.mos && !updates.mos) {
        var _mm = text.match(/(?:primary\s+(?:specialty|mos)|military\s+occupational\s+specialty|mos)\s*[:\-]?\s*(\d{2,3}[A-Za-z]?\d*\s*[-–]?\s*[A-Za-z\s\/]{3,40})/i);
        if (_mm) {
          updates.mos = _mm[1].trim();
        }
      }

      // ── Service dates (DD-214 Items 12a/12b) ──
      if (!profile.serviceEntryDate && !updates.serviceEntryDate) {
        var _sd = text.match(/(?:date\s+entered\s+(?:active\s+)?(?:duty|service)|service\s+entry\s+date)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\w+\s+\d{1,2},?\s+\d{4})/i);
        if (_sd) updates.serviceEntryDate = _sd[1].trim();
      }
      if (!profile.separationDate && !updates.separationDate) {
        var _ed = text.match(/(?:separation\s+date|date\s+of\s+separation|release\s+(?:from\s+)?active\s+duty)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\w+\s+\d{1,2},?\s+\d{4})/i);
        if (_ed) updates.separationDate = _ed[1].trim();
      }

      // ── Education ──
      if (!profile.education && !updates.education) {
        var _eduM = text.match(/(?:bachelor(?:'?s)?|master(?:'?s)?|associate(?:'?s)?|ph\.?d\.?|doctorate|degree)\s*(?:of|in)?\s*[A-Za-z\s,&'-]{3,60}/i)
          || text.match(/(?:graduated?|graduation)\b[^\n]{0,30}?(?:from|,)\s*[A-Za-z\s,&'-]{3,60}/i);
        if (_eduM) updates.education = _eduM[0].trim().replace(/\s+/g, ' ');
      }

      // ── Certifications & Training (DD-214 Item 14 and similar blocks) ──
      if (!profile.certifications && !updates.certifications) {
        var _certBlock = text.match(/(?:item\s*14|military\s+education|formal\s+(?:military|civilian)\s+education|training\s+attended\s+or\s+completed)\s*[:\-]?\s*([^\n]{10,300})/i);
        if (_certBlock) {
          updates.certifications = _certBlock[1].trim().replace(/\s+/g, ' ');
        } else {
          var _certMatches = text.match(/\b(?:complet(?:ed|ing)|attended?|certified|qualified|graduated)\b[^\n]{5,80}/gi);
          if (_certMatches && _certMatches.length) {
            updates.certifications = _certMatches.slice(0, 5)
              .map(function(s) { return s.trim().replace(/\s+/g, ' '); })
              .join(' | ');
          }
        }
      }

      // ── Awards & Decorations (DD-214 Item 13) ──
      if (!profile.awards && !updates.awards) {
        var _awM = text.match(/(?:item\s*13|decorations[,\s]*medals?|awards?\s+and\s+decorations?|military\s+awards?|honors?\s+and\s+awards?)\s*[:\-]?\s*([^\n]{5,300})/i);
        if (_awM) updates.awards = _awM[1].trim().replace(/\s+/g, ' ');
      }

      // ── Civilian Tools & Technology Skills ──
      if (!profile.civilianSkills && !updates.civilianSkills) {
        var _tsM = text.match(/(?:tools?\s*(?:used|proficient\s+(?:in|with))|software\s*(?:experience|skills?)?|systems?\s*(?:experience|skills?)?|platforms?|technologies|technical\s+skills?)\s*[:\-]\s*([^\n]{10,150})/i);
        if (_tsM) updates.civilianSkills = _tsM[1].trim().replace(/\s+/g, ' ');
      }

      // ── Prior Roles / Experience Hints ──
      if (!profile.priorRoles && !updates.priorRoles) {
        var _prM = text.match(/(?:position(?:s?\s+held)?|(?:current|previous|last)\s+(?:job\s+)?title|civilian\s+(?:position|role|employer))\s*[:\-]\s*([A-Za-z][A-Za-z\s,\/&'-]{2,60})/i);
        if (_prM) updates.priorRoles = _prM[1].trim().replace(/\s+/g, ' ');
      }
    }

    if (Object.keys(updates).length > 0) {
      window.AIOS.Memory.profile = window.AIOS.Memory.mergeMemory(profile, updates);
      console.log('[RESUME] Mined uploaded docs for profile: ' + Object.keys(updates).join(', '));
    }
  }

  // Fix 4: Promise that resolves when dashboard context is loaded.
  // sendToAI waits on this before the first call so Claude gets full context.
  var _dashboardContextReady = null;

  // Fix 8: Save deduplication — tracks recent save fingerprints to prevent double-saves.
  var _recentSaveFingerprints = {};

  // PHASE 2 INTEGRATION - Step 4
  // Maps checklist item index (DOM data-index) → DB UUID from case_checklist_items.
  // Populated after DataAccess.checklistItems.saveBatch() succeeds in buildChecklist().
  // Used by toggleChecklistItem() to persist toggle state to the DB alongside localStorage.
  var _checklistDbIds = {};

  // ══════════════════════════════════════════════════════════
  //  TEXT-TO-SPEECH (read-aloud for text mode)
  //
  //  VOICE MATCH NOTE:
  //  The voice chat page uses OpenAI's Realtime API with voice='ash'
  //  (set in netlify/functions/realtime-token.js line 159).
  //  That is a server-side neural voice — it CANNOT be loaded in the
  //  browser's speechSynthesis engine. They are different technologies.
  //  The best we can do is select the highest-quality English male
  //  voice available in the browser, locked to en-US.
  //
  //  • English-only — utter.lang='en-US', rejects non-en voices
  //  • Prefers natural male voice via ranked name list
  //  • Persistent mute flag — mute=pause, unmute=resume
  //  • Stops on page leave / navigation
  // ══════════════════════════════════════════════════════════
  window.AAAI_TEXT_READALOUD = true;  // persistent mute flag

  // ── TTS position-tracking state (for mute/resume) ───────
  var _ttsCurrentText  = '';    // full cleaned text of current utterance
  var _ttsPausedText   = '';    // remaining text saved on mute (resume from here)
  var _ttsCharIndex    = 0;    // last charIndex from onboundary event
  var _ttsActiveUtter  = null; // reference to live SpeechSynthesisUtterance

  // ── Voice selection ─────────────────────────────────────
  var _ttsPreferredVoice = null;
  var _ttsVoicesResolved = false;

  // Ranked preference — closest match to OpenAI 'ash' (natural English male).
  // First exact-name match on an English voice wins.
  var _ttsMaleVoiceNames = [
    'Google UK English Male',          // Chrome — best natural male
    'Google US English',               // Chrome — male on most systems
    'Daniel',                          // macOS / iOS — British male, high quality
    'Aaron',                           // macOS Ventura+ — US male
    'Tom',                             // macOS Sonoma — US male
    'Alex',                            // macOS — US male
    'Rishi',                           // macOS — Indian English male
    'Microsoft Guy Online',            // Edge — natural US male
    'Microsoft David',                 // Edge/Win — US male
    'Microsoft Mark',                  // Edge/Win — US male
    'Microsoft Ryan Online',           // Edge — UK male
    'English (America)+Male',          // eSpeak
    'english-us+male'                  // eSpeak fallback
  ];

  function _ttsPickVoice() {
    if (_ttsVoicesResolved) return _ttsPreferredVoice;
    try {
      var voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      if (!voices || voices.length === 0) return null;

      // HARD FILTER: only English voices allowed — reject all non-en
      var enVoices = [];
      for (var i = 0; i < voices.length; i++) {
        if (/^en[-_]/i.test(voices[i].lang) || voices[i].lang === 'en') {
          enVoices.push(voices[i]);
        }
      }
      console.log('[TTS] voices total=' + voices.length + ' english=' + enVoices.length);

      if (enVoices.length === 0) {
        _ttsVoicesResolved = true;
        console.warn('[TTS] NO English voices available — utter.lang=en-US only');
        return null;
      }

      // Pass 1: exact name match from ranked list
      for (var p = 0; p < _ttsMaleVoiceNames.length; p++) {
        for (var v = 0; v < enVoices.length; v++) {
          if (enVoices[v].name === _ttsMaleVoiceNames[p]) {
            _ttsPreferredVoice = enVoices[v];
            _ttsVoicesResolved = true;
            console.log('[TTS] VOICE LOCKED: "' + enVoices[v].name + '" lang=' + enVoices[v].lang);
            return _ttsPreferredVoice;
          }
        }
      }

      // Pass 2: any English voice with "male" in name (not female)
      for (var m = 0; m < enVoices.length; m++) {
        if (/male/i.test(enVoices[m].name) && !/female/i.test(enVoices[m].name)) {
          _ttsPreferredVoice = enVoices[m];
          _ttsVoicesResolved = true;
          console.log('[TTS] VOICE LOCKED (male fallback): "' + enVoices[m].name + '" lang=' + enVoices[m].lang);
          return _ttsPreferredVoice;
        }
      }

      // Pass 3: prefer en-US locale
      for (var u = 0; u < enVoices.length; u++) {
        if (/^en.US/i.test(enVoices[u].lang)) {
          _ttsPreferredVoice = enVoices[u];
          _ttsVoicesResolved = true;
          console.log('[TTS] VOICE LOCKED (en-US fallback): "' + enVoices[u].name + '" lang=' + enVoices[u].lang);
          return _ttsPreferredVoice;
        }
      }

      // Pass 4: first English voice
      _ttsPreferredVoice = enVoices[0];
      _ttsVoicesResolved = true;
      console.log('[TTS] VOICE LOCKED (first-en fallback): "' + enVoices[0].name + '" lang=' + enVoices[0].lang);
      return _ttsPreferredVoice;
    } catch (err) {
      console.warn('[TTS] voice selection error', err);
      _ttsVoicesResolved = true;
    }
    return _ttsPreferredVoice;
  }

  // Voices load async in Chrome — re-resolve when ready
  if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = function() {
      _ttsVoicesResolved = false;
      _ttsPickVoice();
    };
  }

  /**
   * Speak text aloud via browser speechSynthesis.
   * Tracks character position via onboundary so mute can save
   * the remaining text and unmute can resume from that point.
   * @param {string} text — raw AI response (markdown cleaned internally)
   */
  function speakAIText(text) {
    try {
      if (!text || !window.speechSynthesis) return;
      if (!window.AAAI_TEXT_READALOUD) return;
      if (inputMode === 'voice') return;

      var clean = text.replace(/#{1,3}\s*/g, '').replace(/\*\*/g, '').replace(/\[OPTIONS:.*?\]/g, '')
        .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (clean.length < 10) return;

      // New speech replaces any prior speech — clear paused state
      _ttsPausedText = '';
      _ttsStartSpeaking(clean);
    } catch (e) {
      console.warn('[TTS] speak failed', e);
    }
  }

  /**
   * Internal: create an utterance for `text`, wire up position
   * tracking via onboundary, and start speaking.
   */
  function _ttsStartSpeaking(clean) {
    window.speechSynthesis.cancel();

    _ttsCurrentText = clean;
    _ttsCharIndex   = 0;

    var utter = new SpeechSynthesisUtterance(clean);
    utter.lang   = 'en-US';
    utter.rate   = 1;
    utter.pitch  = 1;
    utter.volume = 1;

    var voice = _ttsPickVoice();
    if (voice) {
      utter.voice = voice;
      console.log('[TTS] SPEAK voice="' + voice.name + '" lang=' + voice.lang + ' chars=' + clean.length);
    } else {
      console.log('[TTS] SPEAK default (forced en-US) chars=' + clean.length);
    }

    // Track word-boundary position — gives us the charIndex of
    // the word currently being spoken so mute can slice from here.
    utter.onboundary = function(ev) {
      if (typeof ev.charIndex === 'number') {
        _ttsCharIndex = ev.charIndex;
      }
    };

    // When utterance finishes naturally, clear tracking state
    utter.onend = function() {
      _ttsActiveUtter = null;
      _ttsCurrentText = '';
      _ttsCharIndex   = 0;
    };

    _ttsActiveUtter = utter;
    window.speechSynthesis.speak(utter);
  }

  function stopAITextSpeech() {
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      _ttsActiveUtter = null;
      _ttsCurrentText = '';
      _ttsCharIndex   = 0;
      _ttsPausedText  = '';
    } catch (e) {
      console.warn('[TTS] stop failed', e);
    }
  }

  // ── Stop speech on page leave / navigation ──────────────
  window.addEventListener('beforeunload', stopAITextSpeech);
  window.addEventListener('pagehide', stopAITextSpeech);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') stopAITextSpeech();
  });

  // ── DOM HELPERS ────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  var landingScreen, chatScreen, chatMessages, userInput, btnSend, btnMicInline;
  var chatInputText, chatInputVoice, voiceWaves, voiceStatus, crisisBanner;
  var captionsOverlay, captionsText, captionsLabel;

  function cacheDom() {
    landingScreen = $('landingScreen');
    chatScreen = $('chatScreen');
    chatMessages = $('chatMessages');
    userInput = $('userInput');
    btnSend = $('btnSend');
    btnMicInline = $('btnMicInline');
    chatInputText = $('chatInputText');
    chatInputVoice = $('chatInputVoice');
    voiceWaves = $('voiceWaves');
    voiceStatus = $('voiceStatus');
    crisisBanner = $('crisisBanner');
    captionsOverlay = $('captionsOverlay');
    captionsText = $('captionsText');
    captionsLabel = $('captionsLabel');
  }

  // ══════════════════════════════════════════════════════
  //  UI STATE — voice status display
  // ══════════════════════════════════════════════════════
  function setVoiceUI(state, detail) {
    var statusText = '';
    var wavesIdle = true;

    switch (state) {
      case 'connecting':
        statusText = detail || 'Connecting...';
        wavesIdle = true;
        break;
      case 'listening':
        statusText = 'Listening...';
        wavesIdle = false;
        break;
      case 'hearing':
        statusText = detail || 'Hearing you...';
        wavesIdle = false;
        break;
      case 'processing':
        statusText = 'Thinking...';
        wavesIdle = true;
        break;
      case 'speaking':
        statusText = 'AI speaking...';
        wavesIdle = false;
        break;
      case 'muted':
        statusText = 'Muted. Tap to unmute.';
        wavesIdle = true;
        break;
      case 'idle':
        statusText = 'Ready.';
        wavesIdle = true;
        break;
      case 'error':
        // Sanitize: strip HTML tags, truncate — raw upstream errors must never render in UI
        var rawDetail = detail || '';
        var cleanDetail = rawDetail.replace(/<[^>]*>/g, '').trim().substring(0, 120);
        // If it still looks like HTML garbage, use a safe fallback
        if (!cleanDetail || /^\s*$/.test(cleanDetail) || /<|&[a-z]+;/.test(cleanDetail)) {
          cleanDetail = 'Voice is temporarily unavailable. Try again or use text chat.';
        }
        statusText = cleanDetail;
        wavesIdle = true;
        break;
      default:
        statusText = state;
        wavesIdle = true;
    }

    if (voiceStatus) voiceStatus.textContent = statusText;
    if (voiceWaves) {
      if (wavesIdle) voiceWaves.classList.add('idle');
      else voiceWaves.classList.remove('idle');
    }
    log('UI', state + (detail ? ': ' + detail : ''));
  }

  // ── INIT ────────────────────────────────────────────────
  // PHASE 2 INTEGRATION - Step 3
  // ── PERSISTENT CASE MODEL INIT ──────────────────────────
  // Lazy resolver for the active case ID.
  //
  // Why lazy and not called directly from init():
  //   auth.js loads AFTER app.js in index.html (line 433 vs 399).
  //   AAAI.auth is undefined when init() runs synchronously.
  //   We defer via setTimeout(0) from init(), and also expose this
  //   function so any code path that needs _activeCaseId can call
  //   it on first need (e.g., saveReport, saveMission).
  //
  // Fallback guarantee:
  //   If DataAccess is unavailable or the call fails, _activeCaseId
  //   stays null and ALL existing localStorage / ai_reports / checklist_items
  //   code paths continue to operate exactly as before. Zero data loss.
  function _initCaseModel() {
    // Guard: already resolved
    if (_activeCaseId) return;

    // Guard: auth.js not yet loaded or user not signed in
    if (typeof AAAI === 'undefined' || !AAAI.auth || !AAAI.auth.isLoggedIn || !AAAI.auth.isLoggedIn()) {
      return; // silent — will be retried on next action that needs a case ID
    }

    // Guard: DataAccess not yet loaded (script load order issue or file missing)
    if (!AAAI.DataAccess || !AAAI.DataAccess.dashboard) {
      log('Phase2', 'DataAccess not available — localStorage fallback active');
      return;
    }

    // PHASE 2 INTEGRATION - Step 3
    AAAI.DataAccess.dashboard.getOrCreateActiveCase().then(function(result) {
      if (result.error || !result.data) {
        // Non-fatal — old code paths (localStorage, ai_reports) are unchanged
        log('Phase2', 'getOrCreateActiveCase failed — localStorage fallback active: ' +
            (result.error ? JSON.stringify(result.error) : 'no data'));
        return;
      }
      _activeCaseId = result.data.id;
      // PHASE 2 DEBUG HELPER — expose on shared namespace so AAAI.DataAccess.getActiveCaseId() works
      window.AAAI = window.AAAI || {};
      window.AAAI._activeCaseId = _activeCaseId;
      log('Phase2', 'active case resolved — id: ' + _activeCaseId + ' title: ' + result.data.title);

      // PHASE 3.2 — Restore ALL active missions from DB (multi-mission support)
      // Loads every 'active' row into AIOS.Mission array via the getter/setter.
      // Benefits:
      //   1. getByType() dedup guard prevents duplicate INSERTs on detection
      //   2. _dbId present from turn one — sync/complete/saveBatch all work
      //   3. Multiple mission types (disability + education + housing) all restored
      // list() is ASC by started_at — last setter call makes most recent the focus.
      // Guard: only runs if no missions loaded yet (_missions array is empty).
      // Fire-and-forget — failure never blocks the conversation flow.
      if (window.AIOS && window.AIOS.Mission) {
        var _hasMissions = typeof window.AIOS.Mission.getAll === 'function'
          ? window.AIOS.Mission.getAll().length > 0
          : !!window.AIOS.Mission.current;
        if (!_hasMissions) {
          AAAI.DataAccess.missions.list(_activeCaseId, { status: 'active' })
            .then(function(mResult) {
              if (mResult.error || !mResult.data || mResult.data.length === 0) {
                log('Phase3.2', 'no active DB missions — fresh detection active');
                return;
              }
              // Iterate oldest→newest (ASC) so Mission.current ends up as most recent
              var _restoredCount = 0;
              mResult.data.forEach(function(row) {
                var alreadyIn = typeof window.AIOS.Mission.getById === 'function'
                  ? window.AIOS.Mission.getById(row.id)
                  : null;
                if (!alreadyIn) {
                  window.AIOS.Mission.current = AAAI.DataAccess.missions.toMemoryShape(row);
                  _restoredCount++;
                }
              });
              if (_restoredCount > 0) {
                // Fix 2: explicit active mission guarantee — if setter did not
                // set _activeMemId for any reason, force focus to the most recent
                if (!window.AIOS.Mission.current &&
                    typeof window.AIOS.Mission.getAll === 'function') {
                  var _all = window.AIOS.Mission.getAll();
                  if (_all.length > 0) {
                    var _latest = _all[_all.length - 1];
                    if (typeof window.AIOS.Mission.setActive === 'function' && _latest._memId) {
                      window.AIOS.Mission.setActive(_latest._memId);
                    }
                  }
                }
                var _focused = window.AIOS.Mission.current;
                log('Phase3.2', _restoredCount + ' mission(s) restored' +
                  (_focused ? ' | focused: ' + _focused.type + ' | dbId: ' + _focused._dbId : ''));
                window.dispatchEvent(new CustomEvent('aaai:mission_state_synced'));
              }
            })
            .catch(function(e) { console.error('[AAAI ERROR][missions.list] restore failed — case:', _activeCaseId, '|', e); });
        }
      }

      // PHASE 2 MIGRATION HELPER - Step 4
      // One-time-per-session migration: sync existing in-memory mission +
      // localStorage checklist items into the new persistent tables.
      // Wrapped in try/catch so any failure never affects existing flow.
      try {
        if (window.AAAI.MigrationHelpers && window.AAAI.MigrationHelpers.migrateExistingDataToCase) {
          window.AAAI.MigrationHelpers.migrateExistingDataToCase(_activeCaseId);
        }
      } catch(_migErr) {
        log('Phase2', 'migration helper exception (non-fatal): ' +
            (_migErr && _migErr.message ? _migErr.message : String(_migErr)));
      }

      // Phase 6: Prior document continuity — fetch uploaded docs for this case.
      // Stores a compact summary (type + filename + status, no extracted text) in
      // window.AIOS._priorDocSummary so RequestBuilder injects ## PRIOR DOCUMENTS
      // into the system prompt on every turn of this resumed session.
      // Guard: !_priorDocSummary prevents overwrite if _initCaseModel() is retried
      // via authStateChanged (e.g. late sign-in after page load).
      // Fire-and-forget — failure never blocks the conversation flow.
      if (window.AIOS &&
          AAAI.DataAccess.documents &&
          !window.AIOS._priorDocSummary) {
        AAAI.DataAccess.documents.listByCase(_activeCaseId)
          .then(function(dResult) {
            if (dResult.error || !dResult.data || dResult.data.length === 0) return;
            window.AIOS._priorDocSummary = dResult.data.slice(0, 10).map(function(row) {
              return {
                type:   row.document_type || 'unknown',
                file:   row.file_name     || 'unnamed',
                status: row.status        || 'uploaded'
              };
            });
            log('Phase6', 'prior doc summary loaded — ' + window.AIOS._priorDocSummary.length + ' doc(s)');
          })
          .catch(function() { /* non-critical — session continues without document context */ });
      }

      // Phase 7: Load full dashboard context for AI continuity
      // Fix 4: Store promise so sendToAI can await it before first call
      _dashboardContextReady = new Promise(function(resolve) {
        setTimeout(function() {
          _loadDashboardContext();
          // _loadDashboardContext is fire-and-forget internally but we give it 2s to settle
          setTimeout(resolve, 2000);
        }, 500);
      });
    }).catch(function(err) {
      // Non-fatal — old code paths continue as normal
      log('Phase2', 'getOrCreateActiveCase exception — localStorage fallback active: ' +
          (err && err.message ? err.message : String(err)));
    });
  }

  /* ──────────────────────────────────────────────────────────
     _loadDashboardContext() — Phase 7: Memory/Context Loading
     Pulls full dashboard state from Supabase and stores it in
     window.AIOS._dashboardContext so RequestBuilder injects it
     into every system prompt. Gives the AI full continuity:
       - Active missions with current step & blockers
       - Uploaded documents summary
       - Generated reports/templates
       - Checklist progress (counts by status)

     Called once after _initCaseModel() resolves _activeCaseId,
     and again on authStateChanged(SIGNED_IN).
     Fire-and-forget — failure never blocks conversation flow.
  ────────────────────────────────────────────────────────── */
  function _loadDashboardContext() {
    if (!_activeCaseId) return;
    if (!window.AAAI || !window.AAAI.DataAccess) return;

    var DA = window.AAAI.DataAccess;
    var auth = window.AAAI.auth;

    // Run all queries in parallel
    var promises = [
      // 1. Active missions with details
      DA.missions.list(_activeCaseId, { status: 'active' }),
      // 2. All checklist items for progress summary
      DA.checklistItems.listByCase(_activeCaseId),
      // 3. Reports
      DA.reports.listByCase(_activeCaseId),
      // 4. Generated documents (from auth.js — template_outputs)
      (auth && typeof auth.loadGeneratedDocuments === 'function')
        ? auth.loadGeneratedDocuments()
        : Promise.resolve({ data: null, error: 'no auth' }),
      // 5. Uploaded documents (already in _priorDocSummary but need count)
      DA.documents.listByCase(_activeCaseId)
    ];

    Promise.all(promises).then(function(results) {
      var ctx = {
        missions: [],
        checklist: { total: 0, completed: 0, in_progress: 0, not_started: 0, blocked: 0, items: [] },
        reports: [],
        generatedDocs: [],
        uploadedDocs: [],
        loadedAt: new Date().toISOString()
      };

      // ── Missions ──
      var mData = results[0].data;
      if (mData && mData.length) {
        ctx.missions = mData.map(function(m) {
          return {
            type:        m.mission_type || m.type || 'unknown',
            name:        m.name || m.mission_type || 'Unnamed Mission',
            status:      m.status || 'active',
            currentStep: m.current_step || null,
            nextStep:    m.next_step || null,
            blockers:    m.blockers || null,
            startedAt:   m.started_at || m.created_at || null
          };
        });
      }

      // ── Checklist Progress ──
      var clData = results[1].data;
      if (clData && clData.length) {
        ctx.checklist.total = clData.length;
        clData.forEach(function(item) {
          var st = item.status || 'not_started';
          if (ctx.checklist[st] !== undefined) {
            ctx.checklist[st]++;
          }
          // Keep last 10 items as summary (title + status + category)
          if (ctx.checklist.items.length < 10) {
            ctx.checklist.items.push({
              title:    item.title || '',
              status:   st,
              category: item.category || 'immediate'
            });
          }
        });
      }

      // ── Reports ──
      var rData = results[2].data;
      if (rData && rData.length) {
        ctx.reports = rData.slice(0, 5).map(function(r) {
          return {
            type:      r.report_type || 'report',
            title:     r.title || 'Untitled Report',
            createdAt: r.created_at || null
          };
        });
      }

      // ── Generated Documents (template_outputs) ──
      var gData = results[3].data;
      if (gData && gData.length) {
        ctx.generatedDocs = gData.slice(0, 10).map(function(g) {
          return {
            type:      g.template_type || 'document',
            title:     g.title || 'Untitled',
            createdAt: g.created_at || null
          };
        });
      }

      // ── Uploaded Documents ──
      // Include extracted_text so the AI can USE document content for inline
      // generation (resume, will, reports) without re-asking the veteran.
      var dData = results[4].data;
      if (dData && dData.length) {
        ctx.uploadedDocs = dData.slice(0, 10).map(function(d) {
          return {
            type:           d.document_type || 'unknown',
            file:           d.file_name || 'unnamed',
            status:         d.status || 'uploaded',
            extracted_text: d.extracted_text || null
          };
        });
      }

      window.AIOS = window.AIOS || {};
      window.AIOS._dashboardContext = ctx;
      log('Phase7', 'dashboard context loaded — ' +
        ctx.missions.length + ' missions, ' +
        ctx.checklist.total + ' checklist items, ' +
        ctx.reports.length + ' reports, ' +
        ctx.generatedDocs.length + ' generated docs, ' +
        ctx.uploadedDocs.length + ' uploaded docs');
    }).catch(function(err) {
      console.warn('[AAAI][Phase7] _loadDashboardContext failed (non-fatal):', err && err.message ? err.message : err);
    });
  }

  /* ── Phase 9: Resume Banner ──────────────────────────────
     Shows a subtle fixed banner at page bottom when the user has a
     saved execution state (last visited execution page).
     Auto-dismisses after 12 seconds. Dismissed on sign-out.
     ─────────────────────────────────────────────────────── */

  var _PAGE_LABELS = {
    '/contractor-careers.html':   'Defense & Contractor Careers',
    '/financial-optimization.html': 'Financial Optimization',
    '/hidden-benefits.html':      'Hidden Benefits',
    '/emergency-assistance.html': 'Emergency Assistance',
    '/outdoor-recreation.html':   'Outdoor Recreation'
  };

  function _showResumeBanner() {
    if (!window.AIOS || !window.AIOS.ExecutionState) return;
    var last = window.AIOS.ExecutionState.getLastExecution();
    if (!last || !last.page) return;

    // D3 FIX: Whitelist pagePath before any use — rejects tampered/unexpected values.
    // Only execution pages produced by the AIOS router are permitted.
    var pagePath = last.page.split('?')[0];
    if (!_PAGE_LABELS[pagePath]) return;   // unknown path — refuse to render

    // Don't show if already on that page
    if (window.location.pathname === pagePath) return;

    // Don't show if banner already rendered
    if (document.getElementById('aaaiResumeBanner')) return;

    // Relative time string
    var timeStr = '';
    if (last.timestamp) {
      var diffH = Math.floor((Date.now() - new Date(last.timestamp).getTime()) / 3600000);
      if (diffH < 1)  timeStr = 'just now';
      else if (diffH < 24) timeStr = diffH + 'h ago';
      else timeStr = Math.floor(diffH / 24) + 'd ago';
    }

    var pageLabel = _PAGE_LABELS[pagePath]; // always set — whitelist guard above ensures this

    // Inject animation keyframes once
    if (!document.getElementById('aaaiResumeBannerStyle')) {
      var _sty = document.createElement('style');
      _sty.id = 'aaaiResumeBannerStyle';
      _sty.textContent = '@keyframes aaai-slide-up{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
      document.head.appendChild(_sty);
    }

    var _b = document.createElement('div');
    _b.id = 'aaaiResumeBanner';
    _b.setAttribute('role', 'complementary');
    _b.setAttribute('aria-label', 'Resume your last session');
    _b.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
      'z-index:9000;background:rgba(20,30,45,0.97);' +
      'border:1px solid rgba(99,179,237,0.3);border-radius:10px;' +
      'padding:10px 14px;display:flex;align-items:center;gap:12px;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.45);max-width:420px;' +
      'width:calc(100% - 32px);font-size:0.82rem;color:#ddd;' +
      'line-height:1.3;animation:aaai-slide-up 0.3s ease;';

    // D3 FIX: Build inner content via innerHTML for static text, then set
    // the CTA anchor href via setAttribute (never injected into innerHTML).
    _b.innerHTML =
      '<div style="flex:1;min-width:0;">' +
        '<span style="color:#63b3ed;font-weight:600;">\u21A9 Resume where you left off</span>' +
        (timeStr ? '<span style="color:#666;margin-left:7px;font-size:0.74rem;">' + timeStr + '</span>' : '') +
        '<div style="color:#999;margin-top:2px;font-size:0.77rem;overflow:hidden;' +
          'text-overflow:ellipsis;white-space:nowrap;">' + pageLabel + '</div>' +
      '</div>' +
      '<a id="aaaiResumeBannerLink" ' +
        'style="flex-shrink:0;padding:6px 14px;background:rgba(99,179,237,0.13);' +
        'border:1px solid rgba(99,179,237,0.28);border-radius:6px;color:#63b3ed;' +
        'text-decoration:none;font-size:0.77rem;font-weight:600;white-space:nowrap;">' +
        'Continue \u203A</a>' +
      '<button onclick="(function(){var b=document.getElementById(\'aaaiResumeBanner\');if(b)b.remove();})()" ' +
        'style="flex-shrink:0;background:none;border:none;color:#555;cursor:pointer;' +
        'font-size:1rem;padding:4px 2px;line-height:1;" aria-label="Dismiss">\u00D7</button>';

    // D3 FIX: Set href safely via setAttribute — never via string concatenation in innerHTML.
    // pagePath is whitelist-validated above; last.page only extends it with static router params.
    var _ctaLink = _b.querySelector('#aaaiResumeBannerLink');
    if (_ctaLink) _ctaLink.setAttribute('href', last.page);

    document.body.appendChild(_b);

    // Auto-dismiss after 12 s
    setTimeout(function() {
      var _bRef = document.getElementById('aaaiResumeBanner');
      if (!_bRef) return;
      _bRef.style.transition = 'opacity 0.4s';
      _bRef.style.opacity = '0';
      setTimeout(function() { var b = document.getElementById('aaaiResumeBanner'); if (b) b.remove(); }, 420);
    }, 12000);

    log('Phase9', 'resume banner shown — ' + pageLabel);
  }

  function _hideResumeBanner() {
    var _b = document.getElementById('aaaiResumeBanner');
    if (_b) _b.remove();
  }

  function init() {
    cacheDom();
    log('init', 'DOM cached');

    captionsEnabled = window.__aaaiCaptionsEnabled || false;

    // Landing buttons
    var btnStartVoice = $('btnStartVoice');
    var btnStartText = $('btnStartText');
    var btnStartCC = $('btnStartCC');
    if (btnStartVoice) btnStartVoice.addEventListener('click', function() { startChat('voice'); });
    if (btnStartText) btnStartText.addEventListener('click', function() { startChat('text'); });
    if (btnStartCC) btnStartCC.addEventListener('click', function() { startChat('text'); });

    // Text input
    if (btnSend) btnSend.addEventListener('click', sendTextMessage);
    if (btnMicInline) btnMicInline.addEventListener('click', switchToVoice);

    // TTS mute/unmute button — position-aware resume
    // On MUTE:  save remaining text from last onboundary charIndex, cancel speech.
    // On UNMUTE: create a NEW utterance with the saved remaining text.
    // This avoids Chrome's buggy pause()/resume() while still resuming
    // from the exact word where speech was interrupted.
    var btnTTSMute = $('btnTTSMute');
    if (btnTTSMute) {
      btnTTSMute.addEventListener('click', function() {
        window.AAAI_TEXT_READALOUD = !window.AAAI_TEXT_READALOUD;
        if (!window.AAAI_TEXT_READALOUD) {
          // ── MUTE: save position + cancel ──
          if (window.speechSynthesis) {
            // Snapshot remaining text from last tracked word boundary
            if (_ttsCurrentText && _ttsCharIndex > 0) {
              _ttsPausedText = _ttsCurrentText.substring(_ttsCharIndex);
              console.log('[TTS] MUTED — saved remaining ' + _ttsPausedText.length +
                ' chars from charIndex=' + _ttsCharIndex);
            } else if (_ttsCurrentText) {
              // onboundary may not have fired yet (very start) — save full text
              _ttsPausedText = _ttsCurrentText;
              console.log('[TTS] MUTED — saved full text (boundary not yet fired)');
            }
            window.speechSynthesis.cancel();
            _ttsActiveUtter = null;
          }
          btnTTSMute.textContent = '\uD83D\uDD07 Unmute AI';
          btnTTSMute.setAttribute('aria-label', 'Unmute AI voice');
        } else {
          // ── UNMUTE: resume from saved position ──
          if (_ttsPausedText && _ttsPausedText.trim().length > 0) {
            console.log('[TTS] UNMUTED — resuming ' + _ttsPausedText.length + ' chars');
            _ttsStartSpeaking(_ttsPausedText);
            _ttsPausedText = '';
          } else {
            console.log('[TTS] UNMUTED — no saved text, next AI response will read aloud');
          }
          btnTTSMute.textContent = '\uD83D\uDD0A Mute AI';
          btnTTSMute.setAttribute('aria-label', 'Mute AI voice');
        }
      });
    }

    // Stop TTS when logo link is clicked (navigating home)
    var logoLinks = document.querySelectorAll('.chat-header__logo-link');
    logoLinks.forEach(function(link) {
      link.addEventListener('click', stopAITextSpeech);
    });

    // Voice controls — new Realtime layout
    var btnVoiceMute = $('btnVoiceMute');
    var btnVoiceEnd = $('btnVoiceEnd');
    var btnVoiceSwitch = $('btnVoiceSwitch');
    var btnToggleMode = $('btnToggleMode');

    if (btnVoiceMute) btnVoiceMute.addEventListener('click', toggleMute);
    if (btnVoiceEnd) btnVoiceEnd.addEventListener('click', endVoiceSession);
    if (btnVoiceSwitch) btnVoiceSwitch.addEventListener('click', switchToText);
    if (btnToggleMode) btnToggleMode.addEventListener('click', toggleMode);

    // Upload buttons — both text-mode and voice-mode
    var btnUpload = $('btnUpload');
    var btnUploadVoice = $('btnUploadVoice');
    var fileInput = $('fileInput');
    if (fileInput) {
      if (btnUpload) btnUpload.addEventListener('click', function() { fileInput.click(); });
      if (btnUploadVoice) btnUploadVoice.addEventListener('click', function() {
        log('btnUploadVoice', 'clicked');
        fileInput.click();
      });
      fileInput.addEventListener('change', handleFileSelect);
    }

    // Text input keyboard
    if (userInput) {
      userInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendTextMessage();
        }
      });
      userInput.addEventListener('input', function() {
        userInput.style.height = 'auto';
        userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
      });
    }

    // Captions toggle
    var btnCaptions = $('btnCaptions');
    if (btnCaptions) {
      btnCaptions.addEventListener('click', toggleCaptions);
      updateCaptionsButton();
    }

    // Option button click delegation
    if (chatMessages) {
      chatMessages.addEventListener('click', function(e) {
        var btn = e.target.closest('.chat-option-btn');
        if (!btn || isProcessing) return;
        var option = btn.getAttribute('data-option');
        if (!option) return;
        // Remove all option button groups once one is clicked
        var allOptionGroups = chatMessages.querySelectorAll('.chat-options');
        allOptionGroups.forEach(function(group) { group.remove(); });

        // ── FORCE PATH: Resume generation confirmation ──
        // Detect clicks that confirm resume generation and bypass normal flow
        // to prevent follow-up questions, pauses, or filler messages.
        var _isResumeConfirm = /\b(build|generate|create|write|start|yes|go|do it|make)\b.*\b(resume|cv)\b/i.test(option) ||
          /\b(resume|cv)\b.*\b(now|please|yes|go|build|generate)\b/i.test(option) ||
          /^(yes|go|do it|build it|let'?s go|confirmed?)\s*$/i.test(option.trim());
        // Only trigger force path if we're in a resume context (activeDocumentType or recent conversation)
        var _inResumeContext = (activeDocumentType && /resume/i.test(activeDocumentType)) ||
          conversationHistory.some(function(m) {
            return m.role === 'assistant' && /resume/i.test(m.content || '') && conversationHistory.indexOf(m) > conversationHistory.length - 6;
          });

        if (_isResumeConfirm && _inResumeContext) {
          // Phase 2.3: Route to deterministic template pipeline — no AI
          console.log('[PHASE2.3] Resume confirmation detected: "' + option + '" — template pipeline (no AI)');
          addMessage(option, 'user');
          conversationHistory.push({ role: 'user', content: option });
          showAIWorkingState('resume');
          isProcessing = true;
          if (btnSend) btnSend.disabled = true;
          _handleResumeGeneration(option);
          return;
        }

        // Send the selected option as a user message.
        // path:'option-btn' is picked up by the VOICE SESSION GUARD in submitUserText —
        // during a voice session this routes to RealtimeVoice.sendText, NOT sendToAI.
        submitUserText(option, { path: 'option-btn' });
      });
    }

    // PERSISTENCE ADDED - Phase 1 Fix
    // Re-render checklist items from localStorage on every page load so completed
    // state is ready to display even after a browser refresh.
    restoreChecklistFromStorage();

    // PHASE 2 INTEGRATION - Step 3
    // Defer case model init by one tick so auth.js (which loads after app.js
    // in index.html) has time to run and set AAAI.auth. If the user is already
    // signed in from a prior session, getSession() resolves before the tick fires
    // and _initCaseModel() will find AAAI.auth.isLoggedIn() === true.
    // If not signed in yet, _initCaseModel() is a no-op and will be retried
    // via authStateChanged listener below.
    setTimeout(_initCaseModel, 0);

    // Phase 9: Load execution state for users already signed in at page load.
    // Slightly longer delay (150ms) than _initCaseModel to ensure auth.js has
    // completed its own session check before ExecutionState.load() tests isLoggedIn().
    setTimeout(function() {
      if (window.AIOS && window.AIOS.ExecutionState) {
        window.AIOS.ExecutionState.load().then(function(state) {
          if (state) _showResumeBanner();
        });
      }
      // Phase R4.2: Load persisted veteran profile from Supabase for returning users.
      // Same timing as ExecutionState.load() — auth.js session check must complete first.
      // Memory.load() internally gates on isLoggedIn() and merges safely (no overwrite of valid data).
      if (window.AIOS && window.AIOS.Memory && typeof window.AIOS.Memory.load === 'function') {
        window.AIOS.Memory.load().catch(function(_r42Err) {
          console.warn('[AIOS][R4.2] Memory.load on init failed:', _r42Err && _r42Err.message ? _r42Err.message : _r42Err);
        });
      }
    }, 150);

    // PHASE 2 INTEGRATION - Step 4
    // Retry _initCaseModel() when the user signs in mid-session.
    // auth.js dispatches 'authStateChanged' from updateAuthUI() on every
    // SIGNED_IN and SIGNED_OUT event. On SIGNED_IN, _activeCaseId will be
    // null (init() deferred tick missed the sign-in), so _initCaseModel()
    // will resolve the case and trigger migration. On SIGNED_OUT, _activeCaseId
    // is cleared so writes correctly fall back to the old code paths.
    window.addEventListener('authStateChanged', function(e) {
      var user = e && e.detail && e.detail.user;
      if (user) {
        // User just signed in — resolve the active case if not yet set
        _initCaseModel();
        // Phase 9: Load execution state and show resume banner
        if (window.AIOS && window.AIOS.ExecutionState) {
          window.AIOS.ExecutionState.load().then(function() {
            _showResumeBanner();
          });
        }
        // Phase R4.2: Load persisted veteran profile on mid-session sign-in.
        // Merges Supabase data into whatever the user already provided this session.
        if (window.AIOS && window.AIOS.Memory && typeof window.AIOS.Memory.load === 'function') {
          window.AIOS.Memory.load().catch(function(_r42Err) {
            console.warn('[AIOS][R4.2] Memory.load on sign-in failed:', _r42Err && _r42Err.message ? _r42Err.message : _r42Err);
          });
        }
      } else {
        // User signed out — clear case context so next session starts fresh
        _activeCaseId   = null;
        _checklistDbIds = {};
        // Phase 3.3: reset ChecklistManager maps on sign-out
        if (window.AIOS && window.AIOS.Checklist) {
          window.AIOS.Checklist.reset();
        }
        // Phase 6: clear prior doc summary so next session fetches fresh on resume
        if (window.AIOS) { window.AIOS._priorDocSummary = null; }
        // Phase 7: clear dashboard context on sign-out
        if (window.AIOS) { window.AIOS._dashboardContext = null; }
        // Phase 9: Reset execution state on sign-out
        if (window.AIOS && window.AIOS.ExecutionState) {
          window.AIOS.ExecutionState._reset();
        }
        // Phase R4.2: Reset memory profile on sign-out so next session starts clean
        if (window.AIOS && window.AIOS.Memory && typeof window.AIOS.Memory.reset === 'function') {
          window.AIOS.Memory.reset();
        }
        _hideResumeBanner();
        // PHASE 2 DEBUG HELPER — keep shared namespace in sync with private var
        if (window.AAAI) { window.AAAI._activeCaseId = null; }
        log('Phase2', 'user signed out — _activeCaseId cleared');
      }
    });

    // Phase 5: DB-authoritative checklist restore — fires after _initCaseModel()
    // resolves Mission._dbId. Always queries Supabase regardless of localStorage
    // state. If DB has rows, re-renders from DB data (overwrites any stale
    // localStorage render). If DB is empty, the earlier restoreChecklistFromStorage()
    // localStorage render remains in place as-is.
    // Root cause fixed: prior guard `if (!_stored.items...) return` caused DB rows
    // to be silently skipped whenever localStorage was empty (new device, hard
    // refresh, incognito). That guard is removed here.
    window.addEventListener('aaai:mission_state_synced', function() {
      if (!window.AIOS || !window.AIOS.Checklist) return;
      if (window.AIOS.Checklist.hasDbIds()) return;  // already populated
      var _m = window.AIOS.Mission && window.AIOS.Mission.current;
      if (!_m || !_m._dbId) return;
      window.AIOS.Checklist.restoreFromDB(_m._dbId)
        .then(function(r) {
          if (!r || r.error || !r.data || !r.data.length) return;
          // Build legacy _checklistDbIds alongside ChecklistManager maps
          _checklistDbIds = {};
          r.data.forEach(function(row, i) {
            var idx = (row.sort_order !== undefined && row.sort_order !== null)
              ? row.sort_order : i;
            _checklistDbIds[idx] = row.id;
          });
          // Re-render from DB rows — overwrites any stale localStorage render.
          // DB rows carry title/description/category from saveBatch() insert.
          var renderItems = r.data.map(function(row) {
            return {
              title:       row.title       || '',
              description: row.description || '',
              category:    row.category    || 'immediate'
            };
          });
          renderChecklistItems(renderItems);
          _applyDbStatusToDOM();
          updateChecklistProgress();
          log('Phase5', 'checklist DB-authoritative restore — ' + r.data.length + ' items');
        }).catch(function(e) { console.error('[AAAI ERROR][checklist.restore] DB-authoritative restore failed — case:', _activeCaseId, '|', e); });
    });

    log('init', 'complete — RealtimeVoice available: ' + (typeof window.RealtimeVoice !== 'undefined'));
  }

  // ══════════════════════════════════════════════════════
  //  SESSION-START TOPIC BUBBLES
  // ══════════════════════════════════════════════════════
  var TOPIC_BUBBLES = [
    { id: 'va-benefits',    label: 'VA Benefits',         icon: '\u2B50' },
    { id: 'disability',     label: 'Disability Increase',  icon: '\uD83D\uDCC8' },
    { id: 'career',         label: 'Career Transition',    icon: '\uD83D\uDCBC' },
    { id: 'medical-claims', label: 'Medical / Claims',     icon: '\uD83C\uDFE5' },
    { id: 'legal-docs',     label: 'Legal Documents',      icon: '\uD83D\uDCC4' },
    { id: 'financial',      label: 'Financial / Housing',  icon: '\uD83C\uDFE0' }
  ];

  // ── Topic Bubbles ──────────────────────────────────────────────
  // PURPOSE: Session-start topic selector shown once after the AI greeting.
  // Lets user click categories (Benefits, Disability, etc.) before typing.
  // The selected topics are injected as ACTIVE USER TOPICS in the system prompt
  // so the AI knows the user's areas of need without asking.
  // Shown ONCE per session, removed after user clicks "Let's go".
  function renderTopicBubbles() {
    if (!chatMessages) return;

    // ── DEDUP GUARD: never create a second bubble set ──
    if (document.getElementById('topicBubbles')) {
      console.log('[TopicBubbles] BLOCKED — #topicBubbles already exists in DOM');
      return;
    }

    var container = document.createElement('div');
    container.className = 'topic-bubbles';
    container.id = 'topicBubbles';

    var label = document.createElement('div');
    label.className = 'topic-bubbles__label';
    label.textContent = 'What can I help you with today?';
    container.appendChild(label);

    var row = document.createElement('div');
    row.className = 'topic-bubbles__row';

    TOPIC_BUBBLES.forEach(function(topic) {
      var btn = document.createElement('button');
      btn.className = 'topic-bubble';
      btn.setAttribute('data-topic-id', topic.id);
      btn.innerHTML = '<span class="topic-bubble__icon">' + topic.icon + '</span>' +
                      '<span class="topic-bubble__text">' + topic.label + '</span>';

      btn.addEventListener('click', function() {
        var idx = selectedTopics.indexOf(topic.id);
        if (idx === -1) {
          selectedTopics.push(topic.id);
          btn.classList.add('topic-bubble--selected');
        } else {
          selectedTopics.splice(idx, 1);
          btn.classList.remove('topic-bubble--selected');
        }
        log('topicBubble', topic.id + ' → ' + (idx === -1 ? 'selected' : 'deselected') +
            ' | selectedTopics=' + JSON.stringify(selectedTopics));

        // Show/hide the "Go" button
        var goBtn = document.getElementById('topicGoBtn');
        if (goBtn) goBtn.style.display = selectedTopics.length > 0 ? 'inline-flex' : 'none';
      });

      row.appendChild(btn);
    });

    container.appendChild(row);

    // "Go" button — hidden until at least one topic selected
    var goBtn = document.createElement('button');
    goBtn.className = 'topic-go-btn';
    goBtn.id = 'topicGoBtn';
    goBtn.textContent = 'Let\u2019s go \u2192';
    goBtn.style.display = 'none';
    goBtn.addEventListener('click', function() {
      if (selectedTopics.length === 0) return;
      var labels = selectedTopics.map(function(id) {
        var match = TOPIC_BUBBLES.filter(function(t) { return t.id === id; })[0];
        return match ? match.label : id;
      });
      // Store as hard system state — survives the entire session
      window.activeUserTopics = labels.slice();
      log('TopicBubbles', 'HARD STATE SET: window.activeUserTopics=' + JSON.stringify(window.activeUserTopics));

      var msg = 'I\u2019d like help with: ' + labels.join(', ');
      // Remove the bubble container
      container.remove();

      // If voice session is active, inject topics via session.update on the data channel.
      // session.update REPLACES instructions entirely, so we send the FULL client-side
      // SYSTEM_PROMPT (all rules: data integrity, sensory, options, phases, report rules)
      // plus the ACTIVE USER TOPICS block — nothing is lost.
      // CRITICAL: session.update must complete BEFORE triggering the AI response,
      // so we delay sendText by 200ms to guarantee the update is processed first.
      var voiceActive = typeof RealtimeVoice !== 'undefined' && RealtimeVoice.getState &&
          RealtimeVoice.getState() !== 'idle' && RealtimeVoice.getState() !== 'error' &&
          RealtimeVoice.sendEvent;

      if (voiceActive) {
        // Phase 33: render user bubble via shared path (voiceOnly — Realtime drives the response)
        submitUserText(msg, { voiceOnly: true, path: 'voice' });
        var topicDirective = '\n\n## ACTIVE USER TOPICS (HARD SYSTEM STATE)\n' +
          'The user selected these topics via the session-start interface: ' +
          labels.join(', ') + '\n' +
          'This is CONFIRMED user intent — not a guess, not optional text. These topics were selected by the user clicking buttons in the UI.\n' +
          'Rules:\n' +
          '- You MUST treat these as the user\'s confirmed areas of need\n' +
          '- Do NOT ask "what can I help you with" or "what do you need help with"\n' +
          '- Do NOT say you cannot see their selections or that you don\'t know what they picked\n' +
          '- Immediately proceed with guidance on these specific topics\n' +
          '- If you still need basic info (name, branch, state), weave it naturally into the topic discussion';
        RealtimeVoice.sendEvent({
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: SYSTEM_PROMPT + topicDirective
          }
        });
        log('TopicBubbles', 'VOICE session.update SENT — delaying sendText 500ms');
        // Phase FBP: delay extended from 200ms → 500ms to reduce race condition where
        // the AI responds before session.update is processed, causing "I can't see your selections"
        setTimeout(function() {
          log('TopicBubbles', 'VOICE sendText firing AFTER session.update delay');
          RealtimeVoice.sendText(msg);
          conversationHistory.push({ role: 'user', content: msg });
        }, 500);
      } else {
        // Text mode — Phase 33: render bubble + send via shared path
        submitUserText(msg);
      }
    });
    container.appendChild(goBtn);

    chatMessages.appendChild(container);
    scrollToBottom();
  }

  // ══════════════════════════════════════════════════════
  //  GENERATE REPORT BUTTON
  // ══════════════════════════════════════════════════════
  var REPORT_MIN_USER_MESSAGES = 4;  // minimum real user messages before showing button

  function maybeShowReportButton() {
    // Debug: log every evaluation so we can see why it does/doesn't trigger
    var alreadyVisible = reportButtonVisible;
    var topicsSubmitted = selectedTopics.length > 0;
    var userMsgCount = conversationHistory.filter(function(m) { return m.role === 'user'; }).length;
    if (chatMessages) {
      var domUserMsgs = chatMessages.querySelectorAll('.message--user').length;
      if (domUserMsgs > userMsgCount) userMsgCount = domUserMsgs;
    }
    var enoughTurns = userMsgCount >= REPORT_MIN_USER_MESSAGES;
    var chatInput = document.getElementById('chatInputText');
    var voiceInput = document.getElementById('chatInputVoice');
    var anchor = (inputMode === 'voice' && voiceInput) ? voiceInput : chatInput;

    log('maybeShowReport', 'alreadyVisible=' + alreadyVisible +
        ' | topicsSubmitted=' + topicsSubmitted +
        ' (selectedTopics.length=' + selectedTopics.length + ')' +
        ' | userMsgCount=' + userMsgCount +
        ' | enoughTurns=' + enoughTurns +
        ' | anchorExists=' + !!(anchor && anchor.parentNode) +
        ' | inputMode=' + inputMode);

    if (alreadyVisible) return;

    if (topicsSubmitted || enoughTurns) {
      showReportButton();
    }
  }

  function showReportButton() {
    if (reportButtonVisible) {
      log('showReportButton', 'SKIP — already visible');
      return;
    }
    reportButtonVisible = true;

    var existing = document.getElementById('generateReportBar');
    if (existing) {
      log('showReportButton', 'SKIP — DOM element already exists');
      return;
    }

    var bar = document.createElement('div');
    bar.className = 'generate-report-bar';
    bar.id = 'generateReportBar';

    var btn = document.createElement('button');
    btn.className = 'generate-report-btn';
    btn.innerHTML = '<span class="generate-report-btn__icon">\uD83D\uDCCB</span> Generate My Report';
    btn.addEventListener('click', function() {
      if (isProcessing) return;
      var msg = 'Just give me the report. Generate my personalized plan based on everything we\'ve discussed so far. If you still need anything critical, ask only the minimum remaining questions needed to complete it \u2014 then generate the report immediately after.';
      // Remove the bar
      bar.remove();
      // Send through normal pipeline
      addMessage(msg, 'user');
      if (inputMode === 'voice' && typeof RealtimeVoice !== 'undefined' && RealtimeVoice.sendText) {
        RealtimeVoice.sendText(msg);
      } else {
        sendToAI(msg);
      }
    });

    bar.appendChild(btn);

    // Insert above the input area — try both anchors for robustness
    var chatInput = document.getElementById('chatInputText');
    var voiceInput = document.getElementById('chatInputVoice');
    var anchor = (inputMode === 'voice' && voiceInput) ? voiceInput : chatInput;
    // Fallback: if primary anchor not found, try the other one
    if (!anchor || !anchor.parentNode) {
      anchor = chatInput || voiceInput;
    }
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(bar, anchor);
      log('showReportButton', 'INSERTED before ' + anchor.id);
    } else {
      // Last resort: append to chatScreen directly
      var screen = document.getElementById('chatScreen');
      if (screen) {
        screen.appendChild(bar);
        log('showReportButton', 'APPENDED to chatScreen (fallback)');
      } else {
        log('showReportButton', 'FAILED — no anchor found');
      }
    }
  }

  // ══════════════════════════════════════════════════════
  //  AIOS — ONBOARDING CARD  (Phase 21)
  //  Shows a brief welcome card for first-time users only.
  //  Dismissed automatically on first AI response or first user send.
  //  Skipped entirely if localStorage 'aaai_returning' === '1'.
  // ══════════════════════════════════════════════════════
  function _showOnboardingCard() {
    if (localStorage.getItem('aaai_returning') === '1') return;
    if (document.getElementById('aiosOnboardCard')) return;
    if (!chatMessages) return;

    var card = document.createElement('div');
    card.id = 'aiosOnboardCard';
    card.className = 'aios-onboard-card';
    card.innerHTML =
      '<p class="aios-onboard-card__headline">Your free veteran navigator is ready.</p>' +
      '<p class="aios-onboard-card__body">I can help you understand your VA benefits, start a disability claim, find state programs, and navigate the paperwork — step by step.</p>' +
      '<p class="aios-onboard-card__hint">Tap a quick start below, or just type your question.</p>' +
      '<button class="aios-onboard-card__skip" id="aiosOnboardSkip" aria-label="Skip intro">Skip</button>';

    if (chatMessages.firstChild) {
      chatMessages.insertBefore(card, chatMessages.firstChild);
    } else {
      chatMessages.appendChild(card);
    }

    var skipBtn = document.getElementById('aiosOnboardSkip');
    if (skipBtn) {
      skipBtn.addEventListener('click', function() { _dismissOnboardCard(); });
    }
  }

  function _dismissOnboardCard() {
    var card = document.getElementById('aiosOnboardCard');
    if (card) {
      card.classList.add('aios-onboard-card--dismissed');
    }
  }

  // ══════════════════════════════════════════════════════
  //  START CHAT
  // ══════════════════════════════════════════════════════
  function startChat(mode) {
    log('startChat', 'mode=' + mode);
    inputMode = mode;
    if (landingScreen) landingScreen.style.display = 'none';
    if (chatScreen) chatScreen.style.display = 'flex';

    var mainNav = document.querySelector('.navbar');
    if (mainNav) mainNav.style.display = 'none';
    document.body.classList.remove('no-scroll');

    if (mode === 'voice') {
      if (chatInputText) chatInputText.style.display = 'none';
      if (chatInputVoice) chatInputVoice.style.display = 'block';

      // Force captions on in voice mode
      captionsEnabled = true;
      window.__aaaiCaptionsEnabled = true;
      updateCaptionsButton();
      if (captionsOverlay) captionsOverlay.style.display = 'block';

      // Start Realtime voice session
      startVoiceSession();

    } else {
      if (chatInputText) chatInputText.style.display = 'block';
      if (chatInputVoice) chatInputVoice.style.display = 'none';

      if (captionsEnabled && captionsOverlay) {
        captionsOverlay.style.display = 'block';
      }

      // Phase 42/46: detect ?resume=1 from "Continue Mission" link — skip onboarding
      var _urlParams = new URLSearchParams(window.location.search);
      if (_urlParams.get('resume') === '1') {
        localStorage.setItem('aaai_returning', '1');
        // Clean URL without reload
        if (window.history.replaceState) {
          window.history.replaceState({}, '', window.location.pathname);
        }
        // Phase 46 Part 2: Rehydrate conversation history from saved snapshot
        if (window.AIOS && window.AIOS.MissionState) {
          try {
            var _convSnap = window.AIOS.MissionState.getConversation();
            if (_convSnap && Array.isArray(_convSnap.history) && _convSnap.history.length > 0) {
              conversationHistory = _convSnap.history.slice();
              log('MissionState', 'rehydrated ' + conversationHistory.length + ' turns from snapshot');
            }
          } catch(_msErr) { /* non-critical */ }
        }
        // Send resume context so AI picks up where they left off
        sendToAI('RESUME_MISSION');
      } else {
        // Phase 5 greeting fix: render welcome immediately — no API latency, no generic card.
        // addMessage() calls _dismissOnboardCard() internally.
        // Push to conversationHistory so subsequent AI turns have the opening context.
        var _sg = [
          'Welcome to AfterAction AI. I\u2019m here to help you find every benefit, resource, and organization you\u2019ve earned through your service \u2014 and build you a personalized plan. Free. No forms. No judgment.',
          '',
          'Before we start, here\u2019s a tip: the more documents you upload up front, the more accurate and personalized your plan will be \u2014 and the fewer questions I\u2019ll need to ask.',
          '',
          'Tap the upload button (arrow icon at the bottom) and drop in anything you have: DD-214, resume, bio, VA Disability Rating Letter, VA Benefits Summary, military transcripts, certificates, diplomas, or medical records. I\u2019ll pull the details automatically.',
          '',
          'Upload as many as you want, or none at all \u2014 uploads are helpful but not required.',
          '',
          'Let\u2019s start with the basics \u2014 what branch did you serve in?',
          '',
          '[OPTIONS: Army | Navy | Air Force | Marine Corps | Coast Guard | Space Force | National Guard | Reserve | I\u2019m a family member]'
        ].join('\n');
        addMessage(_sg, 'ai');
        conversationHistory.push({ role: 'assistant', content: _sg });
        if (!topicBubblesShown) { topicBubblesShown = true; renderTopicBubbles(); }
      }
    }

    updateModeIcon();
  }

  // ══════════════════════════════════════════════════════
  //  AIOS — VOICE INTELLIGENCE UPDATE  (Phase 19)
  //  Called after each accepted final voice transcript.
  //  Runs the same AIOS layer as the text path:
  //    1. Memory extraction  (extractMemoryFromInput)
  //    2. Mission detection  (detectMissionFromInput)
  //    3. Skill routing      (Router.routeAIOSIntent)
  //    4. session.update     (injects AIOS system prompt into live voice session)
  //  Steps 1-2 always run.  Steps 3-4 only run when a specific skill is routed
  //  (matches text-path behavior — GENERAL_QUESTION keeps existing session instructions).
  //  Fully wrapped in try/catch — voice transport is never affected by AIOS failures.
  // ══════════════════════════════════════════════════════
  function _aiosVoiceUpdate(transcript) {
    try {
      // ── Guards ──
      if (!window.AIOS || !window.AIOS.Router || !window.AIOS.RequestBuilder) return;
      if (!transcript || transcript.trim().length < 3) return;
      if (transcript === 'START_CONVERSATION') return;
      if (typeof RealtimeVoice === 'undefined' || !RealtimeVoice.sendEvent) return;
      var _vs = RealtimeVoice.getState ? RealtimeVoice.getState() : 'idle';
      if (_vs === 'idle' || _vs === 'error') return;

      // ── 1. Memory extraction ──────────────────────────
      if (window.AIOS.Memory &&
          typeof window.AIOS.Memory.extractMemoryFromInput === 'function') {
        var _extracted = window.AIOS.Memory.extractMemoryFromInput(transcript);
        if (Object.keys(_extracted).length > 0) {
          window.AIOS.Memory.profile = window.AIOS.Memory.mergeMemory(
            window.AIOS.Memory.profile, _extracted
          );
          log('AIOS:VOICE', 'memory: ' + JSON.stringify(_extracted));
          // Persist asynchronously for authenticated users (non-blocking)
          if (typeof window.AIOS.Memory.save === 'function') {
            window.AIOS.Memory.save();
          }
        }
      }

      // ── 2. Mission detection ──────────────────────────
      // Phase 3.2: removed !Mission.current outer gate — now allows multiple
      // mission types simultaneously. Type-based dedup prevents duplicates.
      if (window.AIOS.Mission &&
          typeof window.AIOS.Mission.detectMissionFromInput === 'function') {
        var _mSeed = window.AIOS.Mission.detectMissionFromInput(transcript);
        if (_mSeed && typeof window.AIOS.Mission.createMission === 'function') {
          // Only create if no non-archived mission of this type already exists
          var _voiceExisting = typeof window.AIOS.Mission.getByType === 'function'
            ? window.AIOS.Mission.getByType(_mSeed.type)
            : window.AIOS.Mission.current;
          if (!_voiceExisting) {
            var _newMission = window.AIOS.Mission.createMission(_mSeed.type);
            if (_newMission) {
              window.AIOS.Mission.current = _newMission;
              log('AIOS:VOICE', 'mission: ' + _mSeed.type + ' matched="' + _mSeed.matched + '"');

              // PHASE 2 - Use new persistent layer if activeCaseId present
              // Persist the new mission to Supabase alongside the in-memory state.
              // Fire-and-forget — failure never blocks voice flow.
              if (_activeCaseId && window.AAAI && window.AAAI.DataAccess) {
                (function(_m) {
                  withRetry(function() { return window.AAAI.DataAccess.missions.create(_activeCaseId, _m); }, 'missions.create:voice')
                    .then(function(r) {
                      if (!r.error && r.data && r.data.id) {
                        _m._dbId = r.data.id; // attach DB UUID for future sync()
                        log('Phase2', 'voice mission persisted — ' + _m.type + ' | dbId: ' + r.data.id);
                      }
                    }).catch(function(e) { console.error('[AAAI ERROR][missions.create] voice — type:', _m.type, '| case:', _activeCaseId, '|', e); });
                })(_newMission);
              }
            }
          }
        }
      }

      // ── 3. Route intent ───────────────────────────────
      var _vRoute = window.AIOS.Router.routeAIOSIntent(transcript);
      log('AIOS:VOICE', 'intent=' + _vRoute.intent +
        ' | skill=' + (_vRoute.skill || 'none') +
        ' | confidence=' + _vRoute.confidence);

      // ── Phase 1 Bridge: async Claude classification for ALL intents ──
      // shouldInjectContext=true only when no skill fires, so the bridge
      // session.update does not overwrite a skill-specific context block.
      _voiceBridgeProcess(transcript, !_vRoute.skill);

      // Only activate AIOS session.update when a specific skill is routed
      if (!_vRoute.skill || !window.AIOS.SkillLoader) return;

      var _vSkill = window.AIOS.SkillLoader.loadAIOSSkill(_vRoute.skill);
      if (!_vSkill || typeof _vSkill.run !== 'function') return;

      // ── 4. Build AIOS system prompt ───────────────────
      var _vProfile = window.AIOS.Memory ? window.AIOS.Memory.getProfile() : {};
      var _vSkillCfg = _vSkill.run({
        profile:   _vProfile,
        history:   conversationHistory,
        userInput: transcript
      });
      log('AIOS:VOICE', 'skill=' + _vSkill.name);

      // Phase 36: include activeUserTopics so voice AIOS prompt stays in sync with
      // any topic selections the user made via the sidebar or chip buttons.
      var _vPageCtx = (window.activeUserTopics && window.activeUserTopics.length > 0)
        ? { page: 'chat', topics: window.activeUserTopics, inputMode: 'voice' }
        : null;
      // Phase ID-GUARD: Strip name and branch from the profile injected via session.update
      // unless they were freshly extracted from THIS transcript. Prevents prior-session
      // identity data (e.g. persisted "Lewis" / "Army") from causing the voice AI to assert
      // identity the user has not confirmed in this session — the root cause of "Lewis. Army it is."
      var _vSessionProfile = Object.assign({}, _vProfile);
      var _vFreshId = (window.AIOS.Memory &&
          typeof window.AIOS.Memory.extractMemoryFromInput === 'function')
        ? window.AIOS.Memory.extractMemoryFromInput(transcript)
        : {};
      if (!_vFreshId.name)   delete _vSessionProfile.name;
      if (!_vFreshId.branch) delete _vSessionProfile.branch;

      // Phase R3.3: Pre-response resource matching for voice path.
      // Fire-and-forget chain: preMatch → buildAIOSRequest → session.update.
      // If preMatch fails, proceeds with null matchedResources (no crash).
      var _vPreMatchP = (window.AIOS.ResourceMatcher && typeof window.AIOS.ResourceMatcher.preMatch === 'function')
        ? window.AIOS.ResourceMatcher.preMatch(transcript, _vSessionProfile, _vRoute)
            .catch(function() { return { resources: [], promptBlock: '' }; })
        : Promise.resolve({ resources: [], promptBlock: '' });

      _vPreMatchP.then(function(_vPreRes) {
        try {
          var _vMatchedRes = (_vPreRes && _vPreRes.promptBlock) ? _vPreRes.promptBlock : null;
          if (_vMatchedRes) {
            console.log('[AIOS][VOICE-PRE-MATCH] found ' + _vPreRes.resources.length + ' resources');
          }
          var _vReq = window.AIOS.RequestBuilder.buildAIOSRequest({
            userMessage:   transcript,
            routeResult:   _vRoute,
            skillConfig:   _vSkillCfg,
            memoryContext: _vSessionProfile,
            pageContext:   _vPageCtx,
            matchedResources: _vMatchedRes
          });

          // ── 5. Inject via session.update ──────────────────
          // session.update replaces the live session instructions on OpenAI's side.
          // This affects the CURRENT response in flight (if not yet complete) and
          // all subsequent responses — same semantics as topic-bubble injection.
          if (_vReq && _vReq.system && _vReq.system.length > 0) {
            RealtimeVoice.sendEvent({
              type: 'session.update',
              session: { type: 'realtime', instructions: _vReq.system }
            });
            log('AIOS:VOICE', 'session.update SENT | systemLen=' + _vReq.system.length +
              ' | skill=' + _vReq.meta.skill +
              ' | hasMemory=' + _vReq.meta.hasMemory +
              ' | hasMission=' + _vReq.meta.hasMission);
          }
        } catch (_vR3Err) {
          console.warn('[AIOS][VOICE-PRE-MATCH] build/inject error:', _vR3Err.message || _vR3Err);
        }
      });

    } catch (_aiosVErr) {
      // AIOS failure is silent — voice transport continues unaffected
      log('AIOS:VOICE', 'FALLBACK — ' + (_aiosVErr.message || String(_aiosVErr)));
    }
  }

  // ══════════════════════════════════════════════════════
  //  VOICE BRIDGE PROCESS  (Phase 1)
  //  Fire-and-forget. Sends the accepted user voice transcript
  //  to voice-bridge Netlify Function for Claude-powered
  //  structured classification. Voice transport is NEVER
  //  affected by any failure in this function.
  //
  //  @param {string}  transcript          Accepted voice transcript
  //  @param {boolean} shouldInjectContext True = no skill session.update
  //                                       fired this turn (GENERAL_QUESTION)
  // ══════════════════════════════════════════════════════
  function _voiceBridgeProcess(transcript, shouldInjectContext) {
    try {
      if (!transcript || transcript.trim().length < 3) return;

      // ── Identity guard: strip unconfirmed name/branch ──
      var _vbProfile = (window.AIOS && window.AIOS.Memory)
        ? window.AIOS.Memory.getProfile() : {};
      var _vbFreshId = (window.AIOS && window.AIOS.Memory &&
          typeof window.AIOS.Memory.extractMemoryFromInput === 'function')
        ? window.AIOS.Memory.extractMemoryFromInput(transcript) : {};
      var _vbSafeProfile = Object.assign({}, _vbProfile);
      if (!_vbFreshId.name)   delete _vbSafeProfile.name;
      if (!_vbFreshId.branch) delete _vbSafeProfile.branch;

      var _vbController = new AbortController();
      var _vbTimeout    = setTimeout(function() { _vbController.abort(); }, 12000);

      fetch('/api/voice-bridge', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcript,
          history:    conversationHistory.slice(-8),
          profile:    _vbSafeProfile,
          case_id:    _activeCaseId || null
        }),
        signal: _vbController.signal
      })
      .then(function(r) {
        clearTimeout(_vbTimeout);
        if (!r.ok) throw new Error('voice-bridge HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        if (!data || !data.structured) {
          log('VoiceBridge', 'no structured output — session continues normally');
          return;
        }
        log('VoiceBridge', 'OK' +
          ' | mode=' + data.structured.mode +
          ' | in='   + (data.usage ? data.usage.input_tokens  : '?') +
          ' | out='  + (data.usage ? data.usage.output_tokens : '?'));
        _applyVoiceStructured(data.structured, transcript, shouldInjectContext);
      })
      .catch(function(e) {
        clearTimeout(_vbTimeout);
        log('VoiceBridge', e.name === 'AbortError'
          ? 'timed out (12s) — session continues normally'
          : 'fetch error: ' + (e.message || String(e)));
        // Always graceful — voice session never blocked by bridge failure
      });

    } catch (_vbErr) {
      log('VoiceBridge', 'FALLBACK — ' + (_vbErr.message || String(_vbErr)));
    }
  }

  // ══════════════════════════════════════════════════════
  //  APPLY VOICE STRUCTURED  (Phase 1)
  //  Processes Claude's structured classification output:
  //    1. Crisis escalation (highest priority, always first)
  //    2. Mission detection + fire-and-forget DB persist
  //    3. Checklist item creation
  //    4. Session context injection via RequestBuilder
  //       (only for GENERAL_QUESTION turns — fills the gap
  //        where _aiosVoiceUpdate previously returned early)
  //  Fully wrapped in try/catch — voice transport never affected.
  // ══════════════════════════════════════════════════════
  function _applyVoiceStructured(structured, transcript, shouldInjectContext) {
    try {

      // ── 1. Crisis escalation ────────────────────────────────────────
      if (structured.risk_flags &&
          structured.risk_flags.indexOf('crisis_response') !== -1) {
        log('VoiceBridge', 'CRISIS detected via Claude — escalating');
        if (window.AIOS && window.AIOS.CrisisSupport &&
            typeof window.AIOS.CrisisSupport.escalate === 'function') {
          window.AIOS.CrisisSupport.escalate({ source: 'voice_bridge', transcript: transcript });
        }
      }

      // ── 2. Mission processing (Phase 2.5: uses _createMissionWithDefaults) ──
      if (structured.missions && Array.isArray(structured.missions) &&
          window.AIOS && window.AIOS.Mission) {
        structured.missions.forEach(function(mSpec) {
          if (!mSpec || mSpec.action !== 'create' || !mSpec.type) return;
          // _createMissionWithDefaults handles dedup, DB persist, AND injects
          // default checklist items — so the mission is immediately useful.
          _createMissionWithDefaults(mSpec.type);
        });
      }

      // ── 3. Checklist items ───────────────────────────────────────────
      if (structured.checklist_items && Array.isArray(structured.checklist_items) &&
          window.AIOS && window.AIOS.Checklist &&
          typeof window.AIOS.Checklist.addItem === 'function') {
        structured.checklist_items.forEach(function(item) {
          if (!item || !item.title) return;
          window.AIOS.Checklist.addItem({
            title:       item.title,
            category:    item.category    || 'immediate',
            description: item.description || ''
          });
          log('VoiceBridge', 'checklist: ' + item.title);
        });
      }

      // ── 4. Navigation hint — surface internal page link in chat ────────
      // Phase 2.2: When Claude detects a topic we host internally, inject
      // a clickable suggestion bubble so the veteran can jump directly.
      if (structured.navigation_hint && structured.navigation_hint.page) {
        _injectNavigationSuggestion(structured.navigation_hint.page, structured.navigation_hint.filter || null, structured);
      }

      // ── 4b. AGENTIC: Document actions + dashboard handoff (voice path) ──
      // ── 4c. AGENTIC: report_ready triggers auto-save from voice-bridge ──
      // FIX D: Synthesize document_actions for report_ready if AI forgot,
      // then defer ALL dashboard handoff to _processDocumentActions.then().
      if (structured.report_ready || structured.mode === 'report') {
        if (!structured.document_actions || structured.document_actions.length === 0) {
          structured.document_actions = [{
            action: 'save_report',
            template_type: 'benefits_report',
            title: 'Voice Session Benefits Report'
          }];
        }
      }

      if (structured.document_actions && structured.document_actions.length > 0) {
        var _vbDocResult = _processDocumentActions(structured, transcript);
        if (_vbDocResult && typeof _vbDocResult.then === 'function') {
          _vbDocResult.then(function(anySaved) {
            if (anySaved) {
              var _vbHint = structured.dashboard_hint || (structured.report_ready ? 'show_reports' : 'show_profile');
              _injectDashboardHandoff(_vbHint);
            }
          });
        }
      } else if (structured.dashboard_hint) {
        _injectDashboardHandoff(structured.dashboard_hint);
      } else if (structured.checklist_items && structured.checklist_items.length > 0) {
        _injectDashboardHandoff('show_checklist');
      }

      // ── 5. Session context injection (GENERAL_QUESTION gap fill) ─────
      // Only fires when no skill session.update was sent this turn.
      // Uses RequestBuilder.buildAIOSRequest() — identical prompt-assembly
      // path to the existing skill session.update — budget trimming and
      // identity guards are handled the same way.
      if (!shouldInjectContext) return;
      if (!window.AIOS || !window.AIOS.RequestBuilder) return;
      if (typeof RealtimeVoice === 'undefined' || !RealtimeVoice.sendEvent) return;
      var _vsNow = RealtimeVoice.getState ? RealtimeVoice.getState() : 'idle';
      if (_vsNow === 'idle' || _vsNow === 'error') return;

      // Identity-guarded profile (same logic as _aiosVoiceUpdate)
      var _avProfile = window.AIOS.Memory ? window.AIOS.Memory.getProfile() : {};
      var _avFreshId = (window.AIOS.Memory &&
          typeof window.AIOS.Memory.extractMemoryFromInput === 'function')
        ? window.AIOS.Memory.extractMemoryFromInput(transcript) : {};
      var _avSafeProfile = Object.assign({}, _avProfile);
      if (!_avFreshId.name)   delete _avSafeProfile.name;
      if (!_avFreshId.branch) delete _avSafeProfile.branch;

      var _avPageCtx = (window.activeUserTopics && window.activeUserTopics.length > 0)
        ? { page: 'chat', topics: window.activeUserTopics, inputMode: 'voice' }
        : null;

      var _avReq = window.AIOS.RequestBuilder.buildAIOSRequest({
        userMessage:   transcript,
        routeResult:   {
          intent:             'GENERAL_QUESTION',
          skill:              null,
          confidence:         0.4,
          matched:            null,
          tier:               'STANDARD',
          needsClarification: false
        },
        skillConfig:   null,
        memoryContext: _avSafeProfile,
        pageContext:   _avPageCtx
      });

      if (_avReq && _avReq.system && _avReq.system.length > 0) {
        RealtimeVoice.sendEvent({
          type:    'session.update',
          session: { type: 'realtime', instructions: _avReq.system }
        });
        log('VoiceBridge', 'session.update SENT (GENERAL_QUESTION enrichment)' +
          ' | len='        + _avReq.system.length +
          ' | hasMemory='  + _avReq.meta.hasMemory +
          ' | hasMission=' + _avReq.meta.hasMission);
      }

    } catch (_avsErr) {
      log('VoiceBridge', 'applyStructured FALLBACK — ' + (_avsErr.message || String(_avsErr)));
    }
  }

  // ══════════════════════════════════════════════════════
  //  NAVIGATION SUGGESTION INJECTION  (Phase 2.2)
  //  Injects a clickable link into the chat when the voice
  //  bridge detects a topic covered by an internal page.
  //  Follows the same DOM pattern as showAtRiskBanner().
  // ══════════════════════════════════════════════════════
  var _lastNavPage = null;  // dedup — don't show same page twice in a row
  var _NAV_PAGE_MAP = {
    'document-templates': { url: '/document-templates.html', label: 'Legal Document Templates',     icon: '\uD83D\uDCC4' },
    'state-benefits':     { url: '/state-benefits.html',     label: 'State-Specific Benefits',      icon: '\uD83C\uDFDB\uFE0F' },
    'service-dogs':       { url: '/service-dogs.html',       label: 'Service Dog Resources',        icon: '\uD83D\uDC15\u200D\uD83E\uDDBA' },
    'grants-scholarships':{ url: '/grants-scholarships.html',label: 'Grants & Scholarships',        icon: '\uD83C\uDF93' },
    'hotlines-escalation':{ url: '/hotlines-escalation.html',label: 'Hotlines & Emergency Contacts',icon: '\u260E\uFE0F' },
    'families-support':   { url: '/families-support.html',   label: 'Family & Survivor Support',    icon: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67' },
    'wellness':           { url: '/wellness.html',           label: 'Wellness & Mental Health',      icon: '\uD83E\uDDD1\u200D\u2695\uFE0F' },
    'licensure':          { url: '/licensure.html',          label: 'Professional Licensure',        icon: '\uD83D\uDCCB' },
    'resources':          { url: '/resources.html',          label: 'Veteran Resources',             icon: '\u2B50' },
    'education':          { url: '/education.html',          label: 'Education & Training',          icon: '\uD83D\uDCDA' },
    'checklist':          { url: null,                       label: 'Your Mission Checklist',        icon: '\u2705' }
  };

  // ══════════════════════════════════════════════════════
  //  INLINE RESOURCE CARDS (Phase 2.5r)
  //  All personalized resources, missions, and templates
  //  render DIRECTLY in the chat as card groups.
  //  No screen switches. No popups. The chat IS the dashboard.
  // ══════════════════════════════════════════════════════

  var _INLINE_RESOURCES = {
    'document-templates': [
      { title: 'Power of Attorney (VA 21-22)',     desc: 'Authorize a VSO to represent you',                url: '/document-templates.html?filter=power-of-attorney', icon: '\uD83D\uDCDD' },
      { title: 'Advance Directive',                desc: 'Living will and healthcare proxy',                url: '/document-templates.html?filter=advance-directive',  icon: '\uD83C\uDFE5' },
      { title: 'Buddy Letter / Affidavit',         desc: 'Sworn statement supporting a disability claim',   url: '/document-templates.html?filter=affidavit',          icon: '\u270D\uFE0F' },
      { title: 'Resume Template',                  desc: 'Military-to-civilian resume builder',             url: '/document-templates.html?filter=resume',             icon: '\uD83D\uDCCB' },
      { title: 'Intent to File (VA 21-0966)',      desc: 'Lock in your effective date today',               url: '/document-templates.html?filter=intent-to-file',     icon: '\u23F0' }
    ],
    'state-benefits': [
      { title: 'State Veterans Benefits',  desc: 'Tax exemptions, education, housing by state', url: '/state-benefits.html',         icon: '\uD83C\uDFDB\uFE0F' },
      { title: 'State VA Offices',         desc: 'Find your state VA office and local contacts',url: '/state-benefits.html#offices', icon: '\uD83C\uDFE2' }
    ],
    'service-dogs': [
      { title: 'Service Dog Programs',     desc: 'Trained service dog organizations',           url: '/service-dogs.html',     icon: '\uD83D\uDC15\u200D\uD83E\uDDBA' },
      { title: 'Emotional Support Animals',desc: 'ESA letters and qualifying conditions',       url: '/service-dogs.html#esa', icon: '\uD83D\uDC3E' }
    ],
    'grants-scholarships': [
      { title: 'Education Grants',     desc: 'Federal and private grants for veterans',          url: '/grants-scholarships.html',        icon: '\uD83C\uDF93' },
      { title: 'Scholarship Database', desc: 'Searchable veteran-specific scholarships',         url: '/grants-scholarships.html#search', icon: '\uD83D\uDCB0' }
    ],
    'hotlines-escalation': [
      { title: 'Veterans Crisis Line',  desc: 'Call 988 Press 1 — 24/7 confidential support',   url: '/hotlines-escalation.html',           icon: '\u260E\uFE0F' },
      { title: 'Emergency Resources',   desc: 'Homeless, DV, and substance abuse hotlines',      url: '/hotlines-escalation.html#emergency', icon: '\uD83D\uDEA8' }
    ],
    'families-support': [
      { title: 'Survivor Benefits (DIC)',desc: 'Dependency and Indemnity Compensation',          url: '/families-support.html',           icon: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67' },
      { title: 'Caregiver Support',      desc: 'VA Caregiver Program and respite care',          url: '/families-support.html#caregiver', icon: '\u2764\uFE0F' }
    ],
    'wellness': [
      { title: 'Mental Health Resources', desc: 'PTSD, anxiety, depression programs',            url: '/wellness.html',         icon: '\uD83E\uDDD1\u200D\u2695\uFE0F' },
      { title: 'Fitness & Adaptive Sports',desc: 'Physical wellness and recreation',             url: '/wellness.html#fitness', icon: '\uD83C\uDFCB\uFE0F' }
    ],
    'licensure': [
      { title: 'License Reciprocity',     desc: 'State-to-state professional license transfers', url: '/licensure.html',             icon: '\uD83D\uDCCB' },
      { title: 'VA-Approved Programs',    desc: 'Training and certification programs',           url: '/licensure.html#va-approved', icon: '\u2705' }
    ],
    'resources': [
      { title: 'VSO Directory',           desc: 'DAV, VFW, American Legion — free claims help',  url: '/resources.html',          icon: '\u2B50' },
      { title: 'Partner Organizations',   desc: 'Nonprofits and community orgs near you',        url: '/resources.html#partners', icon: '\uD83E\uDD1D' }
    ],
    'education': [
      { title: 'GI Bill Overview',        desc: 'Post-9/11, Montgomery, and Forever GI Bill',    url: '/education.html',     icon: '\uD83D\uDCDA' },
      { title: 'VR&E / Chapter 31',       desc: 'Vocational Rehabilitation & Employment',        url: '/education.html#vre', icon: '\uD83D\uDCBC' }
    ]
  };

  var _MISSION_DEFAULTS = {
    'disability_claim': [
      { title: 'Gather service medical records',          category: 'immediate',  description: 'Request from NPRC or VA.gov' },
      { title: 'Write buddy letter / personal statement', category: 'immediate',  description: 'Document how your condition affects daily life' },
      { title: 'File Intent to File (VA 21-0966)',        category: 'immediate',  description: 'Locks in your effective date' },
      { title: 'Schedule C&P exam prep',                  category: 'short_term', description: 'Research what to expect at your C&P exam' }
    ],
    'education_path': [
      { title: 'Check GI Bill eligibility',               category: 'immediate',  description: 'Verify remaining entitlement on VA.gov' },
      { title: 'Compare schools / programs',              category: 'immediate',  description: 'GI Bill Comparison Tool at va.gov/gi-bill-comparison-tool' },
      { title: 'Apply for Certificate of Eligibility',    category: 'short_term', description: 'Request COE through VA.gov' }
    ],
    'state_benefits_search': [
      { title: 'Look up your state benefits page',        category: 'immediate',  description: 'Unique property tax, education, and hiring benefits' },
      { title: 'Contact your State VA office',            category: 'immediate',  description: 'They identify benefits you may not know about' }
    ],
    'housing_path': [
      { title: 'Check VA home loan eligibility',          category: 'immediate',  description: 'Request your COE from VA.gov' },
      { title: 'Research SAH / SHA grants',               category: 'short_term', description: 'Specially Adapted Housing for service-connected disabilities' }
    ],
    'employment_transition': [
      { title: 'Translate MOS to civilian resume',        category: 'immediate',  description: 'Use our template or O*NET to map skills' },
      { title: 'Explore VR&E Chapter 31',                 category: 'immediate',  description: 'Job training, resume help, and more' },
      { title: 'Register on eBenefits & USAJOBS',        category: 'short_term', description: 'Veterans get preference for federal jobs' }
    ]
  };

  function _escHtml(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  // ── Inject resource cards directly into the chat ──
  function _injectNavigationSuggestion(page, filter, structured) {
    try {
      if (!page || page === _lastNavPage) return;
      // ── Phase DOC-GEN: Suppress document-templates navigation cards ──
      // The AI now generates documents inline via the chat pipeline and saves
      // them to the dashboard.  Sending users to the template page is no longer
      // the primary flow.  Template pages remain available via direct URL.
      if (page === 'document-templates') {
        log('VoiceBridge', 'SUPPRESSED nav suggestion for document-templates — AI handles doc generation inline');
        return;
      }
      var target = _NAV_PAGE_MAP[page];
      if (!target) return;
      _lastNavPage = page;

      var container = document.getElementById('chatMessages');
      if (!container) return;

      var resources = _INLINE_RESOURCES[page] || [];
      if (resources.length === 0 && !target.url) return;

      // ── Card group wrapper ──
      var group = document.createElement('div');
      group.className = 'message message--ai';
      group.style.cssText = 'background:transparent;padding:0;margin:10px 0;';

      // ── Header label ──
      var header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:0 4px;';
      header.innerHTML = '<span style="font-size:18px;">' + target.icon + '</span>' +
        '<span style="color:#C5A55A;font-weight:700;font-size:0.95rem;">' + _escHtml(target.label) + '</span>';
      group.appendChild(header);

      // ── Resource cards ──
      resources.forEach(function(res) {
        var card = document.createElement('a');
        card.href = res.url;
        card.rel = 'noopener';
        card.className = 'resource-card';
        card.setAttribute('data-title', res.title);
        card.innerHTML =
          '<div class="resource-card__icon">' + (res.icon || '\u2B50') + '</div>' +
          '<div class="resource-card__body">' +
            '<div class="resource-card__title">' + _escHtml(res.title) + '</div>' +
            '<div class="resource-card__desc">' + _escHtml(res.desc) + '</div>' +
          '</div>' +
          '<span class="resource-card__arrow">\u203A</span>';
        group.appendChild(card);
      });

      // ── Fallback: single link if no resource cards ──
      if (resources.length === 0 && target.url) {
        var link = document.createElement('a');
        link.href = target.url + (filter ? '?filter=' + encodeURIComponent(filter) : '');
        link.rel = 'noopener';
        link.className = 'resource-card';
        link.setAttribute('data-title', target.label);
        link.innerHTML =
          '<div class="resource-card__icon">' + target.icon + '</div>' +
          '<div class="resource-card__body">' +
            '<div class="resource-card__title">' + _escHtml(target.label) + '</div>' +
            '<div class="resource-card__desc">View dedicated page</div>' +
          '</div>' +
          '<span class="resource-card__arrow">\u203A</span>';
        group.appendChild(link);
      }

      container.appendChild(group);
      if (typeof scrollToBottom === 'function') scrollToBottom();
      log('VoiceBridge', 'INLINE RESOURCES injected: page=' + page + ' (' + resources.length + ' cards)');
    } catch (e) {
      log('VoiceBridge', 'nav suggestion error: ' + (e.message || e));
    }
  }

  // ── RESOURCE CARD CLICK HANDLER (delegated) ────────────────────────────
  // Intercepts clicks on in-chat .resource-card elements so the AI receives
  // context about what the user selected.  Works in both text and voice modes.
  // The card's href is opened in a new tab AFTER context is sent.
  (function _initResourceCardHandler() {
    var _container = document.getElementById('chatMessages');
    if (!_container) return;

    _container.addEventListener('click', function(e) {
      var card = e.target.closest('.resource-card');
      if (!card || !card.hasAttribute('data-title')) return;

      e.preventDefault();
      var title = card.getAttribute('data-title');
      var msg   = 'I\u2019d like to explore: ' + title;

      // Voice session → route through Realtime API
      var voiceActive = typeof RealtimeVoice !== 'undefined' && RealtimeVoice.getState &&
          RealtimeVoice.getState() !== 'idle' && RealtimeVoice.getState() !== 'error';

      if (voiceActive && RealtimeVoice.sendText) {
        submitUserText(msg, { voiceOnly: true, path: 'resource-card' });
        RealtimeVoice.sendText(msg);
        conversationHistory.push({ role: 'user', content: msg });
      } else {
        submitUserText(msg, { path: 'resource-card' });
      }

      // Open the resource page in a new tab so the user still gets the link
      var href = card.getAttribute('href');
      if (href) {
        window.open(href, '_blank', 'noopener');
      }

      log('ResourceCard', 'CLICK → "' + title + '" | voice=' + voiceActive);
    });
  })();

  // ── Create a mission with defaults and show it inline in chat ──
  function _createMissionWithDefaults(missionType) {
    if (!window.AIOS || !window.AIOS.Mission) return null;
    if (typeof window.AIOS.Mission.createMission !== 'function') return null;

    // Dedup
    if (typeof window.AIOS.Mission.getByType === 'function') {
      var existing = window.AIOS.Mission.getByType(missionType);
      if (existing) return existing;
    }

    var newMission = window.AIOS.Mission.createMission(missionType);
    if (!newMission) return null;
    window.AIOS.Mission.current = newMission;
    log('Mission', 'CREATED: ' + missionType);

    // Fire-and-forget DB persist + flush pending checklist items once _dbId is known
    if (_activeCaseId && window.AAAI && window.AAAI.DataAccess) {
      (function(m, caseId) {
        withRetry(function() {
          return window.AAAI.DataAccess.missions.create(caseId, m);
        }, 'missions.create:phase25r').then(function(r) {
          if (!r.error && r.data && r.data.id) {
            m._dbId = r.data.id;
            // Flush any checklist items that were queued before _dbId existed
            if (window.AIOS && window.AIOS.Checklist &&
                typeof window.AIOS.Checklist.flushPending === 'function') {
              window.AIOS.Checklist.flushPending(r.data.id, caseId);
            }
          }
        }).catch(function(e) {
          console.error('[Mission][create]', m.type, e);
        });
      })(newMission, _activeCaseId);
    }

    // Inject default checklist items
    var defaults = _MISSION_DEFAULTS[missionType];
    if (defaults && window.AIOS && window.AIOS.Checklist &&
        typeof window.AIOS.Checklist.addItem === 'function') {
      defaults.forEach(function(item) {
        window.AIOS.Checklist.addItem({
          title:       item.title,
          category:    item.category || 'immediate',
          description: item.description || ''
        });
      });
    }

    // Show mission card inline in chat
    _injectMissionCard(newMission, defaults);

    return newMission;
  }

  // Renders a visible mission confirmation card directly in chat
  function _injectMissionCard(mission, steps) {
    var container = document.getElementById('chatMessages');
    if (!container || !mission) return;

    var mName = (mission.name || mission.type || 'Mission').replace(/_/g, ' ');

    var card = document.createElement('div');
    card.className = 'message message--ai';
    card.style.cssText = 'background:#0d2137;border:1px solid #C5A55A;border-radius:12px;padding:14px 16px;margin:10px 0;';

    var html = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
      '<span style="font-size:20px;">\uD83D\uDE80</span>' +
      '<span style="color:#C5A55A;font-weight:700;font-size:1rem;">Mission Started: ' + _escHtml(mName) + '</span></div>';

    if (steps && steps.length > 0) {
      html += '<div style="color:#b0c4d8;font-size:0.85rem;margin-bottom:6px;">Your first steps:</div>';
      steps.forEach(function(s, i) {
        html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-top:1px solid rgba(255,255,255,0.08);">' +
          '<span style="color:#C5A55A;font-weight:700;min-width:18px;">' + (i + 1) + '.</span>' +
          '<div><div style="color:#e0e0e0;font-weight:600;font-size:0.9rem;">' + _escHtml(s.title) + '</div>' +
          '<div style="color:#8899aa;font-size:0.8rem;">' + _escHtml(s.description || '') + '</div></div></div>';
      });
    }

    card.innerHTML = html;
    container.appendChild(card);
    if (typeof scrollToBottom === 'function') scrollToBottom();
    log('Mission', 'CARD injected in chat: ' + mName);
  }

  // ══════════════════════════════════════════════════════
  //  VOICE INTELLIGENCE PIPELINE  (Phase 1 Fix)
  //  VOICE INTELLIGENCE CONNECTED - Phase 1 Fix
  //
  //  Runs the Phase 47-50 intelligence layer on each
  //  completed voice AI response. Mirrors the text-path
  //  pipeline in sendToAI() without re-calling the API.
  //
  //  Voice responses come from OpenAI Realtime — calling
  //  sendToAI() would wrongly re-route to Anthropic/Claude.
  //  This function runs the same downstream enrichment
  //  that text responses already receive, applied here
  //  to the completed voice AI transcript.
  //
  //  What runs:
  //    Phase 47: ResponseContract.parse()  → structured contract
  //    Phase 47: MissionExtractor.process() → mission update
  //    Phase 49: ActionBar.render()         → contextual buttons
  //    Phase 50: ResourceMatcher.match()    → internal resource links
  //
  //  Fully wrapped in try/catch — voice transport is NEVER
  //  affected by any failure in this pipeline.
  // ══════════════════════════════════════════════════════
  function _voiceIntelligencePipeline(aiResponse, userTranscript) {
    try {
      // Guards — same pattern as _aiosVoiceUpdate
      if (!window.AIOS || !window.AIOS.ResponseContract) return;
      if (!aiResponse || aiResponse.trim().length < 10) return;

      // ── Phase 4.2: Response fingerprint dedup guard ────────────────
      // Prevents double-processing when both response.audio_transcript.done
      // and response.cancelled fire for the same response in edge cases.
      var _vtFingerprint = aiResponse.length + '|' + aiResponse.substring(0, 30);
      if (_voiceIntelligencePipeline._lastFingerprint === _vtFingerprint) {
        log('_voiceIntelligencePipeline', 'DEDUP — skipping duplicate voice response');
        return;
      }
      _voiceIntelligencePipeline._lastFingerprint = _vtFingerprint;

      // ── Phase 4.2: Capture seq number for async structured call guard ──
      var _vtSeq = ++_voiceStructuredSeq;

      // ── Build context (mirrors Phase 47 ctx in sendToAI) ──────────
      var _vtCtx = {};
      if (window.AIOS.Router && userTranscript) {
        _vtCtx.routeResult = window.AIOS.Router.routeAIOSIntent(userTranscript);
      }
      if (window.AIOS.Memory) {
        _vtCtx.profile = window.AIOS.Memory.getProfile();
      }
      if (window.AIOS.Mission) {
        _vtCtx.mission = window.AIOS.Mission.current || null;
      }

      // ── Phase 47: Immediate regex fallback (preserves instant UX) ─
      var _vtContract = window.AIOS.ResponseContract.parse(aiResponse, _vtCtx);
      console.log('[AIOS][VOICE-CONTRACT] mode=' + _vtContract.mode +
        ' | confidence=' + _vtContract.confidence.toFixed(2) +
        ' | actions=' + (_vtContract.recommended_actions ? _vtContract.recommended_actions.length : 0) +
        ' | missionSignal=' + !!_vtContract.mission_signals);

      // ── Phase 47: MissionExtractor ────────────────────────────────
      if (window.AIOS.MissionExtractor) {
        var _vtMissionAction = window.AIOS.MissionExtractor.process(
          _vtContract,
          (window.AIOS.Mission && window.AIOS.Mission.current) || null
        );
        if (_vtMissionAction) {
          console.log('[AIOS][VOICE-MISSION] action=' + _vtMissionAction.action +
            ' | type=' + (_vtMissionAction.mission ? _vtMissionAction.mission.type : 'none'));
        }
      }

      // ── Phase 4.5: MissionState sync — mirrors Phase 46 text-path behavior ──
      // Text path calls MissionState.syncFromAIOS() + saveConversation() after every
      // AI response. Voice path ran MissionExtractor but never synced, so
      // voice-created/updated missions never reached the snapshot store.
      try {
        if (window.AIOS && window.AIOS.MissionState) {
          window.AIOS.MissionState.syncFromAIOS();
          window.AIOS.MissionState.saveConversation(conversationHistory);
        }
      } catch (_p45SyncErr) { /* never block voice transport */ }

      // Store on window for Inspector/dashboard access
      window.AIOS._lastContract = _vtContract;
      // Phase CR: persist display subset for cross-navigation continuity
      try { localStorage.setItem('aaai_contract_display', JSON.stringify({ recommended_actions: (_vtContract.recommended_actions || []).slice(0, 5), resources: (_vtContract.resources || []).slice(0, 10), risk_flags: _vtContract.risk_flags || [], _savedAt: Date.now() })); } catch (_cr1) { /* non-critical */ }

      // ── Phase 50: Resource Matcher (async, non-blocking) ──────────
      if (window.AIOS.ResourceMatcher) {
        var _vtProfile = _vtCtx.profile || null;
        (function(_contract) {
          window.AIOS.ResourceMatcher.match(_contract, _vtProfile).then(function(matches) {
            _contract.matched_resources = matches;
            window.AIOS._lastMatches = matches;
            if (matches.length > 0) {
              console.log('[AIOS][VOICE-MATCHER] matched ' + matches.length +
                ' resources | top=' + matches[0].name +
                ' (confidence=' + matches[0].confidence + ')');
            } else {
              console.log('[AIOS][VOICE-MATCHER] no matches for this voice response');
            }
          });
        })(_vtContract);
      }

      // ── Phase 49: ActionBar — immediate render with regex contract ─
      // Called after addMessage() so the .message--ai DOM element exists.
      if (window.AIOS.ActionBar && chatMessages) {
        var _vtMsgs = chatMessages.querySelectorAll('.message--ai');
        var _vtLastMsg = _vtMsgs.length > 0 ? _vtMsgs[_vtMsgs.length - 1] : null;
        if (_vtLastMsg) {
          var _vtRendered = window.AIOS.ActionBar.render(_vtContract, _vtLastMsg);
          if (_vtRendered) {
            scrollToBottom();
          }
        }
      }

      // ── Phase 4.2: Async structured classification via Claude ──────
      // Fire-and-forget: sends voice response text to Claude for Phase 4.1
      // structured output. Runs in background — voice transport and UI never blocked.
      // When structured arrives, upgrades contract from regex → Phase 4.1 quality
      // using the same _buildContractFromStructured() path as the text pipeline.
      // Seq guard ensures stale results from prior responses are discarded.
      // Phase 5: AbortController + 45s timeout — mirrors callChatEndpoint() pattern.
      (function(_seq, _aiText) {
        // Phase 5: 45-second AbortController — prevents classification fetch from
        // hanging indefinitely. Raised from 15s to match callChatEndpoint().
        var _vtController = new AbortController();
        var _vtTimeout = setTimeout(function() {
          _vtController.abort();
        }, 45000);

        fetch(CONFIG.apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content: '[VOICE RESPONSE CLASSIFICATION]\n' + _aiText
              }
            ],
            system_suffix: '\n\n## VOICE CLASSIFICATION\nThe user message above is a completed AI voice response already delivered to the veteran. Call record_structured_output to classify its content. Write no response text — the tool call is the only output needed.'
          }),
          signal: _vtController.signal
        })
        .then(function(r) {
          clearTimeout(_vtTimeout);
          return r.json();
        })
        .then(function(data) {
          // Seq guard: discard if a newer voice response has since started processing
          if (_voiceStructuredSeq !== _seq) return;
          if (!data || !data.structured) {
            console.log('[AIOS][VOICE-STRUCTURED] no structured output from classification call');
            return;
          }
          // ── Upgrade contract using same Phase 4.1 path as text pipeline ──
          var _upgraded = _buildContractFromStructured(data.structured, _aiText);
          window.AIOS._lastStructured = data.structured;
          window.AIOS._lastContract   = _upgraded;
          // Phase CR: persist display subset for cross-navigation continuity
          try { localStorage.setItem('aaai_contract_display', JSON.stringify({ recommended_actions: (_upgraded.recommended_actions || []).slice(0, 5), resources: (_upgraded.resources || []).slice(0, 10), risk_flags: _upgraded.risk_flags || [], _savedAt: Date.now() })); } catch (_cr2) { /* non-critical */ }
          console.log('[AIOS][VOICE-STRUCTURED] mode=' + _upgraded.mode +
            ' | checklist_items=' + (data.structured.checklist_items ? data.structured.checklist_items.length : 0) +
            ' | missions=' + (data.structured.missions ? data.structured.missions.length : 0) +
            ' | doc_actions=' + (data.structured.document_actions ? data.structured.document_actions.length : 0) +
            ' | dashboard_hint=' + (data.structured.dashboard_hint || 'none') +
            ' | report_ready=' + !!data.structured.report_ready);

          // ── AGENTIC: Save document actions from voice-structured path ──
          // Phase 44 gate: if voice routing already handled this as a generation
          // request, do NOT save raw transcript via _processDocumentActions.
          if (_voiceRouteHandled) {
            console.log('[AIOS][VOICE-STRUCTURED] _voiceRouteHandled=true — skipping _processDocumentActions (Phase 44 already routed)');
            _voiceRouteHandled = false; // reset for next voice response
          } else {
          // Mirrors text-path Cases A, B, C synthesis — all three cases.
          if (!data.structured.document_actions || data.structured.document_actions.length === 0) {
            // Case A: report_ready or mode=report
            if (data.structured.report_ready || data.structured.mode === 'report') {
              data.structured.document_actions = [{
                action: 'save_report',
                template_type: 'benefits_report',
                title: 'Voice Session Benefits Report'
              }];
              console.log('[AIOS][VOICE-STRUCTURED] synthesized document_actions — report_ready/mode=report');
            // Case B: mode=template with real content
            } else if (data.structured.mode === 'template' && _aiText.length > 200) {
              var _vsSlug = 'document'; var _vsTitle = 'Generated Document';
              if (/power of attorney/i.test(_aiText))    { _vsSlug = 'power_of_attorney';    _vsTitle = 'Power of Attorney'; }
              else if (/living will/i.test(_aiText))      { _vsSlug = 'living_will';          _vsTitle = 'Living Will'; }
              else if (/resume/i.test(_aiText))           { _vsSlug = 'resume';               _vsTitle = 'Resume'; }
              else if (/nexus letter/i.test(_aiText))     { _vsSlug = 'nexus_letter';         _vsTitle = 'Nexus Letter'; }
              else if (/appeal letter/i.test(_aiText))    { _vsSlug = 'va_appeal';            _vsTitle = 'VA Appeal Letter'; }
              else if (/personal statement/i.test(_aiText)) { _vsSlug = 'personal_statement'; _vsTitle = 'VA Personal Statement'; }
              else if (/action plan/i.test(_aiText))      { _vsSlug = 'action_plan';          _vsTitle = 'Action Plan'; }
              data.structured.document_actions = [{ action: 'save_template', template_type: _vsSlug, title: _vsTitle }];
              console.log('[AIOS][VOICE-STRUCTURED] synthesized document_actions — mode=template → ' + _vsSlug);
            // Case C: long substantive response, no mode signal (Fix 6: broadened keywords)
            } else if (_aiText.trim().split(/\s+/).length >= 80 &&
                       /\b(benefit|disability|rating|eligibility|va |gi bill|housing|education|career|health|service|connected|compensation|pension|appeal|claim|resume|letter|statement|plan|budget|transition|employment|interview|nexus)\b/i.test(_aiText)) {
              data.structured.document_actions = [{ action: 'save_template', template_type: 'benefits_report', title: 'Voice Session Benefits Report' }];
              console.log('[AIOS][VOICE-STRUCTURED] hard-fallback synthesized document_actions for long voice response');
            }
          }
          // FIX D: Chain dashboard handoff on _processDocumentActions save success
          var _vsDocResult = _processDocumentActions(data.structured, _aiText);
          if (_vsDocResult && typeof _vsDocResult.then === 'function') {
            _vsDocResult.then(function(anySaved) {
              if (anySaved) {
                var _vsHint = data.structured.dashboard_hint || (data.structured.report_ready ? 'show_reports' : 'show_profile');
                _injectDashboardHandoff(_vsHint);
              }
            });
          }
          } // end Phase 44 gate else block

          // ── AGENTIC: Persist checklist items from voice-structured path ──
          if (data.structured.checklist_items && data.structured.checklist_items.length > 0 &&
              window.AIOS && window.AIOS.Checklist &&
              typeof window.AIOS.Checklist.addItem === 'function') {
            data.structured.checklist_items.forEach(function(item) {
              if (!item || !item.title) return;
              window.AIOS.Checklist.addItem({
                title:       item.title,
                category:    item.category || 'immediate',
                description: item.description || '',
                source:      'voice_ai'
              });
            });
            console.log('[AIOS][VOICE-STRUCTURED] persisted ' + data.structured.checklist_items.length + ' checklist items');
          }

          // ── AGENTIC: Mission creation from voice-structured path ──
          if (data.structured.missions && Array.isArray(data.structured.missions)) {
            data.structured.missions.forEach(function(mSpec) {
              if (!mSpec || mSpec.action !== 'create' || !mSpec.type) return;
              _createMissionWithDefaults(mSpec.type);
            });
          }

          // ── AGENTIC: report_ready triggers showReportActions + auto-save ──
          if (data.structured.report_ready && _aiText.length >= 400) {
            showReportActions(_aiText);
          }

          // ── AGENTIC: Dashboard handoff from voice-structured path ──
          // FIX D: report_ready defers to _processDocumentActions.then()
          // REMOVED: dashboard_hint alone — fires without save confirmation.
          // Handoff for docs/reports now gated on _processDocumentActions success.
          if (data.structured.report_ready) {
            // Deferred — _processDocumentActions handles handoff via its .then() callback
            console.log('[AIOS][VOICE-STRUCTURED] report_ready — dashboard handoff deferred to _processDocumentActions');
          } else if (data.structured.document_actions && data.structured.document_actions.length > 0) {
            // Also deferred — handled by _processDocumentActions .then()
            console.log('[AIOS][VOICE-STRUCTURED] document_actions — dashboard handoff deferred to _processDocumentActions');
          } else if (data.structured.checklist_items && data.structured.checklist_items.length > 0) {
            _injectDashboardHandoff('show_checklist');
          }

          // Re-render ActionBar with upgraded structured contract
          if (window.AIOS.ActionBar && chatMessages) {
            var _vtMsgs2 = chatMessages.querySelectorAll('.message--ai');
            var _vtLastMsg2 = _vtMsgs2.length > 0 ? _vtMsgs2[_vtMsgs2.length - 1] : null;
            if (_vtLastMsg2) {
              window.AIOS.ActionBar.render(_upgraded, _vtLastMsg2);
            }
          }
        })
        .catch(function(e) {
          clearTimeout(_vtTimeout);
          if (e.name === 'AbortError') {
            // Timeout — fail silently. Voice transport and UI are unaffected.
            console.log('[AIOS][VOICE-STRUCTURED] classification timed out after 15s — ignored');
            return;
          }
          console.warn('[AIOS][VOICE-STRUCTURED] classification call failed:', e.message || e);
        });
      })(_vtSeq, aiResponse);

    } catch (_vtErr) {
      // Failure is always silent — voice transport continues unaffected.
      console.warn('[AIOS][VOICE-INTELLIGENCE] pipeline error:', _vtErr.message || _vtErr);
    }
  }

  // ══════════════════════════════════════════════════════
  //  VOICE SESSION — OpenAI Realtime via WebRTC
  // ══════════════════════════════════════════════════════
  function startVoiceSession() {
    if (typeof window.RealtimeVoice === 'undefined') {
      log('startVoiceSession', 'ERROR — RealtimeVoice not loaded');
      setVoiceUI('error', 'Voice engine not available. Try refreshing.');
      return;
    }

    log('startVoiceSession', 'wiring callbacks and connecting');
    voiceGreetingSent = false;
    var _lastVoiceText = ''; // Phase FBP: per-session dedup guard — prevents duplicate user bubbles
    var _lastVoiceTime = 0; // Phase 2.1: timestamp for time-windowed dedup (2s window)
    var _lastAIMessageText = ''; // Phase 4.2: dedup guard — prevents double-processing same AI response
    setVoiceUI('connecting', 'Connecting to voice...');

    // ── Watchdog: if voice never reaches listening/connected within 20s, abort cleanly ──
    // Prevents UI from hanging on "Connecting..." or "requesting token..." indefinitely.
    var _voiceWatchdog = setTimeout(function() {
      var currentVoiceState = typeof RealtimeVoice !== 'undefined' ? RealtimeVoice.getState() : 'idle';
      if (currentVoiceState === 'connecting') {
        log('startVoiceSession', 'WATCHDOG — voice never connected after 20s, aborting');
        if (typeof RealtimeVoice !== 'undefined') RealtimeVoice.disconnect();
        setVoiceUI('error', 'Voice is taking too long to connect. Please try again or use text chat.');
        inputMode = 'text';
        if (chatInputVoice) chatInputVoice.style.display = 'none';
        showToast('Voice timed out. Switched to text mode.');
      }
    }, 20000);

    // Wire callbacks
    RealtimeVoice.onStateChange = function(state, detail) {
      log('RT.onStateChange', state + (detail ? ': ' + detail : ''));

      switch (state) {
        case 'connecting':
          setVoiceUI('connecting', detail || 'Connecting...');
          break;
        case 'connected':
          clearTimeout(_voiceWatchdog); // voice is live — watchdog no longer needed
          setVoiceUI('listening');
          break;
        case 'listening':
          clearTimeout(_voiceWatchdog); // voice is live — watchdog no longer needed
          setVoiceUI('listening');
          if (!voiceGreetingSent) {
            voiceGreetingSent = true;
            RealtimeVoice.sendText('START_CONVERSATION');
          }
          break;
        case 'speaking':
          setVoiceUI('speaking');
          break;
        case 'error':
          clearTimeout(_voiceWatchdog);
          setVoiceUI('error', detail || 'Connection error');
          break;
        case 'idle':
          clearTimeout(_voiceWatchdog);
          setVoiceUI('idle');
          break;
      }
    };

    RealtimeVoice.onUserTranscript = function(text, isFinal) {
      if (isFinal) {
        log('RT.onUserTranscript', 'FINAL: ' + text.substring(0, 80));
        showCaption('You', text);
        // Quality gate: reject single-char, pure filler, or background-noise transcripts.
        // Phase 2.1: Whitelist meaningful short answers FIRST — these are real veteran
        // responses during intake (branch, yes/no, skip, etc.) and must NEVER be dropped.
        // Then apply noise/filler rejection only to non-whitelisted input.
        var trimmed = (text || '').trim();
        var _isValidShort = /^(yes|no|yeah|yep|nah|nope|ok|okay|sure|right|correct|skip|done|next|go ahead|not sure|that'?s?\s*(it|all)|army|navy|air\s*force|marines?|marine\s*corps|coast\s*guard|space\s*force|national\s*guard|reserves?|active\s*duty|honorable|general|other\s*than\s*honorable|rather\s*not\s*say|i'?m?\s*a?\s*family\s*member|thanks?(\s*you)?|great|cool|help|please|stop|wait|hold\s*on|go\s*back|repeat|what|disability|claim|benefits?|housing|education|career|job|va|medical|health|ptsd)\s*[\.\!\?]?\s*$/i.test(trimmed);
        if (!_isValidShort) {
          // Phase 2.5: Expanded noise rejection — catches background TV, music lyrics,
          // single repeated characters, and common Whisper hallucinations from silence.
          if (trimmed.length < 3 ||
              /^\s*(uh+|um+|hmm+|ah+|oh+|huh|er+|mhm+|mm+|hm+|hey|hi+|bye+|ugh+|whoa|wow|oh\s+wow|ha(ha)*|heh|tsk|psst|shh+|ahem|ooh+|eeh+|yawn|sigh)\s*[\.\!\?]?\s*$/i.test(trimmed) ||
              /^[\d\s\.\,\!\?\-\(\)\[\]]+$/.test(trimmed) ||
              /^(.)\1{3,}$/i.test(trimmed) ||
              /^(you|the|and|is|it|a|i|to|in|that|this|for|on|are|was|with|as|at|be|or|an|so|but|if|my|do|we|he|she|they)\s*[\.\!\?]?\s*$/i.test(trimmed) ||
              /^(music|laughter|applause|silence|background|noise|inaudible|♪|🎵)/i.test(trimmed) ||
              /^thank(s|\s*you)\s*for\s*(watching|listening|subscribing)/i.test(trimmed) ||
              // TV / ambient-audio rejection: common broadcast/media speech patterns
              // that are never intentional veteran input
              /^(and (now|today|tonight|here|next|we|coming|this|that)|coming up (next|after)|don'?t (miss|forget|go anywhere)|stay tuned|we'?ll be right back|after (the|this) break|brought to you by|this (program|show|episode|message)|next (on|up)|let'?s (take|go to|get back)|(right|back) after (this|these))\b/i.test(trimmed) ||
              /^(in (tonight'?s?|today'?s?|this) (show|episode|report|news|program)|your (host|anchor|reporter)|joining us (now|tonight|today)|welcome (back|to the show)|thank(s| you) for (joining|tuning in|being here|watching)|we'?re (back|live|here) (with|on|at))\b/i.test(trimmed) ||
              // Reject if speaker tag patterns appear (common in auto-captions / Whisper on TV)
              /^\[?(speaker|host|anchor|reporter|narrator|announcer|man|woman|male|female|child|audience)\s*\d*\]?\s*:/i.test(trimmed)) {
            log('RT.onUserTranscript', 'REJECTED (filler/noise): "' + trimmed + '"');
            return;
          }
        }
        // Phase 2.1: Time-windowed dedup — reject same text only within 2s window.
        // OpenAI Realtime can fire isFinal=true more than once for the same utterance,
        // but the same answer repeated after 2s is intentional (e.g. "yes" twice).
        var _now = Date.now();
        if (trimmed === _lastVoiceText && (_now - _lastVoiceTime) < 2000) {
          log('RT.onUserTranscript', 'DEDUP (duplicate <2s): "' + trimmed.substring(0, 40) + '"');
          return;
        }
        _lastVoiceText = trimmed;
        _lastVoiceTime = _now;
        // ── PHASE 1 VOICE STABILITY: Early generation intent detection ────────────
        // Detect generation requests HERE — before the AI speaks — to prevent:
        //   1. AI voice speaking a full response (5–10s of audio)
        //   2. THEN voice disconnecting
        //   3. THEN text pipeline firing (800ms later)
        // This caused: interruption mid-speech + double response (voice heard + text shown).
        //
        // Fix: kill voice immediately, route to text pipeline, return early.
        // onAIMessage's _vrIsGenRequest block is NOT reachable after disconnect,
        // so there is no double-response risk.
        var _earlyGenRegex = /\b(generate|create|draft|write|prepare|make me|build me|give me|produce|start|wrap up|finish|finalize|complete|assemble|compile|put together)\b.{0,80}\b(resume|cv|will|testament|power of attorney|poa|report|plan|letter|template|document|summary|audit|nexus|personal statement|action plan|claim|transition|financial|business|budget|linkedin|interview|checklist)\b/i;
        if (_earlyGenRegex.test(trimmed)) {
          log('RT.onUserTranscript', 'EARLY GEN INTENT — stopping voice, routing to text: "' + trimmed.substring(0, 60) + '"');
          // Show user bubble immediately so the request is visible
          addMessage(trimmed, 'user');
          conversationHistory.push({ role: 'user', content: trimmed });
          // Stop voice NOW — prevents AI from speaking before we switch pipelines
          if (typeof endVoiceSession === 'function') endVoiceSession();

          // ── PHASE 2: Fork by document type ──────────────────────────────
          // Resume/CV → deterministic template pipeline (no AI, no streaming).
          // Everything else → text pipeline via sendToAI (unchanged for now).
          var _isVoiceResumeReq = /\b(resume|cv)\b/i.test(trimmed);
          var _capturedText = trimmed; // capture for closure
          if (_isVoiceResumeReq) {
            // Phase 2.4: Capture follow-on doc intents before entering resume pipeline
            var _voiceFollowOns = _detectFollowOnDocs(_capturedText);
            if (_voiceFollowOns) window._resumeFollowOnDocs = _voiceFollowOns;
            // Template pipeline: set processing state, call _handleResumeGeneration
            // directly — no sendToAI, no AI round-trip, no streaming.
            setTimeout(function() {
              showAIWorkingState('resume');
              isProcessing = true;
              if (btnSend) btnSend.disabled = true;
              // Phase 2.3: _handleResumeGeneration now always returns true
              // (all exit paths handled internally — no AI fallback)
              _handleResumeGeneration(_capturedText);
            }, 300);
          } else {
            // Will, POA, action plan, etc. — text pipeline for now
            var _earlyGenPrompt = 'The veteran just asked via voice: "' + _capturedText + '". Generate the requested document now in full using all context from our conversation. Use proper headings and formatting.';
            setTimeout(function() { sendToAI(_earlyGenPrompt); }, 300);
          }
          // ── END PHASE 2 FORK ─────────────────────────────────────────────
          return; // skip submitUserText voiceOnly + _aiosVoiceUpdate — not needed
        }
        // ── END PHASE 1 VOICE STABILITY ──────────────────────────────────────────
        // Phase 33: render bubble + escalation check via shared path (voiceOnly — Realtime drives response)
        submitUserText(trimmed, { voiceOnly: true, path: 'voice' });
        // Phase 36: use trimmed (consistent with bubble + memory extraction)
        conversationHistory.push({ role: 'user', content: trimmed });
        // Phase 32: Telemetry — voice transcript accepted
        if (window.AIOS && window.AIOS.Telemetry) { window.AIOS.Telemetry.record('voice_transcript_accepted', {}); }
        // Phase 19: AIOS voice intelligence — memory, mission, routing, session.update
        _aiosVoiceUpdate(text);
      } else {
        showCaption('You', text);
      }
    };

    RealtimeVoice.onAITranscript = function(text, isFinal) {
      showCaption('AI', text);
      if (isFinal) {
        log('RT.onAITranscript', 'FINAL: ' + text.substring(0, 80));
      }
    };

    RealtimeVoice.onAIMessage = function(fullText) {
      // Phase 4.2: dedup guard — response.audio_transcript.done and response.cancelled
      // can both fire for the same response in edge cases (user interrupts then reconnects).
      // Skip if this exact text was already processed in this voice session.
      if (fullText === _lastAIMessageText) {
        log('RT.onAIMessage', 'DEDUP — identical response skipped, len=' + fullText.length);
        return;
      }
      _lastAIMessageText = fullText;

      log('RT.onAIMessage', 'length=' + fullText.length);
      // Phase 36: Add AI voice response to conversationHistory so the Claude text model
      // has continuity if the user switches from voice to text mid-session.
      // Compact to 800 chars max — preserves meaningful context without flooding the token window.
      var _vcAI = fullText.length > 800 ? fullText.substring(0, 797) + '…' : fullText;
      conversationHistory.push({ role: 'assistant', content: _vcAI });
      // Set reportGenerated before addMessage so injectLegalDocButton gate passes for report
      if (!reportGenerated && isReportResponse(fullText)) {
        reportGenerated = true;
      }
      addMessage(fullText, 'ai');
      hideCaption();

      // Show topic bubbles once after voice greeting
      if (!topicBubblesShown) {
        topicBubblesShown = true;
        renderTopicBubbles();
      }

      // Show Generate Report button when conditions met
      maybeShowReportButton();

      // VOICE INTELLIGENCE CONNECTED - Phase 1 Fix
      // Run Phase 47-50 pipeline on this completed voice AI response.
      // Called here (after addMessage) so the .message--ai DOM element
      // exists for ActionBar.render(). Passes _lastVoiceText so
      // ResponseContract gets the same routing context as text mode.
      _voiceIntelligencePipeline(fullText, _lastVoiceText);

      // ── Phase 44 — VOICE → DOCUMENT ROUTING ─────────────────────────
      // Voice is intake only. When the user requests a document, route to
      // the proven template engine or text pipeline. Never save raw voice
      // transcript as document content.
      var _vrUserText = _lastVoiceText || '';
      var _vrIsGenRequest = /\b(generate|create|draft|write|prepare|make me|build me|give me|produce|start|wrap up|finish|finalize|complete|assemble|compile|put together)\b.{0,80}\b(resume|cv|will|testament|power of attorney|poa|report|plan|letter|template|document|summary|audit|nexus|personal statement|action plan|claim|transition|financial|business|budget|linkedin|interview|checklist)\b/i.test(_vrUserText);
      try {

        if (_vrIsGenRequest) {
          // Gate the async voice-structured path — prevents raw transcript save
          _voiceRouteHandled = true;
          console.log('[VOICE-ROUTING] _voiceRouteHandled=true — async classification will skip _processDocumentActions');

          // ── Phase DOC-GEN: ALL voice generation requests route through text pipeline ──
          // Template engine popup is bypassed.  The AI generates the document inline,
          // _processDocumentActions saves it to dashboard, and streamMessage shows a
          // confirmation instead of the full document.  Template pages remain available
          // for manual use — this only changes the voice-initiated path.
          {
            console.log('[VOICE-ROUTING] generation request → text pipeline (AI-driven doc gen)');
            var _vrTextPrompt = 'The veteran just asked via voice: "' + _vrUserText + '". Generate the requested document now in full using all context from our conversation. Use proper headings and formatting.';
            if (typeof endVoiceSession === 'function') endVoiceSession();
            setTimeout(function() { sendToAI(_vrTextPrompt); }, 800);
          }
          // Do NOT save raw transcript — exit early
          return;
        }

        // Non-generation response: only inject dashboard handoff if AI verbally
        // confirmed a save in past tense. Never save raw transcript as document.
        var _vAiSavedPhrase = /\b(saved to your (dashboard|profile)|on your (dashboard|profile)|available on your (dashboard|profile)|head over to (your )?(dashboard|profile)|view (it |them )?on your (dashboard|profile)|download it from (your )?(dashboard|profile)|added (it |them )?to your (dashboard|profile)|it(?:'s| is) (saved|ready) on your (dashboard|profile))\b/i.test(fullText);
        if (!reportGenerated && _vAiSavedPhrase) {
          _injectDashboardHandoff('show_profile');
          console.log('[VOICE-ROUTING] non-generation: dashboard handoff on save-phrase');
        }
      } catch (_vrErr) {
        console.warn('[VOICE-ROUTING] error:', _vrErr.message || _vrErr);
      }

      // FIX B: Report detection runs AFTER Phase 44 routing.
      // If _vrIsGenRequest is true the template engine / text pipeline owns
      // this response — never show the transcript report UI.
      if (!_vrIsGenRequest && isReportResponse(fullText)) {
        log('Report', 'detected (voice) — showing actions');
        reportGenerated = true;
        showReportActions(fullText);
      }
      // ── End Phase 44 ─────────────────────────────────────────────────
    };

    RealtimeVoice.onError = function(error) {
      clearTimeout(_voiceWatchdog);
      log('RT.onError', typeof error === 'string' ? error.substring(0, 200) : String(error));
      // Phase 5: voice error recovery — clean shutdown + guaranteed state reset + text fallback
      try { if (typeof RealtimeVoice !== 'undefined') RealtimeVoice.disconnect(); } catch(e) {}
      voiceGreetingSent = false;
      isProcessing = false;
      if (btnSend) btnSend.disabled = false;
      inputMode = 'text';
      if (chatInputVoice) chatInputVoice.style.display = 'none';
      if (chatInputText) chatInputText.style.display = 'block';
      hideCaption();
      updateModeIcon();
      setVoiceUI('idle');
      addMessage('Voice session ended \u2014 switching to text so we can keep going.', 'ai');
      if (userInput) userInput.focus();
    };

    // Connect
    RealtimeVoice.connect();
  }

  function endVoiceSession() {
    log('endVoiceSession', 'user ended session');
    if (typeof RealtimeVoice !== 'undefined') {
      RealtimeVoice.disconnect();
    }
    setVoiceUI('idle');
    hideCaption();

    // Switch to text mode
    inputMode = 'text';
    if (chatInputVoice) chatInputVoice.style.display = 'none';
    if (chatInputText) chatInputText.style.display = 'block';
    updateModeIcon();
    if (userInput) userInput.focus();
    showToast('Voice session ended. You can type instead.');
  }

  function toggleMute() {
    if (typeof RealtimeVoice === 'undefined') return;

    if (RealtimeVoice.isMuted()) {
      RealtimeVoice.unmute();
      setVoiceUI('listening');
      updateMuteButton(false);
    } else {
      RealtimeVoice.mute();
      setVoiceUI('muted');
      updateMuteButton(true);
    }
  }

  function updateMuteButton(isMuted) {
    var btn = $('btnVoiceMute');
    if (!btn) return;
    if (isMuted) {
      btn.classList.add('is-muted');
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> Unmute';
    } else {
      btn.classList.remove('is-muted');
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> Mute';
    }
  }

  // ══════════════════════════════════════════════════════
  //  TEXT MESSAGING (unchanged — uses /api/chat)
  // ══════════════════════════════════════════════════════
  function sendTextMessage() {
    if (!userInput) return;
    var text = userInput.value.trim();
    if (!text || text.length < 2 || isProcessing) return;

    userInput.value = '';
    userInput.style.height = 'auto';
    submitUserText(text, { path: 'text' });
  }

  // ══════════════════════════════════════════════════════
  //  SHARED USER-TEXT SUBMISSION (Phase 33)
  //  Single canonical path for all non-typed user inputs:
  //  chips, topic bubbles, option buttons, voice transcripts.
  //
  //  opts.voiceOnly  {boolean} — render bubble + escalation check,
  //                              but skip sendToAI (Realtime API handles response)
  //  opts.topicLabel {string}  — push label into window.activeUserTopics so
  //                              callChatEndpoint injects the ACTIVE USER TOPICS block
  //  opts.path       {string}  — source label for logging:
  //                              'voice'       — voice transcript (always voiceOnly:true)
  //                              'text'        — typed text submission
  //                              'chip'        — AIOS.Chips quick-trigger
  //                              'option-btn'  — in-chat option button click
  //                              'ui-click'    — any other UI element (default)
  //
  //  INPUT ROUTING RULES (enforced inside this function):
  //    1. opts.voiceOnly=true          → return after bubble+escalation (Realtime drives)
  //    2. inputMode='voice' + active   → route via RealtimeVoice.sendText (NOT sendToAI)
  //    3. text mode                    → sendToAI / queue
  // ══════════════════════════════════════════════════════
  function submitUserText(text, opts) {
    opts = opts || {};
    var trimmed = (text || '').trim();
    if (!trimmed || trimmed.length < 2) return;

    // Register optional topic label so AIOS callChatEndpoint injects the topic context block
    if (opts.topicLabel) {
      if (!Array.isArray(window.activeUserTopics)) { window.activeUserTopics = []; }
      if (window.activeUserTopics.indexOf(opts.topicLabel) === -1) {
        window.activeUserTopics.push(opts.topicLabel);
      }
    }

    // Always render the user bubble — never silently dropped
    addMessage(trimmed, 'user');
    showCaption('You', trimmed);

    // Escalation check — show safety banners and record telemetry
    var _erS = (window.AIOS && window.AIOS.Router) ? window.AIOS.Router.routeAIOSIntent(trimmed) : null;
    if (_erS && _erS.tier === 'CRISIS') {
      showCrisisBanner();
      if (window.AIOS && window.AIOS.Telemetry) { window.AIOS.Telemetry.record('escalation_triggered', { tier: 'CRISIS', path: opts.path || 'text' }); }
    } else if (_erS && _erS.tier === 'AT_RISK') {
      showAtRiskBanner();
      if (window.AIOS && window.AIOS.Telemetry) { window.AIOS.Telemetry.record('escalation_triggered', { tier: 'AT_RISK', path: opts.path || 'text' }); }
    }

    // ── Phase 2.2: Auto-resume pending resume generation ──────────────
    // If _handleResumeGeneration asked a question (e.g. branch), the user's
    // next message auto-triggers generation — no re-command needed.
    // Runs BEFORE voiceOnly return and BEFORE sendToAI.
    if (window._pendingResumeBuild) {
      // Expire stale pending builds (> 5 minutes)
      if (Date.now() - window._pendingResumeBuild.timestamp > 300000) {
        console.log('[RESUME] Pending build expired (>5min) — clearing');
        window._pendingResumeBuild = null;
        window._resumeFollowOnDocs = null;
      } else {
        var _pending = window._pendingResumeBuild;
        window._pendingResumeBuild = null;
        console.log('[RESUME] Resuming pending build (missingField=' + (_pending.missingField || 'none') + ') after user answered: "' + trimmed.substring(0, 40) + '"');

        // Push the answer into history
        conversationHistory.push({ role: 'user', content: trimmed });

        // ── Phase 2.4: Field-specific extraction ──────────────────────────
        if (_pending.missingField === 'name') {
          // Direct name assignment — strip common prefixes like "my name is", "I'm", "call me"
          var _nameAnswer = trimmed
            .replace(/^(?:my\s+(?:full\s+)?name\s+is|i'?m|i\s+am|call\s+me|it'?s|they\s+call\s+me)\s+/i, '')
            .replace(/[.!?]+$/, '')
            .trim();
          if (_nameAnswer && window.AIOS && window.AIOS.Memory) {
            window.AIOS.Memory.profile = window.AIOS.Memory.mergeMemory(
              window.AIOS.Memory.profile, { name: _nameAnswer }
            );
            console.log('[RESUME] Name set directly from answer: "' + _nameAnswer + '"');
          }
        } else {
          // Branch or general: run standard memory extraction
          if (window.AIOS && window.AIOS.Memory && typeof window.AIOS.Memory.extractMemoryFromInput === 'function') {
            try {
              var _memEx = window.AIOS.Memory.extractMemoryFromInput(trimmed);
              if (_memEx && Object.keys(_memEx).length > 0) {
                window.AIOS.Memory.profile = window.AIOS.Memory.mergeMemory(window.AIOS.Memory.profile, _memEx);
                console.log('[RESUME] Memory extracted from answer:', Object.keys(_memEx).join(', '));
              }
            } catch (_e) { console.warn('[RESUME] Memory extraction error:', _e); }
          }
          // Phase 2.4: Fallback branch detection for variations like "the army", "us navy", etc.
          if (_pending.missingField === 'branch') {
            var _profile = (window.AIOS && window.AIOS.Memory) ? window.AIOS.Memory.profile : {};
            if (!_profile.branch) {
              var _branchFallback = trimmed.replace(/^(?:the|us|u\.s\.?|united\s+states)\s+/i, '').trim();
              var _validBranches = ['army', 'navy', 'air force', 'marine corps', 'marines', 'coast guard', 'space force', 'national guard'];
              var _lowerFallback = _branchFallback.toLowerCase();
              for (var _bi = 0; _bi < _validBranches.length; _bi++) {
                if (_lowerFallback === _validBranches[_bi] || _lowerFallback.indexOf(_validBranches[_bi]) === 0) {
                  var _matchedBranch = _validBranches[_bi].replace(/\b\w/g, function(c) { return c.toUpperCase(); });
                  window.AIOS.Memory.profile = window.AIOS.Memory.mergeMemory(
                    window.AIOS.Memory.profile, { branch: _matchedBranch }
                  );
                  console.log('[RESUME] Branch set via fallback detection: "' + _matchedBranch + '"');
                  break;
                }
              }
            }
          }
        }
        // ── END Phase 2.4 field-specific extraction ───────────────────────

        // Restore followOnDocs from pending state if not already set globally
        if (_pending.followOnDocs && !window._resumeFollowOnDocs) {
          window._resumeFollowOnDocs = _pending.followOnDocs;
        }

        // If voice is active, end it — resume pipeline needs text mode
        if (inputMode === 'voice' && typeof endVoiceSession === 'function') {
          endVoiceSession();
        }
        setTimeout(function() {
          showAIWorkingState('resume');
          isProcessing = true;
          if (btnSend) btnSend.disabled = true;
          // Phase 2.3: _handleResumeGeneration always returns true — no AI fallback
          _handleResumeGeneration(_pending.originalRequest);
        }, 300);
        return;
      }
    }
    // ── END Phase 2.4 auto-resume ─────────────────────────────────────

    // Phase 2.3: If resume execution lock is active, block ALL AI routing.
    // This catches any stray message that slips past the pending-resume check.
    if (window._resumeExecutionLock) {
      console.log('[LOCK] submitUserText blocked — resume execution in progress. text="' + trimmed.substring(0, 40) + '"');
      return;
    }

    // Voice-only: bubble + escalation is sufficient; Realtime API drives the response
    if (opts.voiceOnly) { return; }

    // ── VOICE SESSION GUARD ────────────────────────────────────────────────────────
    // Any UI-triggered call (chip, option button, topic bubble, etc.) that reaches
    // submitUserText during an ACTIVE voice session MUST route through the Realtime
    // API — never through sendToAI (text path).
    //
    // Root cause of "clicks trigger AI responses" bug:
    //   option buttons and chips called submitUserText() without voiceOnly:true,
    //   so they fell through to sendToAI() while the Realtime session was live.
    //
    // Fix: if voice session is active (not idle/error), inject via RealtimeVoice.sendText
    //      and return — NEVER call sendToAI.
    if (inputMode === 'voice' && typeof RealtimeVoice !== 'undefined' && RealtimeVoice.getState) {
      var _vsGuard = RealtimeVoice.getState();
      if (_vsGuard !== 'idle' && _vsGuard !== 'error') {
        var _guardSrc = opts.path || 'ui-click';
        log('[INPUT]', 'VOICE guard — src=' + _guardSrc + ' state=' + _vsGuard + ' text="' + trimmed.substring(0, 40) + '"');
        if (RealtimeVoice.sendText) { RealtimeVoice.sendText(trimmed); }
        conversationHistory.push({ role: 'user', content: trimmed });
        return;
      }
    }
    // ── END VOICE SESSION GUARD ───────────────────────────────────────────────────

    // ── TEXT-PATH TEMPLATE ROUTING — DISABLED ──────────────────────────────────
    // DISABLED: This block bypassed sendToAI(), RequestBuilder, memory injection,
    // and document context — routing to a detached popup that started from scratch.
    // All document generation now flows through the main chat pipeline so the AI
    // sees full conversation history, uploaded documents, and AIOS.Memory profile.
    // Original block preserved for reference during inline-generation migration.
    /*
    if (window.AAAI && window.AAAI.templates && typeof window.AAAI.templates.detectForTask === 'function') {
      var _txtTemplateId = window.AAAI.templates.detectForTask(trimmed);
      if (_txtTemplateId && typeof window.AAAI.templates.launch === 'function') {
        log('[INPUT]', 'TEXT path → template engine: ' + _txtTemplateId);
        addMessage('Launching the ' + _txtTemplateId.replace(/_/g, ' ') + ' builder — I\'ll ask a few quick questions to personalize it for you.', 'ai');
        conversationHistory.push({ role: 'assistant', content: 'Launching the ' + _txtTemplateId.replace(/_/g, ' ') + ' builder.' });
        setTimeout(function() { window.AAAI.templates.launch(_txtTemplateId, null, null); }, 600);
        return;
      }
    }
    */
    // ── END TEXT-PATH TEMPLATE ROUTING ────────────────────────────────────────────

    // ── FORCE PATH: Typed resume generation — cold-start + confirmation ──
    // Two triggers:
    //  A) Cold-start: explicit "build/generate/create my resume" even without prior context
    //  B) Confirmation: lighter keywords ("yes", "go") when already in a resume context
    var _typedResumeColdStart = /\b(build|generate|create|write|make|draft|prepare)\b.{0,30}\b(my\s+)?(resume|cv)\b/i.test(trimmed);
    var _typedResumeConfirm = /\b(build|generate|create|write|start|yes|go ahead|do it|make)\b.*\b(resume|cv)\b/i.test(trimmed) ||
      /\b(resume|cv)\b.*\b(now|please|yes|go|build|generate)\b/i.test(trimmed);
    var _typedResumeCtx = (activeDocumentType && /resume/i.test(activeDocumentType)) ||
      conversationHistory.some(function(m) {
        return m.role === 'assistant' && /resume/i.test(m.content || '') && conversationHistory.indexOf(m) > conversationHistory.length - 6;
      });
    if ((_typedResumeColdStart || (_typedResumeConfirm && _typedResumeCtx)) && !isProcessing) {
      // Phase 2.4: Capture follow-on doc intents before entering resume pipeline
      var _typedFollowOns = _detectFollowOnDocs(trimmed);
      if (_typedFollowOns) window._resumeFollowOnDocs = _typedFollowOns;
      // Phase 2.3: Route to deterministic template pipeline — no AI
      console.log('[PHASE2.3] Typed resume detected: "' + trimmed + '" — template pipeline (cold=' + _typedResumeColdStart + ' confirm=' + _typedResumeConfirm + ' ctx=' + _typedResumeCtx + ')');
      showAIWorkingState('resume');
      isProcessing = true;
      if (btnSend) btnSend.disabled = true;
      _handleResumeGeneration(trimmed);
      return;
    }

    // Text mode: send immediately, or queue for when the current response finishes
    log('[INPUT]', 'TEXT path — src=' + (opts.path || 'text') + ' text="' + trimmed.substring(0, 40) + '"');
    if (!isProcessing) {
      sendToAI(trimmed);
    } else {
      // Newest submission wins — replace any earlier pending entry
      pendingUserSubmission = { text: trimmed, opts: opts || {} };
      log('[AAAI]', 'queued user submission while processing: "' + trimmed.substring(0, 40) + '"');
      // Failsafe: if isProcessing never clears (stuck stream, unhandled error), force-flush after 5s
      var _failsafeText = trimmed;
      setTimeout(function() {
        if (pendingUserSubmission && pendingUserSubmission.text === _failsafeText) {
          var _fallback = pendingUserSubmission;
          pendingUserSubmission = null;
          log('[AAAI]', 'FAILSAFE flush triggered: "' + _fallback.text.substring(0, 40) + '"');
          sendToAI(_fallback.text);
        }
      }, 5000);
    }
  }

  // ── Mode switching ──
  function switchToVoice() {
    log('switchToVoice', '');
    inputMode = 'voice';
    if (chatInputText) chatInputText.style.display = 'none';
    if (chatInputVoice) chatInputVoice.style.display = 'block';

    // Force captions on
    captionsEnabled = true;
    window.__aaaiCaptionsEnabled = true;
    updateCaptionsButton();
    if (captionsOverlay) captionsOverlay.style.display = 'block';

    updateModeIcon();
    startVoiceSession();
  }

  function switchToText() {
    log('switchToText', '');
    if (typeof RealtimeVoice !== 'undefined') {
      RealtimeVoice.disconnect();
    }
    inputMode = 'text';
    if (chatInputVoice) chatInputVoice.style.display = 'none';
    if (chatInputText) chatInputText.style.display = 'block';
    updateModeIcon();
    if (userInput) userInput.focus();
  }

  function toggleMode() {
    if (inputMode === 'text') switchToVoice();
    else switchToText();
  }

  function updateModeIcon() {
    var micIcon = $('modeIconMic');
    var kbdIcon = $('modeIconKbd');
    if (!micIcon || !kbdIcon) return;
    if (inputMode === 'text') {
      micIcon.style.display = 'block';
      kbdIcon.style.display = 'none';
    } else {
      micIcon.style.display = 'none';
      kbdIcon.style.display = 'block';
    }
  }

  // ══════════════════════════════════════════════════════
  //  CAPTIONS SYSTEM
  // ══════════════════════════════════════════════════════
  function toggleCaptions() {
    captionsEnabled = !captionsEnabled;
    window.__aaaiCaptionsEnabled = captionsEnabled;
    localStorage.setItem('aaai_pref_cc', String(captionsEnabled));
    updateCaptionsButton();

    if (captionsEnabled) {
      if (captionsOverlay) captionsOverlay.style.display = 'block';
      showToast('Closed captions enabled');
    } else {
      if (captionsOverlay) captionsOverlay.style.display = 'none';
      showToast('Closed captions disabled');
    }
  }

  function updateCaptionsButton() {
    var btn = $('btnCaptions');
    if (!btn) return;
    if (captionsEnabled) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      btn.title = 'Captions ON (click to disable)';
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
      btn.title = 'Captions OFF (click to enable)';
    }
  }

  function showCaption(speaker, text) {
    // In voice mode, captions are always on regardless of toggle
    if (inputMode !== 'voice' && !captionsEnabled) return;
    if (!captionsOverlay) return;
    captionsOverlay.style.display = 'block';
    if (captionsLabel) captionsLabel.textContent = speaker === 'AI' ? 'AI' : 'You';
    if (captionsText) captionsText.textContent = text;
    captionsOverlay.classList.add('cc-visible');
  }

  function hideCaption() {
    if (!captionsOverlay) return;
    captionsOverlay.classList.remove('cc-visible');
    setTimeout(function() {
      if (!captionsOverlay.classList.contains('cc-visible')) {
        if (captionsText) captionsText.textContent = '';
      }
    }, 3000);
  }

  // ══════════════════════════════════════════════════════
  //  CRISIS CHECK
  // ══════════════════════════════════════════════════════
  function checkCrisis(text) {
    var lower = text.toLowerCase();
    return CRISIS_KEYWORDS.some(function(kw) { return lower.includes(kw); });
  }

  // Phase 22 — AT_RISK detection (only call after checkCrisis() returns false)
  function checkAtRisk(text) {
    var lower = text.toLowerCase();
    return AT_RISK_KEYWORDS.some(function(kw) { return lower.includes(kw); });
  }

  // Phase 22 — AT_RISK in-chat message (softer than crisis — no fixed top bar)
  function showAtRiskBanner() {
    var div = document.createElement('div');
    div.className = 'message message--at-risk';
    div.innerHTML =
      '<strong>Veterans Support Resources</strong>' +
      '<p>VA Emergency Assistance: <a href="tel:18008271000">1-800-827-1000</a></p>' +
      '<p>Homeless Veterans Hotline: <a href="tel:18774243838">877-424-3838</a></p>' +
      '<p>Local Services (211): <a href="tel:211">Dial 211</a></p>' +
      '<p style="margin-top:8px;font-size:0.85rem;">You\'ve come to the right place. Let\'s find the right help together.</p>';
    if (chatMessages) chatMessages.appendChild(div);
    scrollToBottom();
  }

  function showCrisisBanner() {
    if (crisisBanner) crisisBanner.style.display = 'block';
    var crisisHtml =
      '<strong>Veterans Crisis Line</strong>' +
      '<p>Dial <a href="tel:988">988</a>, Press 1 &nbsp;|&nbsp; Text <a href="sms:838255">838255</a></p>' +
      '<p><a href="https://www.veteranscrisisline.net/get-help-now/chat/" target="_blank" rel="noopener noreferrer">Chat Online Now</a></p>' +
      '<p style="margin-top:8px;font-size:0.85rem;">Confidential. 24/7. You are not alone.</p>';
    var div = document.createElement('div');
    div.className = 'message message--crisis';
    div.innerHTML = crisisHtml;
    if (chatMessages) chatMessages.appendChild(div);

    if (role === 'ai') {
      setTimeout(function() {
        injectLegalDocButton(div, text);
      }, 0);
    }
    scrollToBottom();
  }

  // ══════════════════════════════════════════════════════
  //  AI COMMUNICATION (text mode only — voice uses Realtime)
  // ══════════════════════════════════════════════════════
  //  PHASE 2 — TEMPLATE-DRIVEN RESUME GENERATION
  //  Builds structured data from AIOS.Memory profile + conversation,
  //  generates .docx directly via legal-docx-generator, saves to
  //  dashboard, and shows a confirmation in chat.  Bypasses the AI
  //  entirely — no markdown round-trip.
  // ══════════════════════════════════════════════════════

  /**
   * Gathers resume data from AIOS.Memory profile and conversation history.
   * Returns a structured object matching the template-flow shape:
   *   { fullName, branch, mos, rank, yearsService, targetRole,
   *     keySkills, education, state, email, phone, location,
   *     serviceEntryDate, separationDate, vaRating }
   * Missing values get '[NOT PROVIDED]' so the docx is never blank.
   */
  function _buildResumeData() {
    var profile = (window.AIOS && window.AIOS.Memory && typeof window.AIOS.Memory.getProfile === 'function')
      ? window.AIOS.Memory.getProfile()
      : {};

    // Phase 2: Gather all uploaded doc text for direct extraction
    var _uploadedText = '';
    try {
      var _uctx = window.AIOS && window.AIOS._dashboardContext;
      if (_uctx && _uctx.uploadedDocs && _uctx.uploadedDocs.length) {
        _uploadedText = _uctx.uploadedDocs
          .map(function(d) { return d.extracted_text || ''; })
          .join('\n');
      }
    } catch (e) { /* non-fatal — proceed without doc text */ }

    // Calculate years of service from dates if available
    var yearsService = null;
    if (profile.serviceEntryDate && profile.separationDate) {
      try {
        var _entry = new Date(profile.serviceEntryDate);
        var _sep   = new Date(profile.separationDate);
        if (!isNaN(_entry) && !isNaN(_sep)) {
          yearsService = String(Math.max(1, Math.round((_sep - _entry) / (365.25 * 24 * 60 * 60 * 1000))));
        }
      } catch (e) { /* fall through to null */ }
    }

    // Mine conversation history for target role / skills / education
    var targetRole = null;
    var keySkills  = '';
    var education  = '';
    if (conversationHistory && conversationHistory.length) {
      var _allText = conversationHistory.map(function(m) { return m.content || ''; }).join('\n');

      // Target role: look for explicit mentions
      var _roleMatch = _allText.match(/(?:target(?:ing)?|seeking|interested in|want(?:s|ing)?\s+(?:a|to\s+be))\s+(?:a\s+)?([A-Za-z\s/&-]{3,40})\s+(?:role|position|job|career)/i);
      if (_roleMatch) targetRole = _roleMatch[1].trim();

      // Key skills: extract from AI-generated skill mentions
      var _skillMatch = _allText.match(/(?:skills?|competenc(?:ies|y)|strengths?)\s*[:—–-]\s*([^\n]{10,200})/i);
      if (_skillMatch) keySkills = _skillMatch[1].trim();

      // Education: extract mentions
      var _eduMatch = _allText.match(/(?:degree|bachelor|master|associate|diploma|certificate|B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?B\.?A\.?)\s*(?:in|of)?\s*([^\n]{3,100})/i);
      if (_eduMatch) education = _eduMatch[0].trim();
    }

    // FIX 2 — Education priority chain: profile (mined from docs) → uploaded text → conversation above
    if (!education && profile.education) {
      education = profile.education;
    }
    if (!education && _uploadedText) {
      var _docEduM = _uploadedText.match(/(?:bachelor(?:'?s)?|master(?:'?s)?|associate(?:'?s)?|ph\.?d\.?|degree)\s*(?:of|in)?\s*[A-Za-z\s,&'-]{3,60}/i);
      if (_docEduM) education = _docEduM[0].trim().replace(/\s+/g, ' ');
    }

    // FIX 3 — keySkills priority chain: conversation above → uploaded text → profile.civilianSkills → MOS generic fallback
    if (!keySkills && _uploadedText) {
      var _docSkillM = _uploadedText.match(/(?:skills?|competenc(?:ies|y)|qualifications?|technical\s+skills?|proficienc(?:y|ies))\s*[:\-–]\s*([^\n]{10,200})/i);
      if (_docSkillM) keySkills = _docSkillM[1].trim();
    }
    if (!keySkills && profile.civilianSkills) {
      keySkills = profile.civilianSkills;
    }

    // Translate MOS to civilian-friendly skills only when nothing better was found
    if (!keySkills && profile.mos) {
      keySkills = 'Leadership | Operations Management | Team Development | ' +
        'Mission Planning | Training & Mentoring | Process Improvement | ' +
        'Problem Solving | Communication';
    }
    if (!keySkills) keySkills = null;
    if (!education) education = null;

    // FIX 2 — Certifications: profile (mined from DD-214 Item 14) → direct doc text
    var certifications = profile.certifications || null;
    if (!certifications && _uploadedText) {
      var _certDocM = _uploadedText.match(/(?:item\s*14|military\s+education|certif(?:ication|ied)s?|training\s+(?:attended|completed))\s*[:\-]?\s*([^\n]{10,200})/i);
      if (_certDocM) certifications = _certDocM[1].trim().replace(/\s+/g, ' ');
    }

    // FIX 4 — Accomplishments: mine quantified / action-verb sentences from uploaded docs
    var accomplishments = null;
    if (_uploadedText) {
      var _acMatches = _uploadedText.match(/[A-Z][^\n.]{20,140}(?:\d+\s*(?:%|percent|personnel|soldiers?|troops?|vehicles?|missions?|systems?|Soldiers?)|(?:managed|led|trained|supervised|coordinated|directed|achieved|improved|reduced|increased))[^\n.]{0,80}/g);
      if (_acMatches && _acMatches.length) {
        accomplishments = _acMatches.slice(0, 4)
          .map(function(s) { return s.trim().replace(/\s+/g, ' '); })
          .join(' | ');
      }
    }

    // FIX 4 — Experience summary: duties/responsibilities block from uploaded docs
    var experienceSummary = null;
    if (_uploadedText) {
      var _expM = _uploadedText.match(/(?:duties\s+and\s+responsibilities|duties\s+performed|job\s+description|civilian\s+(?:job|position|work)\s+history)\s*[:\-]?\s*([^\n]{20,400})/i);
      if (_expM) experienceSummary = _expM[1].trim().replace(/\s+/g, ' ').slice(0, 400);
    }

    var authEmail = '';
    try {
      var _authUser = window.AAAI && window.AAAI.auth && typeof window.AAAI.auth.getUser === 'function'
        ? window.AAAI.auth.getUser() : null;
      if (_authUser && _authUser.email) authEmail = _authUser.email;
    } catch (e) { /* leave authEmail empty */ }

    return {
      fullName:           profile.name           || null,
      branch:             profile.branch         || null,
      mos:                profile.mos            || null,
      rank:               profile.rank           || null,
      yearsService:       yearsService,
      targetRole:         targetRole,
      keySkills:          keySkills,
      education:          education,
      certifications:     certifications,
      awards:             profile.awards         || null,
      accomplishments:    accomplishments,
      experienceSummary:  experienceSummary,
      priorRoles:         profile.priorRoles     || null,
      state:              profile.state          || null,
      email:              authEmail              || null,
      phone:              profile.phone          || null,
      serviceEntryDate:   profile.serviceEntryDate || null,
      separationDate:     profile.separationDate || null,
      vaRating:           profile.vaRating       || null,
      employmentStatus:   profile.employmentStatus || null
    };
  }

  /**
   * Phase R-2 — Rental Application data builder.
   *
   * Returns a plain object mirroring the fields consumed by
   * buildRentalApplicationPacket(D, data). All fields default to `null`
   * when no deterministic source is available — NO placeholders, NO
   * [NOT PROVIDED] sentinels, NO AI calls. Extraction is pure regex /
   * string match against:
   *   1. window.AIOS.Memory.getProfile()
   *   2. window.AIOS._dashboardContext.uploadedDocs[].extracted_text
   *   3. conversationHistory[].content
   *
   * Fields:
   *   fullName, phone, email, currentAddress, propertyAddress,
   *   monthlyIncome, primaryIncomeSource, employmentStatus,
   *   reasonForMoving, householdMembers, references
   */
  function _buildRentalApplicationData() {
    var profile = (window.AIOS && window.AIOS.Memory && typeof window.AIOS.Memory.getProfile === 'function')
      ? window.AIOS.Memory.getProfile()
      : {};

    // ── Source 2: uploaded document text ──
    var _uploadedText = '';
    try {
      var _uctx = window.AIOS && window.AIOS._dashboardContext;
      if (_uctx && _uctx.uploadedDocs && _uctx.uploadedDocs.length) {
        _uploadedText = _uctx.uploadedDocs
          .map(function (d) { return d.extracted_text || ''; })
          .join('\n');
      }
    } catch (e) { /* non-fatal — proceed without doc text */ }

    // ── Source 3: conversation history text ──
    var _convoText = '';
    if (typeof conversationHistory !== 'undefined' && conversationHistory && conversationHistory.length) {
      _convoText = conversationHistory.map(function (m) { return m.content || ''; }).join('\n');
    }
    var _allText = _convoText + '\n' + _uploadedText;

    // ── Auth email ──
    var authEmail = '';
    try {
      var _authUser = window.AAAI && window.AAAI.auth && typeof window.AAAI.auth.getUser === 'function'
        ? window.AAAI.auth.getUser() : null;
      if (_authUser && _authUser.email) authEmail = _authUser.email;
    } catch (e) { /* leave authEmail empty */ }

    // ── currentAddress ──
    // Priority: uploaded docs (street-style match) → conversation hint phrase.
    var currentAddress = null;
    if (_uploadedText) {
      var _addrDocRx = /\b\d{1,6}\s+[A-Z][A-Za-z0-9.\s'\-]{2,40}\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Parkway|Pkwy|Circle|Cir|Terrace|Ter|Highway|Hwy)\b\.?(?:,?\s+(?:Apt|Apartment|Unit|Ste|Suite)\.?\s*[A-Z0-9\-]{1,8})?(?:,?\s+[A-Z][A-Za-z\s]{1,30})?(?:,?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?)?/;
      var _addrDocM = _uploadedText.match(_addrDocRx);
      if (_addrDocM) currentAddress = _addrDocM[0].trim().replace(/\s+/g, ' ');
    }
    if (!currentAddress && _convoText) {
      var _addrConvoM = _convoText.match(/(?:current\s+address|i\s+live\s+at|living\s+at|home\s+address|my\s+address\s+is)\s*[:\-]?\s*([0-9][^\n,]{5,80})/i);
      if (_addrConvoM) currentAddress = _addrConvoM[1].trim();
    }

    // ── propertyAddress ── (target rental)
    // Mined from conversation only — profile has no concept of target rental.
    var propertyAddress = null;
    if (_convoText) {
      var _propM = _convoText.match(/(?:renting|interested\s+in\s+renting|applying\s+(?:for|to)|property\s+at|the\s+(?:property|rental|home|apartment|unit)\s+at)\s*[:\-]?\s*([0-9][^\n,]{5,80})/i);
      if (_propM) propertyAddress = _propM[1].trim();
    }

    // ── monthlyIncome ──
    var monthlyIncome = null;
    if (_convoText) {
      var _incConvoM = _convoText.match(/(?:monthly\s+(?:gross\s+)?income|i\s+(?:make|earn|bring\s+home)|income\s+of|take[- ]home|bring\s+in)\s*(?:is|=)?\s*[:\-]?\s*\$?\s*([0-9][0-9,]{2,10}(?:\.[0-9]{1,2})?)\s*(?:\/?\s*(?:month|mo|monthly))?/i);
      if (_incConvoM) monthlyIncome = _incConvoM[1].replace(/,/g, '').trim();
    }
    if (!monthlyIncome && _uploadedText) {
      var _incDocM = _uploadedText.match(/(?:monthly\s+(?:gross\s+)?income|gross\s+monthly|monthly\s+pay|base\s+pay|monthly\s+benefit)\s*[:\-]?\s*\$?\s*([0-9][0-9,]{2,10}(?:\.[0-9]{1,2})?)/i);
      if (_incDocM) monthlyIncome = _incDocM[1].replace(/,/g, '').trim();
    }

    // ── primaryIncomeSource ──
    var primaryIncomeSource = null;
    var _hasVADisability =
      /\bva\s+(?:disability|compensation|benefits)\b/i.test(_allText) ||
      /\bservice[- ]connected\s+(?:disability|compensation)\b/i.test(_allText) ||
      (profile.vaRating && parseInt(profile.vaRating, 10) > 0);
    if (_convoText) {
      var _srcConvoM = _convoText.match(/(?:income\s+(?:source|from|comes\s+from)|i\s+(?:make\s+money|earn)\s+from|source\s+of\s+income)\s*[:\-]?\s*([A-Za-z][^\n.]{3,80})/i);
      if (_srcConvoM) primaryIncomeSource = _srcConvoM[1].trim();
    }
    if (!primaryIncomeSource) {
      if (_hasVADisability && profile.employmentStatus === 'employed') {
        primaryIncomeSource = 'Employment income and VA disability compensation';
      } else if (_hasVADisability) {
        primaryIncomeSource = 'VA disability compensation';
      } else if (profile.employmentStatus === 'employed') {
        primaryIncomeSource = 'Employment income';
      }
    }

    // ── employmentStatus ──
    var employmentStatus = profile.employmentStatus || null;

    // ── reasonForMoving ──
    var reasonForMoving = null;
    if (_convoText) {
      if (/\bpcs\s+orders?\b|\bpermanent\s+change\s+of\s+station\b/i.test(_convoText)) {
        reasonForMoving = 'PCS orders';
      } else if (/\bets(?:ing|\s+out)?\b|\bend\s+of\s+(?:term\s+of\s+)?service\b|\bseparating\s+from\s+(?:active\s+duty|service)\b/i.test(_convoText)) {
        reasonForMoving = 'Separation from active duty';
      } else if (/\bretir(?:ing|ement)\s+from\s+(?:service|military|active\s+duty)\b/i.test(_convoText)) {
        reasonForMoving = 'Retirement from military service';
      } else if (/\bmedical(?:ly)?\s+(?:retired|discharged|separat)/i.test(_convoText)) {
        reasonForMoving = 'Medical separation';
      } else {
        var _rmConvoM = _convoText.match(/(?:moving\s+(?:because|due\s+to|for)|relocating\s+(?:because|due\s+to|for)|reason\s+for\s+moving)\s*[:\-]?\s*([A-Za-z][^\n.]{5,120})/i);
        if (_rmConvoM) reasonForMoving = _rmConvoM[1].trim();
      }
    }

    // ── householdMembers ──
    var householdMembers = null;
    if (_convoText) {
      var _hhM = _convoText.match(/(?:household\s+(?:of|members|size)|(?:family|household)\s+of)\s*[:\-]?\s*(\d{1,2})/i);
      if (_hhM) householdMembers = parseInt(_hhM[1], 10);
    }
    if (householdMembers === null && _convoText) {
      // Derive from spouse/dependent mentions (applicant counts as 1)
      var _hhCount = 1;
      if (/\b(?:my\s+)?(?:wife|husband|spouse|partner)\b/i.test(_convoText)) _hhCount += 1;
      var _kidCountM = _convoText.match(/(\d{1,2})\s+(?:kids|children|dependents|sons|daughters)\b/i);
      if (_kidCountM) {
        _hhCount += parseInt(_kidCountM[1], 10);
      } else if (/\b(?:my\s+)?(?:kid|child|son|daughter|dependent)s?\b/i.test(_convoText)) {
        _hhCount += 1;
      }
      if (_hhCount > 1) householdMembers = _hhCount;
    }

    // ── references ──
    // Mine uploaded docs for an explicit references section; else null.
    var references = null;
    if (_uploadedText) {
      var _refM = _uploadedText.match(/references?\s*[:\-]\s*([^\n]{10,400})/i);
      if (_refM) references = _refM[1].trim().replace(/\s+/g, ' ').slice(0, 400);
    }

    return {
      fullName:            profile.name              || null,
      phone:               profile.phone             || null,
      email:               authEmail                 || null,
      currentAddress:      currentAddress,
      propertyAddress:     propertyAddress,
      monthlyIncome:       monthlyIncome,
      primaryIncomeSource: primaryIncomeSource,
      employmentStatus:    employmentStatus,
      reasonForMoving:     reasonForMoving,
      householdMembers:    householdMembers,
      references:          references
    };
  }

  /**
   * Phase Fed-4 — Safe deterministic autofill for federal resume data.
   *
   * Accepts the raw object produced by _buildFederalResumeData(), applies
   * nine normalization/derivation passes, and returns a shallow copy.
   * The caller's object is NEVER mutated.
   *
   * Allowed derivations (deterministic only — no AI, no fabrication):
   *   1. employmentStatus  — alias → canonical string
   *   2. branch            — informal → "U.S. Army" etc.
   *   3. veteransPreference — variant spellings → canonical label
   *   4. securityClearance  — variant spellings → canonical label
   *   5. citizenship        — variant spellings → "U.S. Citizen" etc.
   *   6. yearsService       — strip trailing text, keep numeric part
   *   7. keySkills          — derive from certifications when null
   *   8. accomplishments    — extract action-verb sentences from experienceSummary when null
   *   9. string field trim  — collapse internal whitespace, trim edges
   */
  function attemptFederalResumeAutoFill(data) {
    // ── Shallow copy — never mutate caller's object ──
    var d = {};
    for (var _afk in data) {
      if (Object.prototype.hasOwnProperty.call(data, _afk)) d[_afk] = data[_afk];
    }

    var _afHas = function (k) {
      var v = d[k];
      if (v === null || typeof v === 'undefined') return false;
      if (typeof v === 'number') return !isNaN(v);
      if (typeof v === 'string') return v.trim().length > 0;
      return false;
    };

    // ── Derivation 1: employmentStatus normalization ──
    if (_afHas('employmentStatus')) {
      var _afEs = d.employmentStatus.trim().toLowerCase();
      if (/\bfull[\s\-]?time\b/.test(_afEs))             d.employmentStatus = 'Full-Time';
      else if (/\bpart[\s\-]?time\b/.test(_afEs))        d.employmentStatus = 'Part-Time';
      else if (/\bself[\s\-]?employ/.test(_afEs))        d.employmentStatus = 'Self-Employed';
      else if (/\bcontract(or|ing)?\b/.test(_afEs))      d.employmentStatus = 'Contractor';
      else if (/\bunemploy/.test(_afEs))                 d.employmentStatus = 'Unemployed';
      else if (/\bretir/.test(_afEs))                    d.employmentStatus = 'Retired';
      else if (/\bstudent\b/.test(_afEs))                d.employmentStatus = 'Student';
    }

    // ── Derivation 2: branch normalization ──
    if (_afHas('branch')) {
      var _afBr = d.branch.trim().toLowerCase().replace(/\s+/g, ' ');
      if (/\barmy\b/.test(_afBr) && !/u\.s\.\s*army/.test(_afBr))          d.branch = 'U.S. Army';
      else if (/\bnavy\b/.test(_afBr) && !/u\.s\.\s*navy/.test(_afBr))     d.branch = 'U.S. Navy';
      else if (/\bmarine/.test(_afBr) && !/u\.s\.\s*marine/.test(_afBr))   d.branch = 'U.S. Marine Corps';
      else if (/\bair\s+force\b/.test(_afBr) && !/u\.s\.\s*air/.test(_afBr)) d.branch = 'U.S. Air Force';
      else if (/\bspace\s+force\b/.test(_afBr) && !/u\.s\.\s*space/.test(_afBr)) d.branch = 'U.S. Space Force';
      else if (/\bcoast\s+guard\b/.test(_afBr) && !/u\.s\.\s*coast/.test(_afBr)) d.branch = 'U.S. Coast Guard';
      else if (/\bguard\b/.test(_afBr) && !/coast/.test(_afBr))            d.branch = 'National Guard';
      else if (/\breserve\b/.test(_afBr))                                   d.branch = 'Reserve';
    }

    // ── Derivation 3: veteransPreference normalization ──
    if (_afHas('veteransPreference')) {
      var _afVp = d.veteransPreference.trim().toLowerCase();
      if (/10[\s\-]?pt|10[\s\-]?point|disabled\s+vet/.test(_afVp))
        d.veteransPreference = '10-Point (Disabled Veteran)';
      else if (/5[\s\-]?pt|5[\s\-]?point/.test(_afVp))
        d.veteransPreference = '5-Point';
      else if (/\bnone\b|\bno\s+pref/.test(_afVp))
        d.veteransPreference = 'None';
    }

    // ── Derivation 4: securityClearance normalization ──
    if (_afHas('securityClearance')) {
      var _afCl = d.securityClearance.trim().toLowerCase().replace(/\s+/g, ' ');
      if (/ts\s*\/\s*sci|top\s+secret\s*\/\s*sci/.test(_afCl))
        d.securityClearance = 'Top Secret/SCI';
      else if (/top\s+secret/.test(_afCl) && !/sci/.test(_afCl))
        d.securityClearance = 'Top Secret';
      else if (/\bsecret\b/.test(_afCl) && !/top/.test(_afCl))
        d.securityClearance = 'Secret';
      else if (/\bconfidential\b/.test(_afCl))
        d.securityClearance = 'Confidential';
      else if (/\bpublic\s+trust\b/.test(_afCl))
        d.securityClearance = 'Public Trust';
    }

    // ── Derivation 5: citizenship normalization ──
    if (_afHas('citizenship')) {
      var _afCit = d.citizenship.trim().toLowerCase();
      if (/\bu\.?s\.?\s+cit|\bunited\s+states\s+cit|american\s+cit/.test(_afCit))
        d.citizenship = 'U.S. Citizen';
      else if (/\bpermanent\s+resid|\bgreen\s+card|\blpr\b/.test(_afCit))
        d.citizenship = 'Permanent Resident';
      else if (/\bnatural/.test(_afCit))
        d.citizenship = 'Naturalized Citizen';
    }

    // ── Derivation 6: yearsService normalization — keep numeric portion only ──
    if (_afHas('yearsService')) {
      var _afYsStr = String(d.yearsService).trim();
      var _afYsM = _afYsStr.match(/^(\d+(?:\.\d+)?)/);
      if (_afYsM) d.yearsService = _afYsM[1];
    }

    // ── Derivation 7: keySkills from certifications when keySkills is null ──
    if (!_afHas('keySkills') && _afHas('certifications')) {
      // Extract the first few comma/semicolon-delimited tokens as skill candidates
      var _afCertTokens = d.certifications
        .split(/[,;|]+/)
        .map(function (s) { return s.trim().replace(/\s+/g, ' '); })
        .filter(function (s) { return s.length > 1 && s.length < 60; });
      if (_afCertTokens.length > 0) {
        d.keySkills = _afCertTokens.slice(0, 6).join(', ');
      }
    }

    // ── Derivation 8: accomplishments from experienceSummary when null ──
    // Extract sentences that begin with a past-tense action verb followed by a measurable result
    if (!_afHas('accomplishments') && _afHas('experienceSummary')) {
      var _afActionVerbs = /^(led|managed|developed|built|created|designed|implemented|established|trained|supervised|coordinated|executed|achieved|reduced|increased|improved|delivered|launched|authored|directed|oversaw|mentored|spearheaded|streamlined|deployed|maintained|operated)/i;
      var _afResultSignals = /\b(\d+|percent|%|award|recogni|reduc|increas|improv|save|cost|budget|mission|success|complet)/i;
      var _afSents = d.experienceSummary
        .replace(/([.!?])\s+/g, '$1\n')
        .split('\n')
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 20 && _afActionVerbs.test(s) && _afResultSignals.test(s); });
      if (_afSents.length > 0) {
        d.accomplishments = _afSents.slice(0, 3).join(' | ');
      }
    }

    // ── Derivation 9: string field trim / whitespace normalization ──
    var _afStringFields = [
      'fullName', 'phone', 'email', 'currentLocation', 'targetRole',
      'citizenship', 'veteransPreference', 'securityClearance',
      'branch', 'rank', 'mos', 'yearsService', 'employmentStatus',
      'education', 'institution', 'certifications', 'awards',
      'keySkills', 'experienceSummary', 'accomplishments', 'priorRoles'
    ];
    for (var _afSi = 0; _afSi < _afStringFields.length; _afSi++) {
      var _afSf = _afStringFields[_afSi];
      if (typeof d[_afSf] === 'string') {
        d[_afSf] = d[_afSf].replace(/[ \t]+/g, ' ').trim();
        if (d[_afSf].length === 0) d[_afSf] = null;
      }
    }

    return d;
  }

  /**
   * Phase Fed-2 — Federal Resume USAJobs data builder.
   *
   * Returns a plain object mirroring the fields consumed by
   * buildFederalResumeUsajobs(D, data). All fields default to `null`
   * when no deterministic source is available — NO placeholders, NO
   * sentinels, NO AI calls. Extraction is pure regex / string match
   * against, in priority order:
   *   1. window.AIOS.Memory.getProfile()
   *   2. window.AIOS._dashboardContext.uploadedDocs[].extracted_text
   *   3. conversationHistory[].content
   *   4. AAAI.auth.getUser().email
   *
   * Fields:
   *   fullName, phone, email, currentLocation, targetRole,
   *   citizenship, veteransPreference, securityClearance,
   *   branch, rank, mos, yearsService, employmentStatus,
   *   education, institution, certifications, awards,
   *   keySkills, experienceSummary, accomplishments, priorRoles
   */
  function _buildFederalResumeData() {
    // ── Source 1: profile ──
    var profile = (window.AIOS && window.AIOS.Memory && typeof window.AIOS.Memory.getProfile === 'function')
      ? window.AIOS.Memory.getProfile()
      : {};

    // ── Source 2: uploaded document text ──
    var _frdUploadedText = '';
    try {
      var _frdCtx = window.AIOS && window.AIOS._dashboardContext;
      if (_frdCtx && _frdCtx.uploadedDocs && _frdCtx.uploadedDocs.length) {
        _frdUploadedText = _frdCtx.uploadedDocs
          .map(function (d) { return d.extracted_text || ''; })
          .join('\n');
      }
    } catch (e) { /* non-fatal — proceed without doc text */ }

    // ── Source 3: conversation history text ──
    var _frdConvoText = '';
    if (typeof conversationHistory !== 'undefined' && conversationHistory && conversationHistory.length) {
      _frdConvoText = conversationHistory.map(function (m) { return m.content || ''; }).join('\n');
    }
    var _frdAllText = _frdConvoText + '\n' + _frdUploadedText;

    // ── Source 4: auth email ──
    var _frdAuthEmail = null;
    try {
      var _frdAuthUser = window.AAAI && window.AAAI.auth && typeof window.AAAI.auth.getUser === 'function'
        ? window.AAAI.auth.getUser() : null;
      if (_frdAuthUser && _frdAuthUser.email) _frdAuthEmail = _frdAuthUser.email;
    } catch (e) { /* leave null */ }

    // ── fullName ──
    // Priority: profile → docs (name label pattern)
    var _frdFullName = profile.name || null;
    if (!_frdFullName && _frdUploadedText) {
      var _frdNameM = _frdUploadedText.match(/(?:^|\n)\s*(?:name|soldier|service\s+member)\s*[:\-]\s*([A-Z][A-Za-z'.'\-]+(?:[ \t]+[A-Z][A-Za-z'.'\-]+){1,5})/i);
      if (_frdNameM) _frdFullName = _frdNameM[1].trim();
    }

    // ── phone ──
    // Priority: profile → docs (phone label pattern)
    var _frdPhone = profile.phone || null;
    if (!_frdPhone && _frdUploadedText) {
      var _frdPhoneM = _frdUploadedText.match(/(?:phone|telephone|cell|mobile)\s*[:\-]?\s*(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/i);
      if (_frdPhoneM) _frdPhone = _frdPhoneM[1].trim();
    }

    // ── currentLocation (city, state — NOT full street) ──
    // Priority: profile.state → docs city+state pattern → convo city+state pattern
    var _frdCurrentLocation = null;
    if (profile.state) {
      _frdCurrentLocation = profile.state;
    }
    if (!_frdCurrentLocation && _frdUploadedText) {
      var _frdLocDocM = _frdUploadedText.match(/(?:city|location|home\s+of\s+record)\s*[:\-]\s*([A-Za-z][A-Za-z\s\.\-]{2,40}),?\s*([A-Z]{2})\s*\d{5}/i);
      if (_frdLocDocM) _frdCurrentLocation = _frdLocDocM[1].trim() + ', ' + _frdLocDocM[2];
    }
    if (!_frdCurrentLocation && _frdConvoText) {
      var _frdLocConvoM = _frdConvoText.match(/(?:i\s+(?:live|am)\s+(?:in|based\s+in)|located\s+in|currently\s+in)\s+([A-Za-z][A-Za-z\s\.\-]{2,30}),?\s*([A-Z]{2})\b/i);
      if (_frdLocConvoM) _frdCurrentLocation = _frdLocConvoM[1].trim() + ', ' + _frdLocConvoM[2];
    }

    // ── targetRole ──
    // Priority: convo intent match → docs desired position label
    var _frdTargetRole = null;
    if (_frdConvoText) {
      var _frdRoleM = _frdConvoText.match(/(?:target(?:ing)?|seeking|interested\s+in|want(?:s|ing)?\s+(?:a|to\s+be))\s+(?:a\s+)?([A-Za-z\s\/&\-]{3,50})\s+(?:role|position|job|career)/i);
      if (_frdRoleM) _frdTargetRole = _frdRoleM[1].trim();
    }
    if (!_frdTargetRole && _frdUploadedText) {
      var _frdRoleDocM = _frdUploadedText.match(/(?:desired\s+(?:job|position|occupation)|job\s+objective|applying\s+for)\s*[:\-]\s*([A-Za-z][^\n]{3,80})/i);
      if (_frdRoleDocM) _frdTargetRole = _frdRoleDocM[1].trim().replace(/\s+/g, ' ').slice(0, 80);
    }

    // ── veteransPreference ──
    // Computed early; citizenship deferred until after _frdBranch is resolved.
    // 10-point: VA disability rating >= 10% or explicit disabled-vet signal
    // 5-point:  any service/discharge signal, no disability
    // null:     no service signal found
    var _frdVARating = profile.vaRating ? parseInt(profile.vaRating, 10) : 0;
    var _frdDisabledVet =
      (_frdVARating >= 10) ||
      /\b(?:service[- ]connected\s+disability|disabled\s+veteran|10[- ]point\s+(?:veterans?'?\s+)?preference)\b/i.test(_frdAllText);
    var _frdHasServiceSignal =
      !!(profile.branch) ||
      /\b(?:honorable\s+discharge|general\s+discharge|served\s+(?:in|on)\s+the|active\s+duty|military\s+service|u\.?s\.?\s+veteran)\b/i.test(_frdAllText);
    var _frdVetPref = null;
    if (_frdDisabledVet) {
      _frdVetPref = '10-Point (Disabled Veteran)';
    } else if (_frdHasServiceSignal) {
      _frdVetPref = '5-Point';
    }

    // ── securityClearance ──
    // Matched in descending specificity; "secret" required near "clearance"
    // to avoid false positives from unrelated context.
    // Also detects "TS/SCI" abbreviation form.
    var _frdClearance = null;
    if (_frdAllText) {
      if (/\btop\s+secret\s*\/\s*sci\b|\bts\s*\/\s*sci\b/i.test(_frdAllText)) {
        _frdClearance = 'Top Secret/SCI';
      } else if (/\btop\s+secret\b/i.test(_frdAllText)) {
        _frdClearance = 'Top Secret';
      } else if (/\bsecret\s+(?:security\s+)?clearance\b|\bsecurity\s+clearance\s*[:\-]?\s*secret\b/i.test(_frdAllText)) {
        _frdClearance = 'Secret';
      } else if (/\bconfidential\s+(?:security\s+)?clearance\b/i.test(_frdAllText)) {
        _frdClearance = 'Confidential';
      } else if (/\bpublic\s+trust\b/i.test(_frdAllText)) {
        _frdClearance = 'Public Trust';
      }
    }

    // ── branch ──
    // Priority: profile → docs (branch name pattern)
    var _frdBranch = profile.branch || null;
    if (!_frdBranch && _frdUploadedText) {
      var _frdBranchM = _frdUploadedText.match(/\b(Army|Navy|Marine\s+Corps|Air\s+Force|Coast\s+Guard|Space\s+Force|National\s+Guard)\b/i);
      if (_frdBranchM) _frdBranch = _frdBranchM[1].trim();
    }

    // ── citizenship ──
    // Explicit text assertion first; then infer from confirmed branch value.
    // (US federal military service requires US citizenship.)
    // Placed after _frdBranch is fully resolved so doc-mined branch counts.
    var _frdCitizenship = null;
    if (/\b(?:u\.?s\.?\s+citizen|united\s+states\s+citizen|american\s+citizen|citizenship\s*[:\-]\s*(?:yes|u\.?s\.?|united\s+states))\b/i.test(_frdAllText)) {
      _frdCitizenship = 'U.S. Citizen';
    } else if (_frdBranch) {
      // Active/prior US military service members must hold US citizenship
      _frdCitizenship = 'U.S. Citizen';
    }

    // ── rank ──
    // Priority: profile → docs (grade/rank label)
    var _frdRank = profile.rank || null;
    if (!_frdRank && _frdUploadedText) {
      var _frdRankM = _frdUploadedText.match(/(?:grade|rank)\s*[:\-]\s*([A-Z]\d?[A-Z]?[-]?\d{0,2}|[A-Z]{1,3}\s+[A-Za-z]+)/);
      if (_frdRankM) _frdRank = _frdRankM[1].trim();
    }

    // ── mos ──
    // Priority: profile → docs (MOS/AFSC/Rating label)
    var _frdMos = profile.mos || null;
    if (!_frdMos && _frdUploadedText) {
      var _frdMosM = _frdUploadedText.match(/(?:mos|afsc|rating|military\s+occupational\s+specialty)\s*[:\-]\s*([A-Z0-9]{2,5}[A-Z]?\s+[A-Za-z][^\n]{3,60})/i);
      if (_frdMosM) _frdMos = _frdMosM[1].trim().replace(/\s+/g, ' ').slice(0, 80);
    }

    // ── yearsService ──
    // Priority: calculate from dates → regex for explicit "X years of service"
    var _frdYearsService = null;
    if (profile.serviceEntryDate && profile.separationDate) {
      try {
        var _frdEntry = new Date(profile.serviceEntryDate);
        var _frdSep   = new Date(profile.separationDate);
        if (!isNaN(_frdEntry) && !isNaN(_frdSep)) {
          var _frdYrs = Math.max(1, Math.round((_frdSep - _frdEntry) / (365.25 * 24 * 60 * 60 * 1000)));
          _frdYearsService = String(_frdYrs);
        }
      } catch (e) { /* leave null */ }
    }
    if (!_frdYearsService && _frdAllText) {
      var _frdYsM = _frdAllText.match(/(\d{1,2})\s+years?\s+(?:of\s+)?(?:active\s+duty\s+|military\s+)?service\b/i);
      if (_frdYsM) _frdYearsService = _frdYsM[1];
    }

    // ── employmentStatus ──
    // Priority: profile → convo keyword scan
    var _frdEmpStatus = profile.employmentStatus || null;
    if (!_frdEmpStatus && _frdConvoText) {
      if (/\b(?:currently\s+employed|working\s+(?:at|for)|i\s+work\s+(?:at|for))\b/i.test(_frdConvoText)) {
        _frdEmpStatus = 'employed';
      } else if (/\b(?:unemployed|not\s+(?:currently\s+)?working|looking\s+for\s+work)\b/i.test(_frdConvoText)) {
        _frdEmpStatus = 'unemployed';
      } else if (/\b(?:active\s+duty|currently\s+serving|on\s+active\s+duty)\b/i.test(_frdConvoText)) {
        _frdEmpStatus = 'active duty';
      } else if (/\b(?:retired\s+from|in\s+retirement|post-retirement)\b/i.test(_frdConvoText)) {
        _frdEmpStatus = 'retired';
      }
    }

    // ── education ──
    // Priority: convo degree mention → profile → docs degree mention
    var _frdEducation = null;
    if (_frdConvoText) {
      var _frdEduConvoM = _frdConvoText.match(/(?:degree|bachelor|master|associate|diploma|certificate|B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?B\.?A\.?)\s*(?:in|of)?\s*([^\n]{3,100})/i);
      if (_frdEduConvoM) _frdEducation = _frdEduConvoM[0].trim().replace(/\s+/g, ' ');
    }
    if (!_frdEducation && profile.education) {
      _frdEducation = profile.education;
    }
    if (!_frdEducation && _frdUploadedText) {
      var _frdEduDocM = _frdUploadedText.match(/(?:bachelor(?:'?s)?|master(?:'?s)?|associate(?:'?s)?|ph\.?d\.?|degree)\s*(?:of|in)?\s*[A-Za-z\s,&'\-]{3,60}/i);
      if (_frdEduDocM) _frdEducation = _frdEduDocM[0].trim().replace(/\s+/g, ' ');
    }

    // ── institution ──
    // Mine docs first (structured text), then convo attended/graduated phrases
    var _frdInstitution = null;
    if (_frdUploadedText) {
      var _frdInstDocM = _frdUploadedText.match(/(?:[A-Z][A-Za-z\s]+\s+(?:University|College|Institute|Academy|School)|(?:University|College|Institute|Academy)\s+of\s+[A-Za-z\s]{3,50})\b/);
      if (_frdInstDocM) _frdInstitution = _frdInstDocM[0].trim().replace(/\s+/g, ' ');
    }
    if (!_frdInstitution && _frdConvoText) {
      var _frdInstConvoM = _frdConvoText.match(/(?:attended|graduated\s+from|studied\s+at|went\s+to)\s+([A-Z][A-Za-z\s]{3,60}(?:University|College|Institute|Academy))/i);
      if (_frdInstConvoM) _frdInstitution = _frdInstConvoM[1].trim();
    }

    // ── certifications ──
    // Priority: profile (mined from DD-214 Item 14) → docs training block
    var _frdCertifications = profile.certifications || null;
    if (!_frdCertifications && _frdUploadedText) {
      var _frdCertDocM = _frdUploadedText.match(/(?:item\s*14|military\s+education|certif(?:ication|ied)s?|training\s+(?:attended|completed))\s*[:\-]?\s*([^\n]{10,200})/i);
      if (_frdCertDocM) _frdCertifications = _frdCertDocM[1].trim().replace(/\s+/g, ' ');
    }

    // ── awards ──
    // Priority: profile (mined from DD-214 Item 13) → docs awards block
    var _frdAwards = profile.awards || null;
    if (!_frdAwards && _frdUploadedText) {
      var _frdAwardsM = _frdUploadedText.match(/(?:awards?\s+and\s+decorations?|military\s+awards?|honors?\s+and\s+awards?|item\s*13)\s*[:\-]?\s*([^\n]{10,300})/i);
      if (_frdAwardsM) _frdAwards = _frdAwardsM[1].trim().replace(/\s+/g, ' ').slice(0, 300);
    }

    // ── keySkills ──
    // Priority: convo skills block → docs skills/qualifications block → profile.civilianSkills
    // NO generic MOS fallback — return null rather than fabricate content.
    var _frdKeySkills = null;
    if (_frdConvoText) {
      var _frdSkillConvoM = _frdConvoText.match(/(?:skills?|competenc(?:ies|y)|strengths?)\s*[:—\-]\s*([^\n]{10,200})/i);
      if (_frdSkillConvoM) _frdKeySkills = _frdSkillConvoM[1].trim();
    }
    if (!_frdKeySkills && _frdUploadedText) {
      var _frdSkillDocM = _frdUploadedText.match(/(?:skills?|competenc(?:ies|y)|qualifications?|technical\s+skills?|proficienc(?:y|ies))\s*[:\-]\s*([^\n]{10,200})/i);
      if (_frdSkillDocM) _frdKeySkills = _frdSkillDocM[1].trim();
    }
    if (!_frdKeySkills && profile.civilianSkills) {
      _frdKeySkills = profile.civilianSkills;
    }

    // ── experienceSummary ──
    // Mine docs for duties/job description block only
    var _frdExpSummary = null;
    if (_frdUploadedText) {
      var _frdExpM = _frdUploadedText.match(/(?:duties\s+and\s+responsibilities|duties\s+performed|job\s+description|civilian\s+(?:job|position|work)\s+history)\s*[:\-]?\s*([^\n]{20,400})/i);
      if (_frdExpM) _frdExpSummary = _frdExpM[1].trim().replace(/\s+/g, ' ').slice(0, 400);
    }

    // ── accomplishments ──
    // Mine docs for quantified action-verb sentences
    var _frdAccomplishments = null;
    if (_frdUploadedText) {
      var _frdAcM = _frdUploadedText.match(/[A-Z][^\n.]{20,140}(?:\d+\s*(?:%|percent|personnel|soldiers?|troops?|vehicles?|missions?|systems?|Soldiers?)|(?:managed|led|trained|supervised|coordinated|directed|achieved|improved|reduced|increased))[^\n.]{0,80}/g);
      if (_frdAcM && _frdAcM.length) {
        _frdAccomplishments = _frdAcM.slice(0, 4)
          .map(function (s) { return s.trim().replace(/\s+/g, ' '); })
          .join(' | ');
      }
    }

    // ── priorRoles ──
    // Priority: profile → docs employment/work history label
    var _frdPriorRoles = profile.priorRoles || null;
    if (!_frdPriorRoles && _frdUploadedText) {
      var _frdPriorM = _frdUploadedText.match(/(?:prior\s+(?:positions?|roles?|experience)|work\s+history|employment\s+history)\s*[:\-]?\s*([^\n]{10,300})/i);
      if (_frdPriorM) _frdPriorRoles = _frdPriorM[1].trim().replace(/\s+/g, ' ').slice(0, 300);
    }

    var _frdRaw = {
      fullName:           _frdFullName,
      phone:              _frdPhone,
      email:              _frdAuthEmail,
      currentLocation:    _frdCurrentLocation,
      targetRole:         _frdTargetRole,
      citizenship:        _frdCitizenship,
      veteransPreference: _frdVetPref,
      securityClearance:  _frdClearance,
      branch:             _frdBranch,
      rank:               _frdRank,
      mos:                _frdMos,
      yearsService:       _frdYearsService,
      employmentStatus:   _frdEmpStatus,
      education:          _frdEducation,
      institution:        _frdInstitution,
      certifications:     _frdCertifications,
      awards:             _frdAwards,
      keySkills:          _frdKeySkills,
      experienceSummary:  _frdExpSummary,
      accomplishments:    _frdAccomplishments,
      priorRoles:         _frdPriorRoles
    };
    return attemptFederalResumeAutoFill(_frdRaw);
  }

  /**
   * Handles resume generation entirely client-side:
   *  1. Build structured data from profile + conversation
   *  2. Generate .docx via AAAI.legalDocx (buildResumeFromData path)
   *  3. Save to dashboard via saveTemplateOutput
   *  4. Show confirmation in chat
   *
   * @param {string} userText — the user's original message (for history)
   * @returns {boolean} true if handled, false if should fall through to AI
   */
  function _handleResumeGeneration(userText) {
    // Phase 2.3: Lock immediately — blocks sendToAI for the entire lifecycle
    window._resumeExecutionLock = true;
    console.log('[LOCK] Resume execution lock ACQUIRED');

    var isLoggedIn = window.AAAI && window.AAAI.auth && window.AAAI.auth.isLoggedIn && window.AAAI.auth.isLoggedIn();

    // ── Non-auth guard ──
    if (!isLoggedIn) {
      clearAIWorkingState();
      var _signInMsg = '📝 I can generate a personalized resume for you, but you\'ll need to sign in first so I can save it to your dashboard.\n\n' +
        'Once signed in, just ask me again and I\'ll build it instantly from your profile.';
      addMessage(_signInMsg, 'ai');
      conversationHistory.push({ role: 'assistant', content: _signInMsg });
      // Show login bar
      if (chatMessages) {
        var _loginBar = document.createElement('div');
        _loginBar.className = 'message message--system';
        _loginBar.innerHTML =
          '<div class="dashboard-handoff-bar" style="' +
            'background: linear-gradient(135deg, #1a365d 0%, #2a4a7f 100%);' +
            'border: 1px solid #c6a135; border-radius: 8px; padding: 12px 16px;' +
            'display: flex; align-items: center; justify-content: space-between;' +
            'margin: 8px 0; gap: 12px;">' +
            '<span style="color: #fff; font-size: 0.95rem; font-weight: 500;">' +
              '🔒 Sign in to generate and save your resume.' +
            '</span>' +
            '<button onclick="(function(){ if(window.AAAI && AAAI.auth && typeof AAAI.auth.showAuthModal===\'function\') AAAI.auth.showAuthModal(); })()" style="' +
              'background: #c6a135; color: #1a365d; border: none;' +
              'padding: 8px 16px; border-radius: 6px; font-weight: 700;' +
              'font-size: 0.9rem; white-space: nowrap; cursor: pointer;">' +
              'Sign In' +
            '</button>' +
          '</div>';
        chatMessages.appendChild(_loginBar);
        scrollToBottom();
      }
      isProcessing = false;
      if (btnSend) btnSend.disabled = false;
      window._resumeExecutionLock = false;
      console.log('[LOCK] Resume execution lock RELEASED (non-auth)');
      return true;
    }

    // ── Phase 2.5: Wait for dashboard context, THEN mine uploaded docs ──────
    // DD-214s, service records, etc. may contain branch, name, rank, MOS.
    // We MUST load and mine these BEFORE the branch/name checks fire,
    // otherwise the system asks for data it already has.
    //
    // _dashboardContextReady is a promise set at login that resolves once
    // _loadDashboardContext() has had time to populate AIOS._dashboardContext.
    // If context is already loaded, we skip the wait and proceed immediately.
    var _ctxAlreadyLoaded = window.AIOS && window.AIOS._dashboardContext;
    var _ctxWait = (!_ctxAlreadyLoaded && _dashboardContextReady)
      ? _dashboardContextReady
      : Promise.resolve();

    _ctxWait.then(function() {
      // ── Mine uploaded docs into profile ──
      _mineUploadedDocsForProfile();

      // ── Required diagnostic logs ──
      var _docCount = (window.AIOS && window.AIOS._dashboardContext && window.AIOS._dashboardContext.uploadedDocs)
        ? window.AIOS._dashboardContext.uploadedDocs.length : 0;
      console.log('[DOC-MINING] Docs found:', _docCount);

      // ── Re-read profile AFTER mining — critical: must reflect mined data ──
      var _quickProfile = (window.AIOS && window.AIOS.Memory && typeof window.AIOS.Memory.getProfile === 'function')
        ? window.AIOS.Memory.getProfile() : {};

      console.log('[DOC-MINING RESULT]', {
        branch: _quickProfile.branch,
        name: _quickProfile.name
      });

      // ── PHASE 2: Critical data check — ONE question, then stop ──────────
      // Branch is the minimum required field. Without it the resume is too
      // generic to be useful. Ask exactly once, then return so the user
      // can answer and re-trigger generation on the next message.
      if (!_quickProfile.branch) {
        clearAIWorkingState();
        // Phase 2.4: Store pending intent with structured fields
        var _followOns = _detectFollowOnDocs(userText);
        window._pendingResumeBuild = {
          originalRequest: userText,
          timestamp: Date.now(),
          missingField: 'branch',
          sourceMode: 'voice_or_text',
          followOnDocs: _followOns
        };
        if (_followOns) window._resumeFollowOnDocs = _followOns;
        console.log('[RESUME] Pending build stored — waiting for branch answer' +
          (_followOns ? ' (followOnDocs: ' + _followOns.join(', ') + ')' : ''));
        var _branchAskMsg = '📝 I\'m ready to build your resume — just need one quick detail first:\n\n' +
          '**What branch of service were you in?**\n\n' +
          'Army · Navy · Air Force · Marine Corps · Coast Guard · Space Force · National Guard';
        addMessage(_branchAskMsg, 'ai');
        conversationHistory.push({ role: 'assistant', content: _branchAskMsg });
        isProcessing = false;
        if (btnSend) btnSend.disabled = false;
        if (userInput) userInput.focus();
        window._resumeExecutionLock = false;
        console.log('[LOCK] Resume execution lock RELEASED (pending branch)');
        return; // handled — waiting for branch answer before proceeding
      }
      // ── END PHASE 2 CRITICAL DATA CHECK ─────────────────────────────────

      // ── Build structured data ──
      var resumeData = _buildResumeData();
      console.log('[RESUME-GEN] Structured data built:', JSON.stringify(resumeData).substring(0, 200));

      // ── Phase 2.4: Data sanity check — ask for name instead of aborting ──
      if (!resumeData || !resumeData.fullName || resumeData.fullName === '[NOT PROVIDED]') {
        console.log('[RESUME] Name missing — setting pending build for name question. fullName=' + (resumeData && resumeData.fullName));
        clearAIWorkingState();
        // Preserve follow-on docs from the original request if not already set
        var _nameFollowOns = window._resumeFollowOnDocs || _detectFollowOnDocs(userText);
        window._pendingResumeBuild = {
          originalRequest: userText,
          timestamp: Date.now(),
          missingField: 'name',
          sourceMode: 'voice_or_text',
          followOnDocs: _nameFollowOns
        };
        if (_nameFollowOns) window._resumeFollowOnDocs = _nameFollowOns;
        console.log('[RESUME] Pending build stored — waiting for name answer');
        var _nameAskMsg = '📝 Almost ready to build your resume! I just need one more thing:\n\n' +
          '**What is your full name?**\n\n' +
          '_This is how it will appear at the top of your resume._';
        addMessage(_nameAskMsg, 'ai');
        conversationHistory.push({ role: 'assistant', content: _nameAskMsg });
        isProcessing = false;
        if (btnSend) btnSend.disabled = false;
        if (userInput) userInput.focus();
        window._resumeExecutionLock = false;
        console.log('[LOCK] Resume execution lock RELEASED (pending name)');
        return; // handled — waiting for name answer before proceeding
      }
      // ── END Phase 2.4 DATA SANITY ─────────────────────────────────────

      // ── Generate .docx via legal-docx-generator ──
      if (!window.AAAI || !window.AAAI.legalDocx || typeof window.AAAI.legalDocx.generateFromData !== 'function') {
        console.error('[RESUME-GEN] generateFromData not available — NO AI fallback (Phase 2.3)');
        clearAIWorkingState();
        addMessage('⚠️ The resume builder is temporarily unavailable. Please refresh the page and try again.', 'ai');
        isProcessing = false;
        if (btnSend) btnSend.disabled = false;
        window._resumeExecutionLock = false;
        console.log('[LOCK] Resume execution lock RELEASED (generator unavailable)');
        return;  // handled — no AI fallback
      }

      // Async: generate docx blob, save to dashboard, show confirmation
      window.AAAI.legalDocx.generateFromData('resume-builder', resumeData)
        .then(function(result) {
          // result = { fileName, blob, contentText }
          console.log('[RESUME-GEN] .docx generated: ' + result.fileName + ' (' + result.contentText.length + ' chars)');

          // Save to dashboard
          var output = {
            template_type: 'resume-builder',
            title: 'Resume — ' + (resumeData.fullName ? resumeData.fullName : 'Veteran'),
            content: result.contentText,
            metadata: {
              source: 'template_driven',
              action: 'save_template',
              prefilled_fields: resumeData,
              generated_at: new Date().toISOString()
            }
          };
          return window.AAAI.auth.saveTemplateOutput(output).then(function(saveRes) {
            if (saveRes && !saveRes.error) {
              console.log('[RESUME-GEN] Saved to dashboard');
            } else {
              console.warn('[RESUME-GEN] Dashboard save failed:', saveRes && saveRes.error);
            }

            // Show confirmation in chat
            clearAIWorkingState();
            var _name = resumeData.fullName ? resumeData.fullName : 'your';
            var _confirmMsg = '✅ **Resume — ' + _name + '** has been generated and saved to your dashboard.\n\n' +
              'The .docx file has also been downloaded to your device.\n\n' +
              'You can view, edit, or re-download it from your **[Profile → Generated Documents](/profile.html)** page.\n\n' +
              '_Need changes? Just tell me what to update and I\'ll regenerate it._';

            // Phase 2.4: Surface follow-on document intents from combined requests
            var _followOns = window._resumeFollowOnDocs;
            window._resumeFollowOnDocs = null; // clear after consuming
            if (_followOns && _followOns.length > 0) {
              var _docLabels = {
                'will': 'Last Will & Testament',
                'power-of-attorney': 'Power of Attorney',
                'action-plan': 'Action Plan',
                'nexus-letter': 'Nexus Letter',
                'personal-statement': 'Personal Statement',
                'transition-plan': 'Transition Plan',
                'buddy-letter': 'Buddy Letter'
              };
              var _nextDocs = _followOns.map(function(d) { return _docLabels[d] || d; }).join(', ');
              _confirmMsg += '\n\n---\n\n📋 You also asked about: **' + _nextDocs + '**.\n' +
                'Just say "generate my ' + _followOns[0].replace(/-/g, ' ') + '" and I\'ll build that next.';
              console.log('[RESUME] Follow-on docs surfaced: ' + _followOns.join(', '));
            }

            streamMessage(_confirmMsg, function() {
              isProcessing = false;
              if (btnSend) btnSend.disabled = false;
              if (userInput) userInput.focus();
              window._resumeExecutionLock = false;
              console.log('[LOCK] Resume execution lock RELEASED (success)');
              speakAIText(_confirmMsg);
            });
            conversationHistory.push({ role: 'assistant', content: _confirmMsg });
          });
        })
        .catch(function(err) {
          console.error('[RESUME-GEN] Generation failed:', err);
          clearAIWorkingState();
          // Phase 2.3: NO AI fallback — show error and let user retry
          var _errMsg = '⚠️ I ran into an issue generating your resume. Please try again — just say "build my resume."';
          addMessage(_errMsg, 'ai');
          conversationHistory.push({ role: 'assistant', content: _errMsg });
          isProcessing = false;
          if (btnSend) btnSend.disabled = false;
          window._resumeFollowOnDocs = null; // Phase 2.4: clear on error
          window._resumeExecutionLock = false;
          console.log('[LOCK] Resume execution lock RELEASED (error)');
        });
    }); // end _ctxWait.then

    return true;  // handled — all paths execute inside .then()
  }

  // ── forceTask support ──────────────────────────────────────────────
  // sendToAI accepts either a plain string OR an object:
  //   { text: string, forceTask: string, skipFollowups: boolean }
  // When forceTask is set, a hard system override is appended to the
  // prompt so the AI generates immediately without follow-up questions.
  var _activeForceTask = null;  // set per-request, cleared on response

  function sendToAI(userText) {
    // Phase 2.3: Hard lock — resume generation owns the pipeline
    if (window._resumeExecutionLock) {
      console.log('[LOCK] sendToAI BLOCKED — resume execution lock active. Input: "' + (typeof userText === 'string' ? userText.substring(0, 40) : JSON.stringify(userText).substring(0, 60)) + '"');
      return;
    }

    // Normalize: accept object or string
    var _ftPayload = null;
    if (userText && typeof userText === 'object') {
      _ftPayload = userText;
      userText = _ftPayload.text || '';
      _activeForceTask = _ftPayload.forceTask || null;
    } else {
      _activeForceTask = null;
    }

    // ── Phase 2 INTERCEPT: Template-driven resume generation ──
    // Phase 2.3: All resume generation now routes through _handleResumeGeneration()
    // directly from callers. The forceTask='resume_generation' path is no longer used.
    // If somehow reached, route to template pipeline (belt + suspenders).
    if (_activeForceTask === 'resume_generation') {
      console.warn('[PHASE2.3] sendToAI reached with forceTask=resume_generation — redirecting to template pipeline');
      isProcessing = true;
      if (btnSend) btnSend.disabled = true;
      _handleResumeGeneration(userText);
      return;
    }

    // Phase 4.4: concurrent-request guard
    // sendToAI() can be called directly (bypassing submitUserText queue) while isProcessing is true.
    // Non-system calls queue via pendingUserSubmission so they fire after the active stream ends.
    var _p44IsSystem = (userText === 'START_CONVERSATION' || userText === 'RESUME_MISSION');
    if (isProcessing && !_p44IsSystem) {
      pendingUserSubmission = { text: userText, opts: {} };
      log('sendToAI', 'P4.4 concurrent guard — queued while in-flight, seq=' + _apiRequestSeq);
      return;
    }
    var _p44ReqSeq = ++_apiRequestSeq;
    log('sendToAI', 'request seq=' + _p44ReqSeq + ' input="' + (userText || '').substring(0, 60) + '"' +
      (_activeForceTask ? ' forceTask=' + _activeForceTask : ''));

    // Fix 4: Wait for dashboard context on first call so Claude gets full state.
    // Only gates on START_CONVERSATION — subsequent calls proceed immediately.
    if (_dashboardContextReady && _p44IsSystem) {
      _dashboardContextReady.then(function() {
        _dashboardContextReady = null; // only wait once
        console.log('[Fix4] dashboard context ready — proceeding with first AI call');
        _sendToAI_inner(userText, _p44ReqSeq);
      });
      return;
    }
    _sendToAI_inner(userText, _p44ReqSeq);
  }

  function _sendToAI_inner(userText, _p44ReqSeq) {
    var _p44IsSystem = (userText === 'START_CONVERSATION' || userText === 'RESUME_MISSION');
    isProcessing = true;
    if (btnSend) btnSend.disabled = true;

    // ── Phase 35: Memory extraction on EVERY real user message ──────
    // Runs BEFORE routing and request building so memory/eligibility
    // context is available when callChatEndpoint assembles the prompt.
    if (userText !== 'START_CONVERSATION' && userText !== 'RESUME_MISSION' && window.AIOS && window.AIOS.Memory) {
      try {
        var _extracted = window.AIOS.Memory.extractMemoryFromInput(userText);
        if (_extracted && Object.keys(_extracted).length > 0) {
          var _merged = window.AIOS.Memory.mergeMemory(window.AIOS.Memory.profile, _extracted);
          window.AIOS.Memory.profile = _merged;
          log('MEMORY', 'extracted: ' + Object.keys(_extracted).join(', '));
          // Persist to Supabase if authenticated (non-blocking)
          if (typeof window.AIOS.Memory.save === 'function') {
            window.AIOS.Memory.save().catch(function(e) { console.error('[AAAI ERROR][memory.save] profile persist failed |', e); });
          }
        }
        // Phase 35 / Phase 3.2: Auto-detect mission — multi-mission aware.
        // Removed !Mission.isActive() outer gate so multiple types can coexist.
        // Type-based dedup (getByType) prevents duplicate rows for the same type.
        if (window.AIOS.Mission &&
            typeof window.AIOS.Mission.detectMissionFromInput === 'function') {
          var _missionSeed = window.AIOS.Mission.detectMissionFromInput(userText);
          if (_missionSeed && _missionSeed.type) {
            // Only create if no non-archived mission of this type already exists
            var _textExisting = typeof window.AIOS.Mission.getByType === 'function'
              ? window.AIOS.Mission.getByType(_missionSeed.type)
              : (window.AIOS.Mission.isActive() ? window.AIOS.Mission.current : null);
            if (!_textExisting) {
              var _newMission = window.AIOS.Mission.createMission(_missionSeed.type);
              if (_newMission) {
                window.AIOS.Mission.current = _newMission;
                log('MISSION', 'auto-created: ' + _newMission.name + ' (matched: ' + _missionSeed.matched + ')');

                // PHASE 2 - Use new persistent layer if activeCaseId present
                // Persist new mission to Supabase. Fire-and-forget — no UI impact.
                if (_activeCaseId && window.AAAI && window.AAAI.DataAccess) {
                  (function(_m) {
                    withRetry(function() { return window.AAAI.DataAccess.missions.create(_activeCaseId, _m); }, 'missions.create:text')
                      .then(function(r) {
                        if (!r.error && r.data && r.data.id) {
                          _m._dbId = r.data.id; // attach DB UUID for future sync()
                          log('Phase2', 'text mission persisted — ' + _m.type + ' | dbId: ' + r.data.id);
                        }
                      }).catch(function(e) { console.error('[AAAI ERROR][missions.create] text — type:', _m.type, '| case:', _activeCaseId, '|', e); });
                  })(_newMission);
                }
              }
            }
          }
        }
      } catch (_memErr) {
        console.warn('[AIOS][MEMORY][ERROR] extraction:', _memErr.message || _memErr);
      }
    }

    if (userText !== 'START_CONVERSATION' && userText !== 'RESUME_MISSION') {
      conversationHistory.push({ role: 'user', content: userText });
      // Fire audit_started on the first real user message only
      var realMsgCount = conversationHistory.filter(function(m) { return m.role === 'user'; }).length;
      if (realMsgCount === 1) {
        window.dispatchEvent(new CustomEvent('aaai:audit_started'));
        log('Analytics', 'dispatched aaai:audit_started');
        localStorage.setItem('aaai_returning', '1'); // Phase 21 — mark as returning
        _dismissOnboardCard(); // Phase 21 — immediate dismiss on first real send
      }
    }

    showTyping();

    // ── AI Working Indicator: detect document generation requests ──
    // Show a persistent banner for long-running generation tasks.
    // The regex mirrors the voice-routing pattern at line 2484.
    if (userText !== 'START_CONVERSATION' && userText !== 'RESUME_MISSION') {
      var _genMatch = /\b(generate|create|draft|write|prepare|make me|build me|give me|produce|start|wrap up|finish|finalize|complete|assemble|compile|put together)\b.{0,80}\b(resume|cv|will|testament|power of attorney|poa|report|plan|letter|template|document|nexus|personal statement)\b/i;
      if (_genMatch.test(userText)) {
        var _taskType = 'template';
        if (/resume|cv/i.test(userText)) _taskType = 'resume';
        else if (/report|plan|audit/i.test(userText)) _taskType = 'report';
        console.log('[FLOW] Resume/doc generation STARTED — task=' + _taskType);
        showAIWorkingState(_taskType);
      }
    }

    var apiPromise = callChatEndpoint(conversationHistory);

    apiPromise.then(function(apiResult) {
      // Phase 4.4: stale-response guard — discard if a newer request has superseded this one
      if (_p44ReqSeq !== _apiRequestSeq) {
        log('sendToAI', 'P4.4 STALE response discarded — seq=' + _p44ReqSeq + ' current=' + _apiRequestSeq);
        return;
      }
      var aiResponse = (apiResult && typeof apiResult === 'object') ? (apiResult.text || '') : (apiResult || '');
      var _p41Structured = (apiResult && typeof apiResult === 'object') ? (apiResult.structured || null) : null;
      log('sendToAI', 'API returned ' + aiResponse.length + ' chars' +
        (_p41Structured ? ' [+structured]' : ''));
      removeTyping();
      conversationHistory.push({ role: 'assistant', content: aiResponse });

      // ── Phase 47 / 4.1: Structured Response Contract ───────────────
      // Phase 4.1: prefer Claude tool_use structured output when present.
      // Phase 47 regex fallback used when structured is null.
      // This is ADDITIVE — the raw aiResponse string is still passed to
      // streamMessage unchanged. The contract enriches downstream systems.
      var _p47Contract = null;
      try {
        if (window.AIOS && window.AIOS.ResponseContract) {
          var _p47Ctx = {};
          // Attach router context if available from the callChatEndpoint scope
          if (window.AIOS.Router) {
            _p47Ctx.routeResult = window.AIOS.Router.routeAIOSIntent(userText);
          }
          if (window.AIOS.Memory) {
            _p47Ctx.profile = window.AIOS.Memory.getProfile();
          }
          if (window.AIOS.Mission) {
            _p47Ctx.mission = window.AIOS.Mission.current || null;
          }
          if (_p41Structured) {
            _p47Contract = _buildContractFromStructured(_p41Structured, aiResponse);
            window.AIOS._lastStructured = _p41Structured;
            console.log('[AIOS][STRUCTURED] mode=' + _p47Contract.mode +
              ' | checklist_items=' + (_p41Structured.checklist_items ? _p41Structured.checklist_items.length : 0) +
              ' | missions=' + (_p41Structured.missions ? _p41Structured.missions.length : 0) +
              ' | doc_actions=' + (_p41Structured.document_actions ? _p41Structured.document_actions.length : 0) +
              ' | dashboard_hint=' + (_p41Structured.dashboard_hint || 'none') +
              ' | report_ready=' + !!_p41Structured.report_ready);

            // ── AGENTIC: Auto-save generated templates/reports to dashboard ──
            // Synthesize document_actions when AI omitted them.
            // Covers: report_ready, mode=report, mode=template, and hard structural fallback.
            if (!_p41Structured.document_actions || _p41Structured.document_actions.length === 0) {

              // Case A: AI signalled report_ready or mode=report
              if (_p41Structured.report_ready || _p41Structured.mode === 'report') {
                _p41Structured.document_actions = [{
                  action: 'save_report',
                  template_type: 'benefits_report',
                  title: 'Personalized Benefits Report'
                }];
                console.log('[AIOS][STRUCTURED] synthesized document_actions — report_ready/mode=report');

              // Case B: AI signalled mode=template with real document content
              // Gate: 800 chars + at least 1 heading or 100+ words.
              // Prevents follow-up questions or short acknowledgments from
              // triggering a synthesized save when mode=template is set.
              } else if (_p41Structured.mode === 'template' && aiResponse.length > 800 &&
                ((aiResponse.match(/^#{1,3}\s+\S/gm) || []).length >= 1 || aiResponse.trim().split(/\s+/).length >= 100)) {
                var _tSlug = 'document';
                var _tTitle = 'Generated Document';
                if (/power of attorney/i.test(aiResponse))        { _tSlug = 'power_of_attorney';    _tTitle = 'Power of Attorney'; }
                else if (/living will|advance directive/i.test(aiResponse)) { _tSlug = 'living_will'; _tTitle = 'Living Will / Advance Directive'; }
                else if (/federal resume|usajobs/i.test(aiResponse)) { _tSlug = 'federal_resume';    _tTitle = 'Federal Resume (USAJobs)'; }
                else if (/resume builder|resume/i.test(aiResponse)) { _tSlug = 'resume';             _tTitle = 'Resume'; }
                else if (/nexus letter/i.test(aiResponse))          { _tSlug = 'nexus_letter';       _tTitle = 'Nexus Letter'; }
                else if (/appeal letter/i.test(aiResponse))         { _tSlug = 'va_appeal';          _tTitle = 'VA Appeal Letter'; }
                else if (/personal statement/i.test(aiResponse))    { _tSlug = 'personal_statement'; _tTitle = 'VA Personal Statement'; }
                else if (/hipaa/i.test(aiResponse))                 { _tSlug = 'hipaa_auth';         _tTitle = 'HIPAA Authorization'; }
                else if (/hardship letter/i.test(aiResponse))       { _tSlug = 'debt_hardship';      _tTitle = 'Debt Hardship Letter'; }
                else if (/credit dispute/i.test(aiResponse))        { _tSlug = 'credit_dispute';     _tTitle = 'Credit Dispute Letter'; }
                else if (/budget|financial recovery/i.test(aiResponse)) { _tSlug = 'budget_plan';   _tTitle = 'Financial Recovery Plan'; }
                else if (/linkedin/i.test(aiResponse))              { _tSlug = 'linkedin_profile';   _tTitle = 'LinkedIn Profile'; }
                else if (/salary negotiation/i.test(aiResponse))    { _tSlug = 'salary_negotiation'; _tTitle = 'Salary Negotiation Script'; }
                else if (/interview prep|star method/i.test(aiResponse)) { _tSlug = 'interview_prep'; _tTitle = 'Interview Prep Script'; }
                else if (/skills translator/i.test(aiResponse))     { _tSlug = 'skills_translator';  _tTitle = 'Military Skills Translator'; }
                _p41Structured.document_actions = [{
                  action: 'save_template',
                  template_type: _tSlug,
                  title: _tTitle
                }];
                console.log('[AIOS][STRUCTURED] synthesized document_actions — mode=template → ' + _tSlug);

              // Case C: Hard structural fallback — response has real content but AI forgot
              // both mode and document_actions. Fix 6: Also catches prose docs (letters,
              // statements) that lack markdown headings but have sufficient length.
              } else if (aiResponse.length > 500 && (
                (aiResponse.match(/^#{1,3}\s+\S/gm) || []).length >= 2 ||
                aiResponse.trim().split(/\s+/).length >= 150
              )) {
                var _fbSlug = 'document';
                var _fbTitle = 'Generated Document';
                if (_p41Structured.mode === 'report' || /personalized (plan|report|benefits)/i.test(aiResponse)) {
                  _fbSlug = 'benefits_report'; _fbTitle = 'Personalized Benefits Report';
                } else if (/power of attorney/i.test(aiResponse))   { _fbSlug = 'power_of_attorney';    _fbTitle = 'Power of Attorney'; }
                else if (/living will/i.test(aiResponse))            { _fbSlug = 'living_will';          _fbTitle = 'Living Will'; }
                else if (/resume/i.test(aiResponse))                 { _fbSlug = 'resume';               _fbTitle = 'Resume'; }
                else if (/nexus letter/i.test(aiResponse))           { _fbSlug = 'nexus_letter';         _fbTitle = 'Nexus Letter'; }
                else if (/appeal letter/i.test(aiResponse))          { _fbSlug = 'va_appeal';            _fbTitle = 'VA Appeal Letter'; }
                else if (/personal statement/i.test(aiResponse))     { _fbSlug = 'personal_statement';   _fbTitle = 'VA Personal Statement'; }
                else if (/action plan|next steps/i.test(aiResponse)) { _fbSlug = 'action_plan';          _fbTitle = 'Action Plan'; }
                _p41Structured.document_actions = [{
                  action: 'save_template',
                  template_type: _fbSlug,
                  title: _fbTitle
                }];
                console.log('[AIOS][STRUCTURED] hard-fallback synthesized document_actions — ' + _fbSlug + ' (len=' + aiResponse.length + ', headings=' + (aiResponse.match(/^#{1,3}\s+\S/gm) || []).length + ')');
              }
            }
            // Fix 2: Chain dashboard handoff on actual save success
            var _docSaveResult = _processDocumentActions(_p41Structured, aiResponse);
            if (_docSaveResult && typeof _docSaveResult.then === 'function') {
              _docSaveResult.then(function(anySaved) {
                if (anySaved) {
                  console.log('[AIOS][DOC-ACTION] save confirmed — injecting dashboard handoff');
                  _injectDashboardHandoff(_p41Structured.dashboard_hint || (_p41Structured.report_ready ? 'show_reports' : 'show_profile'));
                }
              });
            }

            // ── AGENTIC: Persist checklist items from structured output ──
            if (_p41Structured.checklist_items && _p41Structured.checklist_items.length > 0 &&
                window.AIOS && window.AIOS.Checklist &&
                typeof window.AIOS.Checklist.addItem === 'function') {
              _p41Structured.checklist_items.forEach(function(item) {
                if (!item || !item.title) return;
                window.AIOS.Checklist.addItem({
                  title:       item.title,
                  category:    item.category || 'immediate',
                  description: item.description || '',
                  source:      'ai_conversation'
                });
              });
              console.log('[AIOS][STRUCTURED] persisted ' + _p41Structured.checklist_items.length + ' checklist items');
            }
          } else {
            _p47Contract = window.AIOS.ResponseContract.parse(aiResponse, _p47Ctx);
            console.log('[AIOS][CONTRACT] mode=' + _p47Contract.mode +
              ' | confidence=' + _p47Contract.confidence.toFixed(2) +
              ' | actions=' + (_p47Contract.recommended_actions ? _p47Contract.recommended_actions.length : 0) +
              ' | missionSignal=' + !!_p47Contract.mission_signals);
          }

          // Mission extraction — create or update missions from the response
          if (window.AIOS.MissionExtractor) {
            var _p47MissionAction = window.AIOS.MissionExtractor.process(
              _p47Contract,
              (window.AIOS.Mission && window.AIOS.Mission.current) || null
            );
            if (_p47MissionAction) {
              console.log('[AIOS][MISSION-EXT] action=' + _p47MissionAction.action +
                ' | type=' + (_p47MissionAction.mission ? _p47MissionAction.mission.type : 'none'));

              // PHASE 2 - Use new persistent layer if activeCaseId present
              // Sync MissionExtractor result to Supabase. Fire-and-forget.
              if (_activeCaseId && window.AAAI && window.AAAI.DataAccess &&
                  _p47MissionAction.mission) {
                (function(_ma) {
                  var _mObj = _ma.mission;
                  if (_ma.action === 'create' && !_mObj._dbId) {
                    // MissionExtractor created a brand-new mission
                    withRetry(function() { return window.AAAI.DataAccess.missions.create(_activeCaseId, _mObj); }, 'missions.create:MissionExt')
                      .then(function(r) {
                        if (!r.error && r.data && r.data.id) {
                          _mObj._dbId = r.data.id;
                          if (window.AIOS.Mission) window.AIOS.Mission.current = _mObj;
                          log('Phase2', 'MissionExt create persisted — dbId: ' + r.data.id);
                        }
                      }).catch(function(e) { console.error('[AAAI ERROR][missions.create] MissionExt — type:', _mObj.type, '| case:', _activeCaseId, '|', e); });
                  } else if ((_ma.action === 'update' || _ma.action === 'complete') && _mObj._dbId) {
                    // MissionExtractor updated an existing persisted mission
                    withRetry(function() { return window.AAAI.DataAccess.missions.sync(_mObj._dbId, _mObj); }, 'missions.sync:MissionExt')
                      .then(function(r) {
                        if (!r.error) {
                          log('Phase2', 'MissionExt ' + _ma.action + ' synced — dbId: ' + _mObj._dbId);
                        }
                      }).catch(function(e) { console.error('[AAAI ERROR][missions.sync] MissionExt — action:', _ma.action, '| dbId:', _mObj._dbId, '|', e); });
                  }
                })(_p47MissionAction);
              }
            }
          }

          // Store latest contract on window for dashboard/inspector access
          window.AIOS._lastContract = _p47Contract;
          // Phase CR: persist display subset for cross-navigation continuity
          try { localStorage.setItem('aaai_contract_display', JSON.stringify({ recommended_actions: (_p47Contract.recommended_actions || []).slice(0, 5), resources: (_p47Contract.resources || []).slice(0, 10), risk_flags: _p47Contract.risk_flags || [], _savedAt: Date.now() })); } catch (_cr3) { /* non-critical */ }

          // ── Phase 50: Resource Matcher — RESOURCE MATCHER ACTIVATED - Phase 1 Fix ──
          // Async — fires while the message streams, never blocks the chat.
          // Attaches matched_resources to the contract + window.AIOS._lastMatches
          // so ActionBar, Inspector, and dashboard can consume them.
          if (window.AIOS.ResourceMatcher) {
            var _p50Profile = (_p47Ctx && _p47Ctx.profile) ? _p47Ctx.profile : null;
            (function(_contract) {
              window.AIOS.ResourceMatcher.match(_contract, _p50Profile).then(function(matches) {
                _contract.matched_resources = matches; // RESOURCE MATCHER ACTIVATED - Phase 1 Fix
                window.AIOS._lastMatches = matches;    // RESOURCE MATCHER ACTIVATED - Phase 1 Fix
                if (matches.length > 0) {
                  console.log('[AIOS][RESOURCE-MATCHER] matched ' + matches.length +
                    ' resources | top=' + matches[0].name +
                    ' (confidence=' + matches[0].confidence + ')');
                } else {
                  console.log('[AIOS][RESOURCE-MATCHER] no matches for this response');
                }
              });
            })(_p47Contract);
          }
          // ── End Phase 50 ─────────────────────────────────────────────────────────
        }
      } catch (_p47Err) {
        // Never block the chat — contract parsing is enhancement only
        console.warn('[AIOS][CONTRACT] parse error:', _p47Err.message || _p47Err);
      }
      // ── End Phase 47 ──────────────────────────────────────────────

      clearAIWorkingState(); // remove generation banner before streaming starts
      _activeForceTask = null; // clear force state after response received

      // ── Phase DOC-GEN: Replace full document with confirmation in chat ──
      // When _processDocumentActions will save the document (document_actions present
      // + content passes the 400-char gate), stream a short confirmation instead of
      // the entire document.  The full content is preserved in conversationHistory
      // and saved to the dashboard — only the chat bubble changes.
      var _streamText = aiResponse;  // default: stream everything
      if (_p41Structured && _p41Structured.document_actions &&
          _p41Structured.document_actions.length > 0 && aiResponse.length >= 400 &&
          window.AAAI && window.AAAI.auth && window.AAAI.auth.isLoggedIn &&
          window.AAAI.auth.isLoggedIn()) {
        var _docTitle = _p41Structured.document_actions[0].title || 'your document';
        _streamText = '\u2705 **' + _docTitle + '** has been generated and saved to your dashboard.\n\n' +
          'You can view, download, or delete it from your **[Profile \u2192 Generated Documents](/profile.html)** page.\n\n' +
          '_If you need changes, just let me know and I\u2019ll regenerate it._';
        console.log('[DOC-GEN] Replaced full document (' + aiResponse.length + ' chars) with confirmation in chat');
      }

      streamMessage(_streamText, function() {
        log('sendToAI', 'stream complete');
        isProcessing = false;
        if (btnSend) btnSend.disabled = false;
        if (userInput) userInput.focus();
        // TTS: read AI response aloud in text mode
        speakAIText(_streamText);
        // Phase 33: flush any queued non-typed submission (chip/button clicked during AI response)
        if (pendingUserSubmission) {
          var _queued = pendingUserSubmission;
          pendingUserSubmission = null;
          log('[AAAI]', 'FORCE flush queued submission: "' + _queued.text.substring(0, 40) + '"');
          setTimeout(function() { sendToAI(_queued.text); }, 50);
        }

        // Show topic bubbles once after the opening greeting
        if (!topicBubblesShown && (userText === 'START_CONVERSATION' || userText === 'RESUME_MISSION')) {
          topicBubblesShown = true;
          renderTopicBubbles();
        }

        // Show Generate Report button when conditions met
        maybeShowReportButton();

        // Phase 2: Detect report and show PDF download + checklist
        // Uses BOTH the regex heuristic AND the structured report_ready flag.
        // Structured flag takes priority — it's the AI's explicit signal.
        var _reportDetectedByRegex = isReportResponse(aiResponse);
        var _reportDetectedByStructured = _p41Structured && _p41Structured.report_ready;
        if (_reportDetectedByRegex || _reportDetectedByStructured) {
          log('Report', 'detected — showing actions (regex=' + _reportDetectedByRegex + ' structured=' + !!_reportDetectedByStructured + ')');
          reportGenerated = true;
          showReportActions(aiResponse);
        }

        // Phase 46 Parts 1+2: Sync mission state + save conversation snapshot after each turn
        try {
          if (window.AIOS && window.AIOS.MissionState) {
            window.AIOS.MissionState.syncFromAIOS();
            // Save conversation snapshot (exclude synthetic openers)
            if (userText !== 'START_CONVERSATION') {
              window.AIOS.MissionState.saveConversation(conversationHistory);
            }
          }
        } catch(_p46Err) { /* never block the UI */ }

        // ── Phase 49: Action Bar — contextual buttons from response contract ──
        try {
          if (_p47Contract && window.AIOS && window.AIOS.ActionBar) {
            // Find the last AI message div in the chat (the one just streamed)
            var _p49Msgs = chatMessages ? chatMessages.querySelectorAll('.message--ai') : [];
            var _p49LastMsg = _p49Msgs.length > 0 ? _p49Msgs[_p49Msgs.length - 1] : null;
            if (_p49LastMsg) {
              var _p49Rendered = window.AIOS.ActionBar.render(_p47Contract, _p49LastMsg);
              if (_p49Rendered) {
                scrollToBottom();
              }
            }
          }
        } catch (_p49Err) {
          console.warn('[AIOS][ACTION-BAR] render error:', _p49Err.message || _p49Err);
        }
        // ── End Phase 49 ─────────────────────────────────────────────────────

        // ── AGENTIC: Dashboard handoff bar after significant actions ──────
        // RULE: Handoff bar appears ONLY after a REAL save succeeds.
        // Never from phrase-detection, never from dashboard_hint alone.
        try {
          var _dashboardInjected = false;

          // document_actions / report_ready: handoff deferred to _processDocumentActions
          // .then() callback (lines ~3086-3093) — only fires when anySaved === true.
          if (_p41Structured) {
            if (_p41Structured.report_ready) {
              console.log('[AIOS][DASHBOARD-HANDOFF] report_ready — handoff deferred to _processDocumentActions');
              _dashboardInjected = true;
            } else if (_p41Structured.document_actions && _p41Structured.document_actions.length > 0) {
              console.log('[AIOS][DASHBOARD-HANDOFF] document_actions present — handoff deferred to save callback');
              _dashboardInjected = true;
            } else if (_p41Structured.checklist_items && _p41Structured.checklist_items.length > 0) {
              _injectDashboardHandoff('show_checklist');
              _dashboardInjected = true;
            }
          }

          // REMOVED: Priority 1 (dashboard_hint alone) — fired without save confirmation.
          // REMOVED: Priority 3 (phrase-detection fallback) — fired when AI verbally said
          // "saved to your dashboard" even when no save occurred. This was the primary
          // cause of false handoff bars.
          // The ONLY path to a handoff bar for documents/reports is now through
          // _processDocumentActions().then(anySaved => { if (anySaved) ... }) above.
        } catch (_dhErr) {
          console.warn('[AIOS][DASHBOARD-HANDOFF] error:', _dhErr.message || _dhErr);
        }
        // ── End dashboard handoff ─────────────────────────────────────────
      });

    }).catch(function(error) {
      // Phase 4.4: stale-error guard — discard error from a superseded request
      if (_p44ReqSeq !== _apiRequestSeq) {
        log('sendToAI', 'P4.4 STALE error discarded — seq=' + _p44ReqSeq + ' current=' + _apiRequestSeq);
        return;
      }
      // Phase 5: timeout recovery — guaranteed isProcessing reset + queue flush
      clearAIWorkingState();
      if (error.message === 'AI_TIMEOUT') {
        removeTyping();
        log('sendToAI', 'P5 TIMEOUT — aborted after 15s, seq=' + _p44ReqSeq);
        addMessage('It\'s taking longer than usual to connect. Please try again in a moment. If you need immediate help, call the Veterans Crisis Line at 988 (Press 1).', 'ai');
        isProcessing = false;
        if (btnSend) btnSend.disabled = false;
        if (pendingUserSubmission) {
          var _queuedTimeout = pendingUserSubmission;
          pendingUserSubmission = null;
          log('[AAAI]', 'FORCE flush queued submission (timeout path): "' + _queuedTimeout.text.substring(0, 40) + '"');
          setTimeout(function() { sendToAI(_queuedTimeout.text); }, 50);
        }
        return;
      }
      removeTyping();
      clearAIWorkingState();
      console.error('[AAAI ERROR][sendToAI]', error.message, error);

      var mockResponse = getMockResponse(userText);
      if (mockResponse) {
        streamMessage(mockResponse, function() {
          conversationHistory.push({ role: 'assistant', content: mockResponse });
          isProcessing = false;
          if (btnSend) btnSend.disabled = false;
          maybeShowReportButton();
          // Phase 33: flush queued submission (mock-response recovery path)
          if (pendingUserSubmission) {
            var _queued2 = pendingUserSubmission;
            pendingUserSubmission = null;
            log('[AAAI]', 'FORCE flush queued submission (mock path): "' + _queued2.text.substring(0, 40) + '"');
            setTimeout(function() { sendToAI(_queued2.text); }, 50);
          }
        });
      } else {
        addMessage('I\'m having trouble connecting right now. Please try again in a moment. If you need immediate help, call the Veterans Crisis Line at 988 (Press 1).', 'ai');
        isProcessing = false;
        if (btnSend) btnSend.disabled = false;
        maybeShowReportButton();
        // Phase 33: flush queued submission (hard-error recovery path)
        if (pendingUserSubmission) {
          var _queued3 = pendingUserSubmission;
          pendingUserSubmission = null;
          log('[AAAI]', 'FORCE flush queued submission (error path): "' + _queued3.text.substring(0, 40) + '"');
          setTimeout(function() { sendToAI(_queued3.text); }, 50);
        }
      }
    });
  }

  // ── SIMULATED STREAMING (abortable) ──────────────────
  function abortStreaming() {
    if (activeStreamTimer) {
      clearTimeout(activeStreamTimer);
      activeStreamTimer = null;
      log('abortStreaming', 'stream timer cleared');
    }
  }

  function streamMessage(fullText, onComplete) {
    _dismissOnboardCard(); // Phase 21
    var div = document.createElement('div');
    div.className = 'message message--ai message--streaming';
    if (chatMessages) chatMessages.appendChild(div);

    // Strip [OPTIONS: ...] from streaming text so raw markup doesn't show
    var streamText = fullText.replace(/\[OPTIONS:\s*.*?\]/g, '').replace(/\s+$/, '');
    var words = streamText.split(/(\s+)/);
    var html = '';
    var i = 0;
    var batchSize = 3;

    function renderBatch() {
      if (i >= words.length) {
        activeStreamTimer = null;
        div.classList.remove('message--streaming');
        div.innerHTML = formatMessage(fullText);
        // Set reportGenerated before injectLegalDocButton so the gate passes for the report message
        if (!reportGenerated && isReportResponse(fullText)) {
          reportGenerated = true;
        }
        // Phase 3.5: inject Download Word Doc button for legal template responses
        injectLegalDocButton(div, fullText);
        scrollToBottom();
        if (onComplete) onComplete();
        return;
      }

      var end = Math.min(i + batchSize, words.length);
      for (var j = i; j < end; j++) {
        html += escapeHtml(words[j]);
      }
      div.innerHTML = html + '<span class="stream-cursor"></span>';
      i = end;
      scrollToBottom();
      activeStreamTimer = setTimeout(renderBatch, CONFIG.streamDelay);
    }

    renderBatch();
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── MOCK RESPONSES ──────────────────────────────────
  function getMockResponse(userText) {
    if (userText === 'START_CONVERSATION') {
      return 'Welcome to AfterAction AI. I\'m here to help you find every benefit, resource, and organization you\'ve earned through your service \u2014 and build you a personalized plan. Free. No forms. No judgment.\n\nBefore we start talking, here\'s a tip: the more documents you upload up front, the more accurate and personalized your plan will be \u2014 and the fewer questions I\'ll need to ask.\n\nTap the upload button (arrow icon at the bottom) and drop in anything you have: DD-214, VA Disability Rating Letter, VA Benefits Summary, military transcripts, resume, certificates, or diplomas. I\'ll pull the details automatically.\n\nUpload as many as you want, or none at all. Your information is used only to help build your plan. Some data may be securely stored to improve your experience, but it is never sold or shared. Your privacy matters.\n\nWhen you\'re ready \u2014 uploaded or not \u2014 just tell me: what branch did you serve in?\n\n[OPTIONS: Army | Navy | Air Force | Marine Corps | Coast Guard | Space Force | National Guard | Reserve | I\'m a family member]';
    }
    if (userText === 'RESUME_MISSION') {
      // Phase 7: Refresh dashboard context for the freshest state on resume
      _loadDashboardContext();
      // Phase 43/46: Smart resume — surface missionState + profile data + resource options
      // Phase ID-GUARD: Never assert name or branch directly. Build a confirmation
      // summary so the user can verify stale profile data before the system uses it.
      var _rProf = (window.AIOS && window.AIOS.Memory) ? window.AIOS.Memory.getProfile() : {};
      var _rParts = [];
      if (_rProf.name)             _rParts.push('Name: ' + _rProf.name);
      if (_rProf.branch)           _rParts.push('Branch: ' + _rProf.branch);
      if (_rProf.dischargeStatus)  _rParts.push(_rProf.dischargeStatus + ' discharge');
      if (_rProf.vaRating !== null && _rProf.vaRating !== undefined) _rParts.push(_rProf.vaRating + '% VA rating');
      if (_rProf.state)            _rParts.push('based in ' + _rProf.state);
      var _rSummary = _rParts.length > 0
        ? ' I have some info on file from before — ' + _rParts.join(', ') + '. Is that still correct?'
        : '';

      // Phase 46 Part 1: Enrich with missionState if available
      var _mState = null;
      var _mStateMsg = '';
      if (window.AIOS && window.AIOS.MissionState) {
        try {
          _mState = window.AIOS.MissionState.get();
          if (_mState) {
            if (_mState.missionType) _mStateMsg = ' Your active mission: ' + _mState.missionType.replace(/_/g, ' ').toLowerCase() + '.';
            if (_mState.currentStep) _mStateMsg += ' Last step: ' + _mState.currentStep + '.';
          }
        } catch(_msE) { /* keep default */ }
      }

      // Build option set — first option driven by missionType or top resource priority
      var _rOpt1 = 'Continue my plan';
      if (_mState && _mState.missionType) {
        _rOpt1 = 'Continue ' + _mState.missionType.replace(/_/g, ' ').toLowerCase();
      } else if (window.AIOS && window.AIOS.Resources && _rProf) {
        try {
          var _rPrio = window.AIOS.Resources.getPriority(_rProf);
          if (_rPrio && _rPrio.length > 0) {
            _rOpt1 = _rPrio[0].label;
          }
        } catch(_rE) { /* keep default */ }
      }

      // Phase 46: mention conversation history context if rehydrated
      var _histMsg = '';
      if (conversationHistory.length > 0) {
        _histMsg = " I've loaded our previous conversation so we can pick up right where we left off.";
      }

      return 'Welcome back.' + _rSummary + _mStateMsg + _histMsg + ' What would you like to work on?\n\n[OPTIONS: ' + _rOpt1 + ' | Upload a document | Check my benefits | Update my info | Start over]';
    }
    return null;
  }

  // ── SERVERLESS PROXY ────────────────────────────────
  function callChatEndpoint(messages) {
    log('callChatEndpoint', 'messages=' + messages.length);

    // ── AIOS Integration (text path only) ─────────────────
    // If the AIOS layer is loaded, route through it to get a richer system prompt.
    // Falls back to the original SYSTEM_PROMPT if AIOS is unavailable or errors.

    // Phase 16: Shared ACTION PAYLOAD block builder — used by both skill path and GQ path.
    // Returns a '\n\n## ACTION PAYLOAD\n...' string, or '' when ap is null/missing.
    function _buildApBlock(ap) {
      if (!ap || typeof ap !== 'object') return '';
      var _b = '\n\n## ACTION PAYLOAD\n' +
        'Structured action prepared by the routing engine for this turn:\n' +
        '- Type: '   + ap.type + '\n' +
        '- Target: ' + (ap.page || 'none') + '\n' +
        '- Intent: ' + (ap.params.intent || 'unknown') + '\n';
      if (ap.params.skill)     _b += '- Skill: '     + ap.params.skill     + '\n';
      if (ap.params.goal)      _b += '- Goal: '      + ap.params.goal      + '\n';
      if (ap.params.need)      _b += '- Need: '      + ap.params.need      + '\n';
      if (ap.params.urgency)   _b += '- Urgency: '   + ap.params.urgency   + '\n';
      if (ap.params.situation) _b += '- Situation: ' + ap.params.situation + '\n';
      if (ap.next_step)        _b += '- Next step: ' + ap.next_step        + '\n';
      _b += '- Priority: ' + ap.priority + '\n';
      _b += 'Use the target URL above for action links. Do NOT invent or modify execution page URLs.';
      return _b;
    }

    var systemPrompt = SYSTEM_PROMPT;  // already a string (joined at definition)
    var aiosActive = false;
    var _r3PreMatchP = null;  // Phase R3.3: pre-response resource matching Promise
    var _rilResult = null;    // Phase E-C.5: RIL result; populated after skill.run()

    try {
      if (window.AIOS && window.AIOS.Router && window.AIOS.RequestBuilder) {
        // Get the last user message for routing
        var lastUserMsg = '';
        for (var i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') { lastUserMsg = messages[i].content; break; }
        }

        if (lastUserMsg) {
          // 1. Route — classify intent and select skill
          var routeResult = window.AIOS.Router.routeAIOSIntent(lastUserMsg);
          console.log('[AIOS][ROUTER][MATCH] intent=' + routeResult.intent + ' | skill=' + (routeResult.skill || 'none') + ' | confidence=' + routeResult.confidence + (routeResult.matched ? ' | matched="' + routeResult.matched + '"' : ''));

          // Phase 9 — D1 FIX: Record routing intent as execution state.
          // save() is called at routing time (not at execution engine completion)
          // because execution engines live in separate HTML pages that don't load
          // memory-manager.js. This gives the resume banner an accurate last page
          // with intent context. resultIds [] here — populated by the execution
          // engine when HTML pages are updated in a future phase.
          if (routeResult.executionUrl && window.AIOS && window.AIOS.ExecutionState) {
            window.AIOS.ExecutionState.save(
              routeResult.executionUrl,
              { intent: routeResult.intent, skill: routeResult.skill || null },
              []
            );
          }

          // Phase 11: Automation Layer — generate structured action payload from route result.
          // Payload is only generated for execution_route type (non-null executionUrl,
          // non-CRISIS/AT_RISK tier). Attached to routeResult.actionPayload so the
          // response engine can reference it without a second module call.
          // Stored in ExecutionState for cross-session persistence.
          if (window.AIOS && window.AIOS.ActionPayload) {
            var _p11Payload = window.AIOS.ActionPayload.generate(routeResult);
            if (_p11Payload) {
              routeResult.actionPayload = _p11Payload;
              window.AIOS.ActionPayload.store(_p11Payload);
              console.log('[AIOS][PAYLOAD] type=' + _p11Payload.type + ' | page=' + (_p11Payload.page || 'none') + ' | priority=' + _p11Payload.priority + (_p11Payload.partner_action ? ' | partner=' + _p11Payload.partner_action.partner_id : ''));
            }
          }

          // Phase 32: Telemetry — escalation tier (text path)
          if (routeResult.tier !== 'STANDARD' && window.AIOS && window.AIOS.Telemetry) {
            window.AIOS.Telemetry.record('escalation_triggered', { tier: routeResult.tier, path: 'text' });
          }

          // Phase R3.3: Fire pre-response resource matching (async, non-blocking).
          // Result is consumed AFTER the try/catch, injected into systemPrompt before the API call.
          if (window.AIOS.ResourceMatcher && typeof window.AIOS.ResourceMatcher.preMatch === 'function') {
            var _r3Prof = (window.AIOS.Memory) ? window.AIOS.Memory.getProfile() : null;
            _r3PreMatchP = window.AIOS.ResourceMatcher.preMatch(lastUserMsg, _r3Prof, routeResult)
              .catch(function(_r3Err) {
                console.warn('[AIOS][PRE-MATCH] failed:', _r3Err.message || _r3Err);
                return { resources: [], promptBlock: '' };
              });
          }

          // 2. Only activate AIOS when a specific skill is routed.
          //    GENERAL_QUESTION (skill === null) uses the legacy SYSTEM_PROMPT
          //    so intake phases, OPTIONS, templates, and all existing rules are preserved.
          if (routeResult.skill && window.AIOS.SkillLoader) {
            var skill = window.AIOS.SkillLoader.loadAIOSSkill(routeResult.skill);
            if (skill && typeof skill.run === 'function') {
              var profile = (window.AIOS.Memory) ? window.AIOS.Memory.getProfile() : {};

              // Phase ID-GUARD (skill path): Strip stale name and branch before passing
              // the profile to skill.run() — mirrors the voice filter (~line 1267) and
              // the memoryContext filter below. Prevents stale identity from reaching
              // the prompt via skillConfig if a skill surfaces profile.name or profile.branch.
              var _skillProfile = Object.assign({}, profile);
              var _skillFreshId = (window.AIOS.Memory &&
                  typeof window.AIOS.Memory.extractMemoryFromInput === 'function')
                ? window.AIOS.Memory.extractMemoryFromInput(lastUserMsg)
                : {};
              if (!_skillFreshId.name)   delete _skillProfile.name;
              if (!_skillFreshId.branch) delete _skillProfile.branch;

              var skillConfig = skill.run({ profile: _skillProfile, history: messages, userInput: lastUserMsg, tier: routeResult.tier || 'STANDARD' }); // Phase 22
              console.log('[AIOS][SKILL] ' + skill.name + ' | intent=' + routeResult.intent);

              // Phase 25: Chain — if the skill returned a chain handoff, register it.
              // Chain.set() applies all safety gates (CRISIS/AT_RISK/cooldown) internally.
              // The suggestion engine will surface it as S0 after the response streams.
              if (skillConfig && skillConfig.data && skillConfig.data.chain && window.AIOS.Chain) {
                window.AIOS.Chain.set(skillConfig.data.chain, routeResult.tier || 'STANDARD');
                console.log('[AIOS][CHAIN] queued nextSkill=' + skillConfig.data.chain.nextSkill);
              }

              // Phase E-C.5: RIL integration hook.
              // After skill.run() returns and chain is registered, route the skill
              // envelope through the Response Intelligence Layer. If shaped text is
              // produced it will bypass the API call inside _r3ResolvedP.then().
              // No-op when Engine is absent or flag is off (Engine.runSkill returns
              // empty shapedText → legacy path continues unchanged).
              if (window.AIOS.Engine &&
                  typeof window.AIOS.Engine.runSkill === 'function' &&
                  window.AIOS.Memory &&
                  typeof window.AIOS.Memory.getSkillContext === 'function') {
                var _memCtx = window.AIOS.Memory.getSkillContext();
                _rilResult = window.AIOS.Engine.runSkill({
                  routeResult: routeResult,
                  skillConfig:  skillConfig,
                  profile:      _memCtx.profile,
                  session:      _memCtx.session
                });
              }

              // 3. Build AIOS request — core prompt + skill + memory + page context
              var pageContext = null;
              if (window.activeUserTopics && window.activeUserTopics.length > 0) {
                pageContext = { page: 'chat', topics: window.activeUserTopics, inputMode: inputMode };
              }

              // Phase ID-GUARD (text path): Strip stale name and branch from the profile
              // injected into the AIOS request — mirrors the voice-path filter at line ~1267.
              // Prevents prior-session identity data from being asserted without confirmation.
              var _textProfile = Object.assign({}, profile);
              var _textFreshId = _skillFreshId; // reuse extraction result — same message, same result
              if (!_textFreshId.name)   delete _textProfile.name;
              if (!_textFreshId.branch) delete _textProfile.branch;

              var aiosRequest = window.AIOS.RequestBuilder.buildAIOSRequest({
                userMessage: lastUserMsg,
                routeResult: routeResult,
                skillConfig: skillConfig,
                memoryContext: _textProfile,
                pageContext: pageContext
              });

              if (aiosRequest && aiosRequest.system && aiosRequest.system.length > 0) {
                // Phase 34: AIOS AUGMENTS SYSTEM_PROMPT — never replaces it.
                // SYSTEM_PROMPT (conversation phases, OPTIONS format, intake flow, tone rules)
                // stays first. AIOS content (skill prompt, memory, eligibility, mission) is
                // appended after so the full operational ruleset is always present.
                systemPrompt = SYSTEM_PROMPT + '\n\n' + aiosRequest.system;
                // Phase 9: Dedup — append completed action IDs so AI avoids re-suggesting them
                if (window.AIOS && window.AIOS.ExecutionState) {
                  var _p9Done = window.AIOS.ExecutionState.getCompletedIds();
                  if (_p9Done.length > 0) {
                    systemPrompt += '\n\n## ALREADY COMPLETED\nThe veteran has already viewed or ' +
                      'taken action on these resources. Do NOT suggest them again: ' + _p9Done.join(', ') + '.';
                  }
                }
                // Phase 10: Personalization — inject engagement history context (advisory only)
                if (window.AIOS && window.AIOS.Personalization) {
                  var _p10Block = window.AIOS.Personalization.buildPromptBlock();
                  if (_p10Block) systemPrompt += _p10Block;
                }
                // Phase 11/16: Action payload — inject via shared helper (single source of truth).
                // Only fires when an execution_route payload was generated this turn.
                if (routeResult.actionPayload) {
                  systemPrompt += _buildApBlock(routeResult.actionPayload);
                }
                aiosActive = true;
                console.log('[AIOS][REQUEST] systemLen=' + systemPrompt.length + ' | intent=' + aiosRequest.meta.intent + ' | skill=' + aiosRequest.meta.skill + ' | tier=' + aiosRequest.meta.escalationTier + ' | hasMemory=' + aiosRequest.meta.hasMemory + ' | partnerPath=' + aiosRequest.meta.hasPartnerPath);
              }
            }
          } else {
            // ── Phase 35: GENERAL_QUESTION still gets memory/eligibility/mission context ──
            // No skill prompt, but veteran profile, eligibility scores, active mission,
            // and page context are still injected so the AI has conversational memory.
            log('AIOS', 'no skill routed (intent=' + routeResult.intent + ') — injecting AIOS context without skill');
            try {
              var _gqPageCtx = null;
              if (window.activeUserTopics && window.activeUserTopics.length > 0) {
                _gqPageCtx = { page: 'chat', topics: window.activeUserTopics, inputMode: inputMode };
              }
              var _gqRequest = window.AIOS.RequestBuilder.buildAIOSRequest({
                userMessage: lastUserMsg,
                routeResult: routeResult,
                skillConfig: null,
                memoryContext: (window.AIOS.Memory) ? window.AIOS.Memory.getProfile() : null,
                pageContext: _gqPageCtx
              });
              if (_gqRequest && _gqRequest.system && _gqRequest.system.length > 0) {
                systemPrompt = SYSTEM_PROMPT + '\n\n' + _gqRequest.system;
                // Phase 9: Dedup — same suppression for GENERAL_QUESTION path
                if (window.AIOS && window.AIOS.ExecutionState) {
                  var _gqDone = window.AIOS.ExecutionState.getCompletedIds();
                  if (_gqDone.length > 0) {
                    systemPrompt += '\n\n## ALREADY COMPLETED\nThe veteran has already viewed or ' +
                      'taken action on these resources. Do NOT suggest them again: ' + _gqDone.join(', ') + '.';
                  }
                }
                // Phase 10: Personalization — inject engagement history context (advisory only)
                if (window.AIOS && window.AIOS.Personalization) {
                  var _gqP10Block = window.AIOS.Personalization.buildPromptBlock();
                  if (_gqP10Block) systemPrompt += _gqP10Block;
                }
                // Phase 11/16: Action payload — same shared helper as skill path.
                // No-op for GENERAL_QUESTION (executionUrl is null → no actionPayload).
                if (routeResult.actionPayload) {
                  systemPrompt += _buildApBlock(routeResult.actionPayload);
                }
                aiosActive = true;
                console.log('[AIOS][GENERAL] systemLen=' + systemPrompt.length + ' | hasMemory=' + _gqRequest.meta.hasMemory + ' | hasMission=' + _gqRequest.meta.hasMission + ' | confidence=' + _gqRequest.meta.confidenceLevel);
              }
            } catch (_gqErr) {
              log('AIOS', 'GENERAL_QUESTION context injection error: ' + _gqErr.message);
            }
          }
        }
      }
    } catch (aiosErr) {
      // AIOS failed — fall back silently to original SYSTEM_PROMPT
      log('AIOS', 'FALLBACK — error: ' + aiosErr.message);
      // Phase 32: Telemetry — record fallback event (error type only, no user text)
      try {
        if (window.AIOS && window.AIOS.Telemetry) {
          window.AIOS.Telemetry.record('aios_fallback', { err: aiosErr.message });
        }
      } catch (e) { /* never let telemetry break the fallback path */ }
      systemPrompt = SYSTEM_PROMPT;
      aiosActive = false;
      _r3PreMatchP = null;  // Phase R3.3: discard on AIOS error
    }

    // Phase R3.3: Resolve preMatch, inject into prompt, then build payload and send.
    // preMatch runs in parallel with the synchronous AIOS block above (skill loading,
    // profile guards, buildAIOSRequest). By this point systemPrompt is fully assembled.
    // We now wait for the matcher, inject matched resources into the existing
    // ## RESOURCE CONTEXT section, then proceed to the API call.
    var _r3ResolvedP = (_r3PreMatchP && aiosActive) ? _r3PreMatchP : Promise.resolve(null);
    return _r3ResolvedP.then(function(_r3Res) {
      if (_r3Res && _r3Res.promptBlock) {
        var _r3Block = '\n\nMATCHED RESOURCES \u2014 verified internal data (cite these by name and link):\n' +
          _r3Res.promptBlock +
          '\nWhen recommending resources, prefer these matched results over general knowledge. Use the exact page links shown.';
        var _r3Idx = systemPrompt.indexOf('## RESOURCE CONTEXT');
        if (_r3Idx !== -1) {
          // Insert before the next section (## heading) or end of string
          var _r3NextSec = systemPrompt.indexOf('\n\n## ', _r3Idx + 19);
          if (_r3NextSec === -1) _r3NextSec = systemPrompt.length;
          systemPrompt = systemPrompt.slice(0, _r3NextSec) + _r3Block + systemPrompt.slice(_r3NextSec);
        } else {
          // No resource context section — add a complete one
          systemPrompt += '\n\n## RESOURCE CONTEXT' + _r3Block;
        }
        console.log('[AIOS][PRE-MATCH] injected ' + _r3Res.resources.length + ' matched resources into prompt | systemLen=' + systemPrompt.length);
      }

      // Phase E-C.5: RIL bypass check.
      // If the engine produced shaped text this turn, return it directly —
      // no API call, no payload assembly. Raw envelope and trace are preserved
      // on the result object for debug/audit panel consumption.
      // If shapedText is empty (unsupported intent, flag off, or shaper fallback),
      // fall through to the existing payload + API call path unchanged.
      if (_rilResult && _rilResult.shapedText && _rilResult.shapedText.length > 0) {
        console.log('[AIOS][APP][OUTPUT] RIL | tone=' + _rilResult.rilTone + ' | intent=' + (routeResult ? routeResult.intent : 'unknown'));
        return Promise.resolve({
          text:        _rilResult.shapedText,
          structured:  null,
          rawEnvelope: _rilResult.rawEnvelope,
          rilTrace:    _rilResult.rilTrace,
          rilTone:     _rilResult.rilTone,
          rilEnabled:  _rilResult.rilEnabled
        });
      }
      if (_rilResult !== null) {
        console.log('[AIOS][APP][OUTPUT] legacy | intent=' + (routeResult ? routeResult.intent : 'unknown'));
      }

    // Build request payload
    var payload = {
      system: systemPrompt,
      messages: messages.length === 0
        ? [{ role: 'user', content: 'Begin the conversation. Send your opening welcome message.' }]
        : messages
    };

    // ── forceTask: hard system override for immediate document generation ──
    if (_activeForceTask === 'resume_generation') {
      payload.system_override = '\n\n## HARD OVERRIDE — IMMEDIATE RESUME GENERATION\n' +
        'You are generating a completed resume RIGHT NOW.\n' +
        'RULES:\n' +
        '- DO NOT ask questions.\n' +
        '- DO NOT say "I still need..." or "Could you provide...".\n' +
        '- DO NOT delay or explain what you are about to do.\n' +
        '- DO NOT output filler text like "still working on it" or "let me get that for you".\n' +
        '- OUTPUT the FULL, COMPLETED resume immediately using ALL uploaded documents, conversation history, and known context.\n' +
        '- Use proper markdown headings (## PROFESSIONAL SUMMARY, ## EXPERIENCE, etc.).\n' +
        '- Pre-fill every field with real data from the veteran\'s documents.\n' +
        '- If a field is unknown, make a professional best-effort inference — do NOT leave blanks or brackets.\n' +
        '- This is a SINGLE response. No follow-ups. No continuations.\n';
      console.log('[FORCE] resume_generation override injected into payload');
    }

    // Inject active topics as hard system state (preserved for backward compatibility;
    // AIOS also handles topics via pageContext, but the server-side system_suffix
    // ensures the existing chat.js topic injection continues to work)
    if (window.activeUserTopics && window.activeUserTopics.length > 0) {
      var topicBlock = '\n\n## ACTIVE USER TOPICS (HARD SYSTEM STATE)\n' +
        'The user selected these topics via the session-start interface: ' +
        window.activeUserTopics.join(', ') + '\n' +
        'This is CONFIRMED user intent — not a guess, not optional text. These topics were selected by the user clicking buttons in the UI.\n' +
        'Rules:\n' +
        '- You MUST treat these as the user\'s confirmed areas of need\n' +
        '- Do NOT ask "what can I help you with" or "what do you need help with"\n' +
        '- Do NOT say you cannot see their selections or that you don\'t know what they picked\n' +
        '- Immediately proceed with guidance on these specific topics\n' +
        '- If you still need basic info (name, branch, state), weave it naturally into the topic discussion';
      payload.system_suffix = topicBlock;
      log('callChatEndpoint', 'injecting ACTIVE USER TOPICS: ' + window.activeUserTopics.join(', '));
    }

    log('callChatEndpoint', 'AIOS=' + (aiosActive ? 'active' : 'fallback') + ', systemLen=' + systemPrompt.length);

    // Phase R: Each retry attempt gets a fresh AbortController + 45s timeout so the
    // clock resets cleanly. AI_TIMEOUT and 5xx trigger retry; 4xx propagates immediately.
    // Timeout raised from 15s to 45s: Claude API with tool_choice:any + 30K system
    // prompt needs 15-30s. 15s was causing constant AbortError → all 3 retries fail.
    var _payloadJSON = JSON.stringify(payload);
    return withRetry(function() {
      var _ctrl = new AbortController();
      var _timer = setTimeout(function() { _ctrl.abort(); }, 45000);
      return fetch(CONFIG.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: _payloadJSON,
        signal: _ctrl.signal
      }).then(function(resp) {
        clearTimeout(_timer);
        if (!resp.ok) throw new Error('Chat endpoint error: ' + resp.status);
        return resp.json();
      }).then(function(data) {
        log('callChatEndpoint', 'response received, length=' + (data.response || '').length +
          (data.structured ? ' [+structured mode=' + data.structured.mode + ']' : ''));
        return { text: data.response || '', structured: data.structured || null };
      }).catch(function(err) {
        clearTimeout(_timer);
        if (err.name === 'AbortError') throw new Error('AI_TIMEOUT');
        throw err;
      });
    }, 'callChatEndpoint');

    }); // Phase R3.3: end _r3ResolvedP.then()
  }

  // ── Phase 4.1: Build ResponseContract from structured tool output ──────────
  function _buildContractFromStructured(structured, rawText) {
    var actions = null;
    if (structured.actions && structured.actions.length > 0) {
      actions = structured.actions.map(function(a, i) {
        return { step: a.step || (i + 1), text: a.text, isAction: a.is_action !== false };
      });
    }
    var missionSignals = null;
    if (structured.missions && structured.missions.length > 0) {
      var m = structured.missions[0];
      missionSignals = {
        suggestedType: m.type || null,
        stepUpdate: m.next_step ? { nextStep: m.next_step } : null,
        blockers: m.blockers || [],
        action: m.action || 'none'
      };
    }
    return {
      mode: structured.mode || 'conversation',
      raw: rawText,
      summary: structured.report_ready ? 'Personalized veteran benefits report generated.' : '',
      options: (structured.options && structured.options.length) ? structured.options : null,
      recommended_actions: actions,
      follow_up_question: structured.follow_up_question || null,
      resources: null,
      risk_flags: (structured.risk_flags && structured.risk_flags.length) ? structured.risk_flags : null,
      mission_signals: missionSignals,
      checklist_items: structured.checklist_items || null,
      report_ready: structured.report_ready || false,
      document_actions: structured.document_actions || null,
      dashboard_hint: structured.dashboard_hint || null,
      confidence: 0.95,
      missing_information: null,
      timestamp: Date.now(),
      _source: 'structured'
    };
  }

  // ══════════════════════════════════════════════════════
  //  AGENTIC: Process document_actions from structured output
  //  Auto-saves generated templates/reports to template_outputs
  //  so they appear on the veteran's Profile → Generated Documents.
  // ══════════════════════════════════════════════════════
  function _processDocumentActions(structured, rawText) {
    if (!structured.document_actions || !Array.isArray(structured.document_actions)) {
      console.log('[AIOS][DOC-ACTION] skipped — no document_actions array');
      return Promise.resolve(false);
    }
    if (!window.AAAI || !window.AAAI.auth || !window.AAAI.auth.isLoggedIn || !window.AAAI.auth.isLoggedIn()) {
      console.warn('[AIOS][DOC-ACTION] skipped — user not logged in. ' + structured.document_actions.length + ' actions lost.');
      // Inject a visible login bar so the user knows to sign in — do NOT silently drop
      if (chatMessages) {
        var _loginBar = document.createElement('div');
        _loginBar.className = 'message message--system';
        _loginBar.innerHTML =
          '<div class="dashboard-handoff-bar" style="' +
            'background: linear-gradient(135deg, #1a365d 0%, #2a4a7f 100%);' +
            'border: 1px solid #c6a135; border-radius: 8px; padding: 12px 16px;' +
            'display: flex; align-items: center; justify-content: space-between;' +
            'margin: 8px 0; gap: 12px;">' +
            '<span style="color: #fff; font-size: 0.95rem; font-weight: 500;">' +
              '\uD83D\uDD12 Sign in to save your documents to your dashboard.' +
            '</span>' +
            '<button onclick="(function(){ if(window.AAAI && AAAI.auth && typeof AAAI.auth.showAuthModal===\'function\') AAAI.auth.showAuthModal(); })()" style="' +
              'background: #c6a135; color: #1a365d; border: none;' +
              'padding: 8px 16px; border-radius: 6px; font-weight: 700;' +
              'font-size: 0.9rem; white-space: nowrap; cursor: pointer;">' +
              'Sign In to Save' +
            '</button>' +
          '</div>';
        chatMessages.appendChild(_loginBar);
        scrollToBottom();
      }
      return Promise.resolve(false);
    }
    if (typeof window.AAAI.auth.saveTemplateOutput !== 'function') {
      console.warn('[AIOS][DOC-ACTION] skipped — saveTemplateOutput not available');
      return Promise.resolve(false);
    }

    // ── CONTENT GATE: Do not save if rawText is too short to be a real document ──
    // Prevents saving follow-up questions, acknowledgments, or intake prompts
    // as "generated documents." The system prompt instructs the AI to write at
    // least 400 WORDS for documents — 400 CHARACTERS is a generous lower bound.
    if (rawText.length < 400) {
      console.log('[AIOS][DOC-ACTION] BLOCKED — rawText too short (' + rawText.length + ' chars). ' +
        'This is likely a follow-up question, not a completed document. ' +
        'document_actions: ' + JSON.stringify(structured.document_actions.map(function(da) { return da.template_type; })));
      return Promise.resolve(false);
    }

    console.log('[AIOS][DOC-ACTION] processing ' + structured.document_actions.length + ' actions, rawText=' + rawText.length + ' chars');

    // ── FIX: Extract document content from AI response ──
    // The AI may include a conversational preamble ("Here's your document:", etc.)
    // before the actual document. Strip the preamble so only the document content
    // is saved. Strategy: find the first markdown heading (# or ##) — everything
    // from that point on is the document. If no heading found, use the full text.
    var _docContent = rawText;
    var _headingIdx = rawText.search(/^#{1,3}\s+\S/m);
    if (_headingIdx > 0 && _headingIdx < 500) {
      // Only strip if the preamble is reasonably short (< 500 chars)
      _docContent = rawText.substring(_headingIdx);
      console.log('[AIOS][DOC-ACTION] stripped ' + _headingIdx + ' chars of preamble, document content=' + _docContent.length + ' chars');
    }

    var _savePromises = [];
    structured.document_actions.forEach(function(da) {
      if (!da || !da.template_type || !da.title) return;

      // Fix 8: Dedup — skip if same type+content was saved in last 60 seconds
      var _dedupKey = da.template_type + '|' + _docContent.length + '|' + _docContent.substring(0, 100);
      var _now = Date.now();
      if (_recentSaveFingerprints[_dedupKey] && (_now - _recentSaveFingerprints[_dedupKey]) < 60000) {
        console.log('[AIOS][DOC-ACTION] dedup — skipping duplicate save for ' + da.template_type + ' (' + da.title + ')');
        return;
      }
      _recentSaveFingerprints[_dedupKey] = _now;

      var output = {
        template_type: da.template_type,
        title: da.title,
        content: _docContent,
        metadata: {
          source: 'ai_generated',
          action: da.action || 'save_template',
          prefilled_fields: da.prefilled_fields || {},
          generated_at: new Date().toISOString()
        }
      };
      _savePromises.push(
        window.AAAI.auth.saveTemplateOutput(output).then(function(res) {
          if (res && !res.error) {
            console.log('[AIOS][DOC-ACTION] saved ' + da.template_type + ' → ' + da.title);
            return true;
          } else {
            console.warn('[AIOS][DOC-ACTION] save failed:', res && res.error);
            return false;
          }
        }).catch(function(e) {
          console.warn('[AIOS][DOC-ACTION] save error:', e && e.message);
          return false;
        })
      );
    });
    return Promise.all(_savePromises).then(function(results) {
      return results.some(function(r) { return r === true; });
    });
  }

  // ══════════════════════════════════════════════════════
  //  AGENTIC: Inject dashboard handoff button into chat
  //  Shows a clickable "Go to Dashboard" bar after significant
  //  AI actions (report, template, checklist creation).
  // ══════════════════════════════════════════════════════
  function _injectDashboardHandoff(hint) {
    if (!hint || !chatMessages) {
      console.log('[AIOS][DASHBOARD-HANDOFF] skipped — hint=' + hint + ' chatMessages=' + !!chatMessages);
      return;
    }
    console.log('[AIOS][DASHBOARD-HANDOFF] injecting: ' + hint);
    var urlMap = {
      'show_profile':   '/profile.html',
      'show_checklist':  '/profile.html#checklist',
      'show_reports':    '/profile.html#reports'
    };
    var labelMap = {
      'show_profile':   'View on your Profile',
      'show_checklist':  'View your Mission Checklist',
      'show_reports':    'View your Reports'
    };
    var url   = urlMap[hint]   || '/profile.html';
    var label = labelMap[hint] || 'Go to your Dashboard';

    var bar = document.createElement('div');
    bar.className = 'message message--system';
    bar.innerHTML =
      '<div class="dashboard-handoff-bar" style="' +
        'background: linear-gradient(135deg, #1a365d 0%, #2a4a7f 100%);' +
        'border: 1px solid #c6a135; border-radius: 8px; padding: 12px 16px;' +
        'display: flex; align-items: center; justify-content: space-between;' +
        'margin: 8px 0; gap: 12px;">' +
        '<span style="color: #fff; font-size: 0.95rem; font-weight: 500;">' +
          '\uD83C\uDFAF Your items have been saved to your dashboard.' +
        '</span>' +
        '<a href="' + url + '" style="' +
          'background: #c6a135; color: #1a365d; text-decoration: none;' +
          'padding: 8px 16px; border-radius: 6px; font-weight: 700;' +
          'font-size: 0.9rem; white-space: nowrap;' +
          'transition: background 0.2s;">' +
          label +
        '</a>' +
      '</div>';
    chatMessages.appendChild(bar);
    scrollToBottom();
  }

  // Expose _injectDashboardHandoff for cross-module use (template-engine.js)
  if (!window.AAAI) window.AAAI = {};
  window.AAAI.injectDashboardHandoff = _injectDashboardHandoff;

  // ── Phase 4.3: Feature flags / capability tier ──────────────────────────
  (function() {
    if (!window.AIOS) window.AIOS = {};
    if (window.AIOS.Features) return; // already registered

    var _FLAGS = {
      ADVANCED_REPORTS:         'advanced_reports',
      DOCUMENT_EXPORT_ENHANCED: 'document_export_enhanced'
    };

    function getTier() {
      // Phase 4.3: all users are free. Premium gating activates in a future phase.
      // When auth is available, read tier from session:
      //   window.AAAI.DataAccess.auth.getSession().tier
      try {
        if (window.AAAI && window.AAAI.DataAccess &&
            window.AAAI.DataAccess.auth &&
            typeof window.AAAI.DataAccess.auth.getSession === 'function') {
          var sess = window.AAAI.DataAccess.auth.getSession();
          if (sess && sess.tier) return sess.tier;
        }
      } catch (e) {}
      return 'free';
    }

    function hasFeature(flag) {
      // Phase 4.3: gate NOT activated — always returns true.
      // To activate gating in a future phase, replace with:
      //   var tier = getTier();
      //   var TIER_MAP = { free: [], premium_ready: [_FLAGS.ADVANCED_REPORTS, _FLAGS.DOCUMENT_EXPORT_ENHANCED] };
      //   return (TIER_MAP[tier] || []).indexOf(flag) !== -1;
      return true;
    }

    window.AIOS.Features = {
      ADVANCED_REPORTS:         _FLAGS.ADVANCED_REPORTS,
      DOCUMENT_EXPORT_ENHANCED: _FLAGS.DOCUMENT_EXPORT_ENHANCED,
      getTier:    getTier,
      hasFeature: hasFeature
    };

    console.log('[AIOS][Features] P4.3 capability flags registered — tier:', getTier());
  })();

  // ══════════════════════════════════════════════════════
  //  UI HELPERS
  // ══════════════════════════════════════════════════════
  function addMessage(text, role) {
    var div = document.createElement('div');
    div.className = 'message message--' + role;

    if (role === 'ai') {
      _dismissOnboardCard(); // Phase 21
      div.innerHTML = formatMessage(text);
      // Phase 3.5: inject Download Word Doc button for legal template responses
      injectLegalDocButton(div, text);
    } else {
      div.textContent = text;
    }

    if (chatMessages) chatMessages.appendChild(div);

    scrollToBottom();
  }

  // ══════════════════════════════════════════════════════
  //  DOC READINESS GATE (Phase 3.7)
  //  Gates the Word Doc button behind info-collection checks.
  //  Readiness shape: { documentType, status, collected, missing }
  //  Statuses: NOT_READY | ALMOST_READY | READY
  // ══════════════════════════════════════════════════════
  var DocReadinessGate = (function () {

    var REQUIRED_FIELDS = {
      'living-will':                    ['fullName', 'state', 'healthcareAgent'],
      'last-will-and-testament':        ['fullName', 'state', 'executor'],
      'general-power-of-attorney':      ['fullName', 'state', 'agentName'],
      'durable-power-of-attorney':      ['fullName', 'state', 'agentName'],
      'medical-power-of-attorney':      ['fullName', 'state', 'agentName'],
      'hipaa-authorization-form':       ['fullName', 'state'],
      'nexus-letter':                   ['fullName', 'condition', 'serviceConnection'],
      'va-appeal-letter':               ['fullName', 'condition'],
      'va-claim-personal-statement':    ['fullName', 'condition'],
      'records-request-letter':         ['fullName'],
      'benefits-eligibility-summary':   ['fullName'],
      'debt-hardship-letter':           ['fullName', 'creditorName'],
      'credit-dispute-letter':          ['fullName'],
      'budget-financial-recovery-plan': ['fullName'],
      'va-loan-readiness-checklist':    ['fullName'],
      'rental-application-packet':      ['fullName'],
      'federal-resume-usajobs':         ['fullName', 'branch', 'yearsService'],
      'resume-builder':                 ['fullName', 'branch'],
      'military-skills-translator':     ['branch', 'mos'],
      'linkedin-profile-builder':       ['fullName', 'branch'],
      'salary-negotiation-script':      ['targetRole', 'branch'],
      'interview-prep-star':            ['targetRole', 'branch']
    };

    var FIELD_LABELS = {
      fullName:          'Full legal name',
      state:             'State of residence',
      agentName:         'Agent / attorney-in-fact name',
      healthcareAgent:   'Healthcare agent name',
      executor:          'Executor name',
      condition:         'Disability / condition',
      serviceConnection: 'Service connection details',
      branch:            'Military branch',
      mos:               'MOS / job specialty',
      yearsService:      'Years of service',
      targetRole:        'Target job or role',
      creditorName:      'Creditor or lender name'
    };

    var DOC_LABELS = {
      'living-will':                    'Living Will',
      'last-will-and-testament':        'Last Will & Testament',
      'general-power-of-attorney':      'General Power of Attorney',
      'durable-power-of-attorney':      'Durable Power of Attorney',
      'medical-power-of-attorney':      'Medical Power of Attorney',
      'hipaa-authorization-form':       'HIPAA Authorization',
      'nexus-letter':                   'Nexus Letter',
      'va-appeal-letter':               'VA Appeal Letter',
      'va-claim-personal-statement':    'VA Claim Personal Statement',
      'records-request-letter':         'Records Request Letter',
      'benefits-eligibility-summary':   'Benefits Eligibility Summary',
      'debt-hardship-letter':           'Debt Hardship Letter',
      'credit-dispute-letter':          'Credit Dispute Letter',
      'budget-financial-recovery-plan': 'Budget & Financial Recovery Plan',
      'va-loan-readiness-checklist':    'VA Loan Readiness Checklist',
      'rental-application-packet':      'Rental Application Packet',
      'federal-resume-usajobs':         'Federal Resume (USAJOBS)',
      'resume-builder':                 'Military Resume',
      'military-skills-translator':     'Military Skills Translator',
      'linkedin-profile-builder':       'LinkedIn Profile Builder',
      'salary-negotiation-script':      'Salary Negotiation Script',
      'interview-prep-star':            'Interview Prep (STAR Method)'
    };

    // Field detectors — scan combined conversation text for evidence of each field
    var FIELD_DETECTORS = {
      fullName: function (t) {
        return /(?:my name is|name\s*:|i am|i'm)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/i.test(t) ||
               /\b[A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20})?\b/.test(t);
      },
      state: function (t) {
        return /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/i.test(t);
      },
      agentName: function (t) {
        // keyword → name  (original)
        return /(?:agent|attorney.in.fact|power of attorney for|i authorize|i name|i appoint)\s+(?:is\s+|named?\s+)?[A-Z][a-z]+/i.test(t) ||
        // name → keyword  (natural speech: "My agent is John Smith" / "John Smith as my agent")
               /\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2}\s+(?:is|will be|as)\s+(?:my\s+)?(?:agent|attorney[- ]in[- ]fact)\b/i.test(t) ||
               /(?:my\s+)?(?:agent|attorney[- ]in[- ]fact)\s+(?:is|will be)\s+\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2}\b/i.test(t);
      },
      healthcareAgent: function (t) {
        // keyword → name  (original)
        return /(?:health\s*care\s*(?:agent|proxy|representative)|medical\s*agent|healthcare\s*agent)\s*(?:is\s+|named?\s+|:\s*)?[A-Z][a-z]+/i.test(t) ||
               /(?:my agent|my proxy)\s+for\s+(?:health|medical)/i.test(t) ||
        // name → keyword  (natural speech: "John Smith is my healthcare agent")
               /\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2}\s+(?:is|will be|as)\s+(?:my\s+)?(?:health\s*care|medical|healthcare)\s*(?:agent|proxy|representative)\b/i.test(t) ||
               /(?:my\s+)?(?:health\s*care|medical|healthcare)\s*(?:agent|proxy|representative)\s+(?:is|will be)\s+\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2}\b/i.test(t);
      },
      executor: function (t) {
        // keyword → name  (original)
        return /(?:executor|personal representative)\s+(?:is\s+|named?\s+|:\s*)?[A-Z][a-z]+/i.test(t) ||
               /i name\s+[A-Z][a-z]+\s+(?:as|to be)\s+(?:my\s+)?executor/i.test(t) ||
        // name → keyword  (natural speech: "John Smith is my executor" / "John Smith as executor")
               /\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2}\s+(?:is|will be|as)\s+(?:my\s+)?(?:executor|personal representative)\b/i.test(t) ||
               /(?:my\s+)?(?:executor|personal representative)\s+(?:is|will be)\s+\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2}\b/i.test(t);
      },
      condition: function (t) {
        return /(?:condition|disability|diagnosis|rating for|claiming for|service.connected for|tinnitus|ptsd|tbi|traumatic brain|sleep apnea|hearing loss|back pain|knee|hip|shoulder|anxiety|depression)/i.test(t);
      },
      serviceConnection: function (t) {
        return /(?:in.service|during(?:\s+my)?\s+service|service.connected|nexus|caused by|aggravated by|incurred during|military service caused)/i.test(t);
      },
      branch: function (t) {
        return /\b(army|navy|air force|marine corps|marines|coast guard|space force|national guard|reserve)\b/i.test(t);
      },
      mos: function (t) {
        return /\b(?:\d{2}[A-Z]|[A-Z]\d[A-Z]{1,2})\b/.test(t) ||
               /\b(?:MOS|AFSC|NEC|military occupation|job specialty|job title)\b/i.test(t);
      },
      yearsService: function (t) {
        return /(?:\d+\s+years?(?:\s+of\s+service)?|served\s+(?:for\s+)?\d+|years?\s+in\s+(?:the\s+)?(?:military|service|army|navy|air force|marines))/i.test(t);
      },
      targetRole: function (t) {
        return /(?:target(?:ing)?\s+(?:role|position|job)|applying\s+(?:for|to)|want(?:ing)?\s+to\s+(?:be|work|get)|career\s+goal|looking\s+for\s+(?:a\s+)?(?:job|position|role))/i.test(t);
      },
      creditorName: function (t) {
        return /(?:creditor|owed?\s+to|debt\s+(?:to|with)|lender|bank|credit\s+card|loan\s+(?:from|with)|account\s+with)/i.test(t);
      }
    };

    // Returns true if the AI response is a completed document draft
    // (vs. an exploratory discussion of the document topic)
    function isDocumentDraft(text) {
      if (!text || text.length < 400) return false;
      var lineBreaks = (text.match(/\n/g) || []).length;
      if (lineBreaks < 3) return false;
      var structureTests = [
        /^#{1,4}\s+\S/m,
        /\*\*[A-Z][^*\n]{2,}\*\*/,
        /^[A-Z\s]{6,}$/m,
        /\[[^\]]{2,40}\]/,
        /\b(?:WHEREAS|HEREBY|WITNESSETH|THERETO|HERETOFORE)\b/i,
        /Section\s+\d+/i,
        /Article\s+[IVX\d]+/i,
        /THIS\s+\w+\s+(?:AGREEMENT|DOCUMENT|DECLARATION)\b/i
      ];
      var matches = structureTests.filter(function (re) { return re.test(text); }).length;
      return matches >= 1;
    }

    function assess(formType, responseText, history) {
      if (!formType) return null;

      // Scan ONLY user-submitted messages — prevents AI option text false-positives (Phase 3.8)
      var userTextOnly = (history || []).filter(function (m) {
        return m && m.role === 'user';
      }).map(function (m) {
        return m.content || '';
      }).join(' ');

      var requiredFields = REQUIRED_FIELDS[formType] || ['fullName'];
      var collected = [];
      var missing = [];

      requiredFields.forEach(function (field) {
        var detector = FIELD_DETECTORS[field];
        if (detector && detector(userTextOnly)) {
          collected.push(field);
        } else {
          missing.push(field);
        }
      });

      // READY only when ALL required fields are collected (Phase 3.8: isDraft path removed)
      var status;
      if (missing.length === 0) {
        status = 'READY';
      } else if (collected.length >= 1 && missing.length <= 1) {
        status = 'ALMOST_READY';
      } else {
        status = 'NOT_READY';
      }

      return { documentType: formType, status: status, collected: collected, missing: missing };
    }

    function injectStatusCard(messageDiv, readiness) {
      // Hard idempotency guard — scoped to this container only, not global document
      if (messageDiv.querySelector('.legal-doc-status-card')) return;
      var isAlmost = readiness.status === 'ALMOST_READY';
      var docTitle = DOC_LABELS[readiness.documentType] || readiness.documentType;
      var icon = isAlmost ? '🔶' : '📋';
      var statusLabel = isAlmost ? 'Almost Ready' : 'Details Needed';

      var html = '<div style="font-weight:600;margin-bottom:6px;">' + icon + ' ' + docTitle + ' \u2014 ' + statusLabel + '</div>';

      readiness.collected.forEach(function (f) {
        html += '<div style="color:#1a7a1a;font-size:12px;padding:2px 0;">\u2713 ' + (FIELD_LABELS[f] || f) + '</div>';
      });
      readiness.missing.forEach(function (f) {
        html += '<div style="color:#b03030;font-size:12px;padding:2px 0;">\u2717 ' + (FIELD_LABELS[f] || f) + ' needed</div>';
      });
      html += '<div style="margin-top:7px;font-size:12px;color:#555;font-style:italic;">I\'ll generate your Word Doc once we have all the details above.</div>';

      var card = document.createElement('div');
      card.className = 'legal-doc-status-card';
      card.style.cssText = 'margin-top:12px;padding:11px 14px;border-radius:8px;font-size:13px;line-height:1.6;' +
        'background:' + (isAlmost ? '#fff8e6' : '#f0f4ff') + ';' +
        'border:1px solid ' + (isAlmost ? '#f5c518' : '#c7d2f5') + ';';
      card.innerHTML = html;
      messageDiv.appendChild(card);
    }

    return { assess: assess, injectStatusCard: injectStatusCard };

  }());

  // Phase 3.5 — detect legal template responses and inject Download Word Doc button
  function injectLegalDocButton(messageDiv, rawText) {
    // Gate: only allow document UI after a real report has been generated
    if (!reportGenerated) return;
    console.log('[LegalBtn] injectLegalDocButton called, text length:', rawText ? rawText.length : 0);
    console.log('[LegalBtn] AAAI defined:', typeof AAAI !== 'undefined', '| legalIntegration:', !!(typeof AAAI !== 'undefined' && AAAI.legalIntegration));
    // Remove any prior status cards so only the newest one remains visible
    if (chatMessages) {
      var oldCards = chatMessages.querySelectorAll('.legal-doc-status-card');
      oldCards.forEach(function(card) { card.remove(); });
    }
    // Guard: never inject more than one card or button per message div (covers all duplicate-call paths)
    if (messageDiv.querySelector('.legal-doc-status-card') || messageDiv.querySelector('.legal-doc-btn')) return;
    // Only legalIntegration is required for detection; legal (modal) is checked at click time
    if (typeof AAAI === 'undefined' || !AAAI.legalIntegration) return;
    var detectedType = AAAI.legalIntegration.detectLegalFormType(rawText);
    console.log('[LegalBtn] detectLegalFormType result:', detectedType);
    // ── ACTIVE DOCUMENT LOCK (Phase 3.8) ─────────────────────
    // First detection in a session sets the lock. All subsequent detections are ignored.
    if (detectedType && activeDocumentType === null) {
      activeDocumentType = detectedType;
      console.log('[LegalBtn] activeDocumentType locked to:', activeDocumentType);
    }
    var formType = activeDocumentType;
    if (!formType) return;
    // ─────────────────────────────────────────────────────────

    // ── READINESS GATE (Phase 3.7) ───────────────────────────
    var readiness = DocReadinessGate.assess(formType, rawText, conversationHistory);
    console.log('[LegalBtn] readiness:', readiness && readiness.status,
      '| collected:', readiness && readiness.collected,
      '| missing:', readiness && readiness.missing);
    if (readiness && readiness.status !== 'READY') {
      DocReadinessGate.injectStatusCard(messageDiv, readiness);
      return;
    }
    // ────────────────────────────────────────────────────────

    // ── CONTENT GATE: Only inject button when rawText IS the document ──
    // The readiness gate checks that all INPUT data was collected.
    // This gate checks that the current message IS the OUTPUT document,
    // not a transitional message like "I've got your info, let me build this."
    //
    // STRICT RULE: The message must have markdown section headings (## lines).
    // A completed resume/template has 3+ headings (## Contact, ## Summary, etc.).
    // A transitional message ("I found your info...") has 0 headings.
    // Single keywords like "education" are NOT enough — they appear in
    // transitional messages when the AI acknowledges document content.
    var _headingCount = (rawText.match(/^#{1,3}\s+\S/gm) || []).length;
    var _isDocContent = rawText.length >= 500 && _headingCount >= 3;
    console.log('[LegalBtn] CONTENT GATE: len=' + rawText.length +
      ' headings=' + _headingCount +
      ' pass=' + _isDocContent +
      ' first100="' + rawText.substring(0, 100).replace(/\n/g, '\\n') + '"');
    if (!_isDocContent) {
      console.log('[LegalBtn] CONTENT GATE BLOCKED — rawText has ' + _headingCount + ' headings (need 3+). Not a completed document.');
      return;
    }
    // ──────────────────────────────────────────────────────────────────

    var btn = document.createElement('button');
    btn.className = 'legal-doc-btn';
    btn.textContent = '⬇ Download Word Doc';
    btn.setAttribute('aria-label', 'Download legal document as Word file');
    btn.style.cssText = 'display:inline-block;margin-top:12px;padding:9px 18px;' +
      'background:#1a56db;color:#fff;border:none;border-radius:6px;' +
      'font-size:13px;font-weight:600;cursor:pointer;letter-spacing:0.01em;';

    btn.addEventListener('click', function () {
      AAAI.legal.requireAcknowledgment(formType, function (confirmedFormType) {
        if (typeof AAAI !== 'undefined' && AAAI.legalDocx && AAAI.legalDocx.generate) {
          // ── Phase R-3: RENTAL STRUCTURED-DATA PATH ──────────────
          // Rental application packet is now built from structured data,
          // not AI markdown. This bypasses _parseMarkdownToDocx and runs
          // the validation gate inside buildRentalApplicationPacket so an
          // incomplete profile yields a failure doc instead of leaking
          // bracket placeholders.
          if (confirmedFormType === 'rental-application-packet' &&
              AAAI.legalDocx.generateFromData &&
              typeof _buildRentalApplicationData === 'function') {
            try {
              var _rentalData = _buildRentalApplicationData();
              console.log('[Rental] structured data:', _rentalData);
              AAAI.legalDocx.generateFromData('rental-application-packet', _rentalData)
                .then(function () {
                  activeDocumentType = null;
                  console.log('[DOC RESET] activeDocumentType cleared after rental generation');
                })
                .catch(function (err) {
                  var msg = err && err.message ? err.message : String(err || 'Rental DOCX generation failed');
                  console.error('[LegalBtn] rental generateFromData failed:', err);
                  if (typeof showToast === 'function') { showToast(msg, 'error'); }
                  else { alert('Document generation error: ' + msg); }
                });
              return;
            } catch (_rentalErr) {
              console.error('[LegalBtn] rental data build failed, falling back to generate():', _rentalErr);
              // Fall through to markdown path
            }
          }
          // ────────────────────────────────────────────────────────

          // ── Phase RESUME-HARDEN: RESUME STRUCTURED-DATA PATH ────
          // Resume is always built from structured profile data via the
          // hardened generateFromData path. This intercept prevents any
          // rawText / markdown path from bypassing _buildResumeData,
          // attemptResumeAutoFill, validateResumeData, and
          // buildResumeFromData. Unlike rental, there is NO fallthrough
          // to the markdown path on error — resume-builder must never
          // reach generateLegalDocx().
          if (confirmedFormType === 'resume-builder' &&
              AAAI.legalDocx.generateFromData &&
              typeof _buildResumeData === 'function') {
            try {
              var _resumeData = _buildResumeData();
              console.log('[LegalBtn] resume structured data:', JSON.stringify(_resumeData).substring(0, 200));
              AAAI.legalDocx.generateFromData('resume-builder', _resumeData)
                .then(function () {
                  activeDocumentType = null;
                  console.log('[DOC RESET] activeDocumentType cleared after resume generation');
                })
                .catch(function (err) {
                  var msg = err && err.message ? err.message : String(err || 'Resume DOCX generation failed');
                  console.error('[LegalBtn] resume generateFromData failed:', err);
                  if (typeof showToast === 'function') { showToast(msg, 'error'); }
                  else { alert('Document generation error: ' + msg); }
                });
            } catch (_resumeErr) {
              console.error('[LegalBtn] resume data build failed:', _resumeErr);
              var _resumeErrMsg = _resumeErr && _resumeErr.message
                ? _resumeErr.message : 'Resume generation failed. Please try again.';
              if (typeof showToast === 'function') { showToast(_resumeErrMsg, 'error'); }
              else { alert('Resume generation error: ' + _resumeErrMsg); }
            }
            return; // hard stop — resume-builder must never reach the markdown path
          }
          // ────────────────────────────────────────────────────────

          // ── DOCX CONTENT RESOLUTION ────────────────────────────
          // rawText is captured at button-injection time, which may be a
          // transitional message ("I've got your info...") instead of the
          // actual completed document. At click time, scan conversationHistory
          // backwards for the longest recent assistant message — that is the
          // real document content the veteran expects to download.
          var actualContent = rawText; // default: use what was captured
          try {
            var _best = null;
            var _bestLen = 0;
            // Scan last 6 assistant messages for the actual document
            for (var _ci = conversationHistory.length - 1; _ci >= 0 && _ci >= conversationHistory.length - 12; _ci--) {
              var _msg = conversationHistory[_ci];
              if (_msg.role !== 'assistant' || !_msg.content) continue;
              var _len = _msg.content.length;
              // Must be substantial (>400 chars) and longer than what we already have
              if (_len > 400 && _len > _bestLen) {
                _best = _msg.content;
                _bestLen = _len;
              }
            }
            if (_best && _bestLen > rawText.length) {
              actualContent = _best;
              console.log('[DOCX INPUT] Upgraded from rawText (' + rawText.length + ' chars) to conversationHistory match (' + _bestLen + ' chars)');
            } else {
              console.log('[DOCX INPUT] Using rawText (' + rawText.length + ' chars) — no better match in history');
            }
          } catch (_scanErr) {
            console.warn('[DOCX INPUT] History scan failed, using rawText:', _scanErr);
          }
          console.log('[DOCX INPUT] content preview:', actualContent.substring(0, 150).replace(/\n/g, '\\n'));
          // ───────────────────────────────────────────────────────
          AAAI.legalDocx.generate(confirmedFormType, actualContent).then(function () {
            activeDocumentType = null;
            console.log('[DOC RESET] activeDocumentType cleared after generation');
          }).catch(function (err) {
            var msg = err && err.message ? err.message : String(err || 'DOCX generation failed');
            console.error('[LegalBtn] AAAI.legalDocx.generate failed:', err);
            if (typeof showToast === 'function') { showToast(msg, 'error'); }
            else { alert('Document generation error: ' + msg); }
          });
        } else {
          console.error('[LegalBtn] AAAI.legalDocx is unavailable at click time.');
          if (typeof showToast === 'function') { showToast('DOCX generator is unavailable. Please refresh the page and try again.', 'error'); }
          else { alert('DOCX generator is unavailable. Please refresh the page and try again.'); }
        }
      });
    });

    messageDiv.appendChild(btn);
    console.log('[LegalBtn] button appended for formType:', formType);
  }

  function formatMessage(text) {
    // Extract [OPTIONS: ...] blocks before formatting
    var optionsHtml = '';
    var cleanText = text.replace(/\[OPTIONS:\s*(.*?)\]/g, function(match, inner) {
      var opts = inner.split('|').map(function(o) { return o.trim(); }).filter(Boolean);
      if (opts.length > 0) {
        optionsHtml += '<div class="chat-options">';
        opts.forEach(function(opt) {
          optionsHtml += '<button class="chat-option-btn" data-option="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
        });
        optionsHtml += '</div>';
      }
      return '';
    });

    var html = cleanText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.*?)\]\((https?:\/\/.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>')
      .replace(/<br>\s*$/, '');

    return html + optionsHtml;
  }

  function showTyping() {
    var div = document.createElement('div');
    div.className = 'message message--typing';
    div.id = 'typingIndicator';
    div.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    if (chatMessages) chatMessages.appendChild(div);
    scrollToBottom();
  }

  function removeTyping() {
    var el = $('typingIndicator');
    if (el) el.remove();
  }

  // ── AI Working Indicator ──────────────────────────────────────────
  // Persistent banner shown during long-running document generation.
  // Unlike the typing dots (which vanish on first response chunk),
  // this stays visible until clearAIWorkingState() is called.
  var _aiWorkingLabels = {
    resume:  'Building your resume — this may take a moment\u2026',
    report:  'Generating your benefits report\u2026',
    template: 'Creating your document\u2026',
    default: 'AI is working\u2026'
  };

  function showAIWorkingState(task) {
    // Prevent duplicates
    if ($('aiWorkingBanner')) return;
    var label = _aiWorkingLabels[task] || _aiWorkingLabels['default'];
    var banner = document.createElement('div');
    banner.id = 'aiWorkingBanner';
    banner.className = 'ai-working-banner';
    banner.innerHTML = '<div class="ai-working-inner">' +
      '<div class="ai-working-spinner"></div>' +
      '<span class="ai-working-text">' + label + '</span>' +
      '</div>';
    if (chatMessages) chatMessages.appendChild(banner);
    scrollToBottom();
    console.log('[FLOW] showAIWorkingState: ' + task);
  }

  function clearAIWorkingState() {
    var banner = $('aiWorkingBanner');
    if (banner) {
      banner.remove();
      console.log('[FLOW] clearAIWorkingState');
    }
  }

  function scrollToBottom() {
    setTimeout(function() {
      if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 0);
  }

  function showToast(msg) {
    var toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('toast-visible'); }, 16);
    setTimeout(function() {
      toast.classList.remove('toast-visible');
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  }

  // ══════════════════════════════════════════════════════
  //  FILE UPLOAD
  // ══════════════════════════════════════════════════════
  function handleFileSelect(event) {
    var files = Array.from(event.target.files);
    if (!files.length) return;

    var docTypeMap = {
      'dd214': 'DD-214', 'dd-214': 'DD-214',
      'disability': 'VA Disability Rating Letter', 'rating': 'VA Disability Rating Letter',
      'benefit summary': 'VA Benefits Summary Letter', 'benefit_summary': 'VA Benefits Summary Letter',
      'transcript': 'Military/Civilian Transcript', 'jst': 'Joint Services Transcript',
      'ccaf': 'CCAF Transcript', 'resume': 'Resume', 'cv': 'Resume',
      'certificate': 'Certificate', 'cert': 'Certificate', 'diploma': 'Diploma',
      'license': 'License/Certification'
    };

    files.forEach(function(file) {
      var nameLower = file.name.toLowerCase();
      var docType = 'Document';
      var keys = Object.keys(docTypeMap);
      for (var k = 0; k < keys.length; k++) {
        if (nameLower.indexOf(keys[k]) > -1) {
          docType = docTypeMap[keys[k]];
          break;
        }
      }
      pendingFiles.push({ file: file, docType: docType, name: file.name });
      uploadedDocTypes.push(docType);
    });

    var fileNames = files.map(function(f) { return f.name; }).join(', ');
    var docTypes = pendingFiles.map(function(f) { return f.docType; }).join(', ');

    addMessage('Uploaded: ' + fileNames, 'user');

    // Phase 42 + Storage: upload raw file to Supabase Storage, then persist metadata
    if (typeof AAAI !== 'undefined' && AAAI.auth && AAAI.auth.isLoggedIn && AAAI.auth.isLoggedIn() &&
        AAAI.auth.saveUploadedDocument) {
      pendingFiles.forEach(function(pf) {
        var extractedProfile = (window.AIOS && window.AIOS.Memory) ? window.AIOS.Memory.getProfile() : {};
        // Upload the original binary to Supabase Storage
        // Stash promise on pf so _runDocAnalysis can await it before saving to documents table
        var storagePromise = (AAAI.auth.uploadFileToStorage)
          ? AAAI.auth.uploadFileToStorage(pf.file)
          : Promise.resolve({ path: null, error: 'uploadFileToStorage not available' });
        pf._storagePromise = storagePromise.then(function(storageResult) {
          var storagePath = (storageResult && storageResult.path) ? storageResult.path : null;
          if (storagePath) {
            pf.storagePath = storagePath;
            log('Upload', 'stored ' + pf.name + ' → ' + storagePath);
          } else {
            log('Upload', 'storage skip for ' + pf.name + ': ' + (storageResult && storageResult.error));
          }
          return storagePath;
        }).catch(function(e) {
          log('Upload', 'storage error for ' + pf.name + ': ' + (e && e.message));
          return null;
        });
        // Save to template_outputs (dashboard) after storage upload completes
        pf._storagePromise.then(function(storagePath) {
          return AAAI.auth.saveUploadedDocument(pf.name, pf.docType, extractedProfile, null, storagePath);
        }).then(function(res) {
          if (res && !res.error) log('Upload', 'saved ' + pf.name + ' to dashboard');
        }).catch(function(e) { log('Upload', 'save error: ' + (e && e.message)); });
      });
    }

    // Phase 42: voice immediate acknowledgment — let the user know we received the file
    if (inputMode === 'voice' && typeof RealtimeVoice !== 'undefined' && RealtimeVoice.getState() !== 'idle' && RealtimeVoice.sendText) {
      RealtimeVoice.sendText('[SYSTEM: The veteran just uploaded ' + files.length + ' document(s). Say ONLY: "Got it — I\'m reviewing your document now." Do NOT say anything else until you receive the full document content.]');
    }

    var notice = document.createElement('div');
    notice.className = 'message message--upload-notice';
    notice.innerHTML = '<strong>Processing ' + files.length + ' document' + (files.length > 1 ? 's' : '') + '...</strong><br>Extracting your service information to personalize your plan.';
    if (chatMessages) chatMessages.appendChild(notice);
    scrollToBottom();

    processUploads(pendingFiles).then(function(extractedText) {
      notice.remove();
      // Phase 42: build missing-fields hint from memory profile after extraction
      var _missingHint = '';
      if (window.AIOS && window.AIOS.Memory) {
        var _prof42 = window.AIOS.Memory.getProfile();
        var _missing42 = [];
        if (!_prof42.branch)                                             _missing42.push('branch of service');
        if (_prof42.vaRating === null || _prof42.vaRating === undefined) _missing42.push('VA disability rating');
        if (!_prof42.dischargeStatus)                                    _missing42.push('character of discharge');
        if (!_prof42.state)                                              _missing42.push('state of residence');
        if (!_prof42.rank)                                               _missing42.push('rank/pay grade');
        if (!_prof42.mos)                                                _missing42.push('MOS/AFSC');
        if (!_prof42.separationDate)                                     _missing42.push('separation date');
        if (_missing42.length > 0) {
          _missingHint = ' Fields still needed: ' + _missing42.join(', ') + '.';
        }
      }
      var uploadContext = '[SYSTEM: Veteran uploaded ' + files.length + ' document(s): ' + docTypes + '.' + _missingHint + ' ' +
        'Extracted content below. Use this to skip questions you can answer from the documents. ' +
        'Confirm what you found with the veteran before proceeding.]\n\n' +
        'Document content:\n' + extractedText;

      // Route to the right engine
      if (inputMode === 'voice' && typeof RealtimeVoice !== 'undefined' && RealtimeVoice.getState() !== 'idle') {
        // Send via Realtime data channel
        RealtimeVoice.sendText(uploadContext);
      } else {
        // Send via text API
        sendToAI(uploadContext);
      }
      pendingFiles = [];
    });

    event.target.value = '';
  }

  /* ── Phase 3.4: shared post-extraction pipeline ────────── */
  function _runDocAnalysis(text, pf) {
    // Merge extracted fields into AIOS Memory
    if (window.AIOS &&
        window.AIOS.Skills && window.AIOS.Skills['document-analyzer'] &&
        window.AIOS.Memory) {
      var _da     = window.AIOS.Skills['document-analyzer'];
      var _typeId = _da.detectType(text);
      var _fields = _da.extractDocumentFields(_typeId, text);
      window.AIOS.Memory.mergeDocumentMemory(_fields);

      // Fire-and-forget: persist to Phase 2 documents table
      // Await the storage upload promise (if running) so storage_path is populated
      if (window.AAAI && window.AAAI.DataAccess && window.AAAI.DataAccess.documents) {
        var _missionId = (window.AIOS.Mission && window.AIOS.Mission.current)
          ? window.AIOS.Mission.current._dbId || null : null;
        var _caseId = (window.AIOS.Mission && window.AIOS.Mission.current &&
                       window.AIOS.Mission.current._caseId)
          ? window.AIOS.Mission.current._caseId
          : (_activeCaseId || null);
        var _waitForStorage = (pf._storagePromise) ? pf._storagePromise : Promise.resolve(null);
        _waitForStorage.then(function() {
          var _docPayload = {
            file_name:       pf.file.name,
            document_type:   _typeId,
            mime_type:       pf.file.type,
            file_size:       pf.file.size,
            extracted_text:  text,
            analysis_result: _fields || {},
            mission_id:      _missionId,
            case_id:         _caseId,
            storage_path:    pf.storagePath || null,
            status:          'uploaded'
          };
          return withRetry(function() { return window.AAAI.DataAccess.documents.save(_docPayload); }, 'documents.save');
        })
          .then(function(res) {
            if (res && res.error) {
              throw Object.assign(new Error('DB record failed'), { _dbErr: res.error });
            }
            // Phase 3.5: advance lifecycle to 'processed' after successful save
            if (res && res.data && res.data.id &&
                window.AIOS && window.AIOS.DocumentLifecycle) {
              window.AIOS.DocumentLifecycle.transition(res.data.id, 'processed');
            }
          }).catch(function(err) {
            console.error('[AAAI ERROR][documents.save] failed — file:', pf.file.name, '|', err._dbErr || err);
            if (_activeCaseId && chatMessages) {
              var _de = document.createElement('div');
              _de.className = 'message message--system';
              _de.innerHTML = '<div class="save-success-bar" style="background:#fef2f2;border-color:#fca5a5;"><span style="color:#dc2626;">⚠</span> <span style="color:#991b1b;">Document analyzed but could not be saved to your account. Your conversation is unaffected.</span></div>';
              chatMessages.appendChild(_de);
            }
          });
      }
    }
  }

  function processUploads(files) {
    var results = [];
    var chain = Promise.resolve();

    files.forEach(function(pf) {
      chain = chain.then(function() {
        if (pf.file.type === 'text/plain') {
          return pf.file.text().then(function(text) {
            _runDocAnalysis(text, pf);
            results.push('--- ' + pf.docType + ' (' + pf.file.name + ') ---\n' + text);
          });
        } else if (pf.file.type === 'application/pdf') {
          if (window.AIOS && window.AIOS.DocumentIntelligence) {
            return window.AIOS.DocumentIntelligence.extractText(pf.file).then(function(text) {
              _runDocAnalysis(text, pf);
              results.push('--- ' + pf.docType + ' (' + pf.file.name + ') ---\n' + text);
            });
          } else {
            results.push('--- ' + pf.docType + ' (' + pf.file.name + ') ---\n[PDF uploaded. Please ask the veteran to confirm the key details from their ' + pf.docType + '.]');
            return Promise.resolve();
          }
        } else if (pf.file.type && pf.file.type.startsWith('image/')) {
          if (window.AIOS && window.AIOS.DocumentIntelligence) {
            return window.AIOS.DocumentIntelligence.extractText(pf.file).then(function(text) {
              _runDocAnalysis(text, pf);
              results.push('--- ' + pf.docType + ' (' + pf.file.name + ') ---\n' + text);
            });
          } else {
            results.push('--- ' + pf.docType + ' (' + pf.file.name + ') ---\n[Image uploaded. Please ask the veteran about the contents of this ' + pf.docType + '.]');
            return Promise.resolve();
          }
        } else {
          results.push('--- ' + pf.docType + ' (' + pf.file.name + ') ---\n[' + pf.file.type + ' file uploaded. Please ask the veteran about the contents.]');
          return Promise.resolve();
        }
      });
    });

    return chain.then(function() { return results.join('\n\n'); });
  }

  // ══════════════════════════════════════════════════════
  //  REPORT DETECTION + PDF GENERATION (Phase 2)
  // ══════════════════════════════════════════════════════
  var lastReportText = null; // stores the latest detected report text

  function isReportResponse(text) {
    if (!text) return false;

    // Condition 1: at least 3 markdown headings (## style)
    var headings = (text.match(/^#{1,3}\s+\S/gm) || []).length;

    // Condition 2: long enough to be a full report
    var longEnough = text.length >= 800;

    // Condition 3: contains a personal data signal — a 4-digit year (DOB / service date)
    // or a "Last, First" name pattern — distinguishes a veteran-specific report
    // from a generic formatted explanation (e.g., "## General POA  ## Durable POA")
    var hasPersonalData =
      /\b\d{4}\b/.test(text) ||
      /\b[A-Z][a-z]+,\s+[A-Z][a-z]+\b/.test(text);

    return headings >= 3 && longEnough && hasPersonalData;
  }

  function generateReportPDF(reportText) {
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      showToast('PDF library not loaded. Please try again.');
      log('PDF', 'jsPDF not available');
      return;
    }

    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4' });

    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var marginL = 20;
    var marginR = 20;
    var marginTop = 25;
    var marginBottom = 20;
    var usableW = pageW - marginL - marginR;
    var y = marginTop;

    // ── Header bar ──
    doc.setFillColor(26, 54, 93); // navy
    doc.rect(0, 0, pageW, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('AfterAction AI \u2014 Veteran Benefits Report', pageW / 2, 12, { align: 'center' });

    y = 28;

    // ── Date line ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    var dateStr = 'Generated: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(dateStr, pageW - marginR, y, { align: 'right' });
    y += 8;

    // ── Parse sections from the report text ──
    var sections = parseReportSections(reportText);

    // ── Render each section ──
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];

      // Section heading
      if (sec.heading) {
        if (y > pageH - 40) { doc.addPage(); y = marginTop; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(26, 54, 93);
        y += 4;
        doc.text(sec.heading, marginL, y);
        y += 2;
        // underline
        doc.setDrawColor(26, 54, 93);
        doc.setLineWidth(0.5);
        doc.line(marginL, y, marginL + usableW, y);
        y += 6;
      }

      // Section body
      if (sec.body) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);

        var lines = doc.splitTextToSize(sec.body, usableW);
        for (var li = 0; li < lines.length; li++) {
          if (y > pageH - marginBottom) {
            doc.addPage();
            y = marginTop;
          }
          doc.text(lines[li], marginL, y);
          y += 5;
        }
        y += 3;
      }
    }

    // ── Footer on every page ──
    var totalPages = doc.internal.getNumberOfPages();
    for (var p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('AfterAction AI \u2014 afteractionai.org', marginL, pageH - 8);
      doc.text('Page ' + p + ' of ' + totalPages, pageW - marginR, pageH - 8, { align: 'right' });
    }

    doc.save('AfterAction_AI_Report.pdf');
    log('PDF', 'downloaded');
  }

  function parseReportSections(text) {
    // Clean markdown artifacts
    var clean = text
      .replace(/\[OPTIONS:\s*.*?\]/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\[(.*?)\]\(https?:\/\/.*?\)/g, '$1')
      .trim();

    var sections = [];
    // Split on markdown-style headings (##, ###, numbered headings, or ALL-CAPS lines)
    var parts = clean.split(/\n(?=#{1,3}\s|(?:\d+[\.\)]\s*[A-Z])|\n[A-Z][A-Z\s&\-:]{5,}\n)/);

    if (parts.length <= 1) {
      // No clear sections found — treat as one block with a generic heading
      sections.push({ heading: 'Your Personalized Report', body: clean });
      return sections;
    }

    for (var i = 0; i < parts.length; i++) {
      var chunk = parts[i].trim();
      if (!chunk) continue;

      // Try to extract heading from first line
      var firstNewline = chunk.indexOf('\n');
      var heading = '';
      var body = chunk;

      if (firstNewline > 0 && firstNewline < 120) {
        var potentialHeading = chunk.substring(0, firstNewline).replace(/^#{1,3}\s*/, '').replace(/^\d+[\.\)]\s*/, '').trim();
        if (potentialHeading.length < 100) {
          heading = potentialHeading;
          body = chunk.substring(firstNewline + 1).trim();
        }
      }

      if (!heading && i === 0) heading = 'Veteran Summary';

      sections.push({ heading: heading, body: body });
    }

    return sections;
  }

  function showReportActions(reportText) {
    lastReportText = reportText;
    // Signal that AI has generated a complete report
    window.dispatchEvent(new CustomEvent('aaai:audit_completed', { detail: { tags: [] } }));
    log('Analytics', 'dispatched aaai:audit_completed');

    // Fix 3: Removed duplicate report save — _processDocumentActions already handles
    // saving via Cases A/B/C synthesis in both text and voice paths. This block was
    // saving the same report a second time to template_outputs.

    var div = document.createElement('div');
    div.className = 'message message--system';
    div.innerHTML =
      '<div class="report-actions">' +
        '<p class="report-actions__title">YOUR PERSONALIZED REPORT IS READY</p>' +
        '<div class="report-actions__buttons">' +
          '<button id="btnDownloadPDF" class="report-actions__btn report-actions__btn--pdf">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
            ' Download PDF' +
          '</button>' +
          '<button id="btnLaunchChecklist" class="report-actions__btn report-actions__btn--checklist">' +
            'View Mission Checklist \u2192' +
          '</button>' +
          '<a href="/profile.html" id="btnGoToDashboard" class="report-actions__btn report-actions__btn--dashboard" style="' +
            'display:inline-flex;align-items:center;gap:6px;background:#c6a135;color:#1a365d;' +
            'text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700;font-size:0.95rem;' +
            'border:none;cursor:pointer;">' +
            '\uD83C\uDFAF Go to Dashboard' +
          '</a>' +
        '</div>' +
        '<p class="report-actions__note">Your report and checklist are saved to your dashboard. You can also keep chatting \u2014 I\'m here for as long as you need.</p>' +
        '<div class="report-actions__consent">' +
          '<label for="chkEmailConsent">' +
            '<input type="checkbox" id="chkEmailConsent"> ' +
            'I agree to receive updates and resources' +
          '</label>' +
        '</div>' +
      '</div>';
    if (chatMessages) chatMessages.appendChild(div);
    scrollToBottom();

    // Wire up PDF button
    var pdfBtn = document.getElementById('btnDownloadPDF');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function() {
        // Legal forms route through acknowledgment modal + .docx (unchanged)
        if (typeof AAAI !== 'undefined' && AAAI.legalIntegration && AAAI.legalIntegration.detectAndHandle(reportText)) {
          return;
        }
        // Phase 3.6: structured DOCX export when case data is available
        if (_activeCaseId && window.AIOS && window.AIOS.ReportBuilder &&
            window.AIOS.ReportBuilder.isAvailable()) {
          window.AIOS.ReportBuilder.generate(_activeCaseId, reportText).catch(function(err) {
            console.warn('[ReportBuilder] DOCX failed, falling back to PDF:', err);
            generateReportPDF(reportText);
          });
          return;
        }
        generateReportPDF(reportText);
      });
    }

    // Wire up checklist button
    var clBtn = document.getElementById('btnLaunchChecklist');
    if (clBtn) {
      clBtn.addEventListener('click', function() {
        buildChecklist(reportText);
      });
    }

    // Wire up email consent checkbox
    var consentChk = document.getElementById('chkEmailConsent');
    if (consentChk) {
      consentChk.addEventListener('change', function() {
        var value = consentChk.checked;
        console.log('EMAIL CONSENT:', value);
        if (typeof AAAI !== 'undefined' && AAAI.auth && AAAI.auth.updateConsent) {
          if (!AAAI.auth.isLoggedIn || !AAAI.auth.isLoggedIn()) {
            log('Consent', 'user not logged in — consent not saved');
            return;
          }
          AAAI.auth.updateConsent(value).then(function(result) {
            if (result && result.error) {
              log('Consent', 'updateConsent error: ' + result.error);
            } else {
              log('Consent', 'consent_email saved: ' + value);
            }
          }).catch(function(e) {
            log('Consent', 'updateConsent exception: ' + e.message);
          });
        }
      });
    }

    // Action Engine — show recommended next actions based on report content
    var detectedIssues = [];
    if (typeof AAAI !== 'undefined' && AAAI.actions) {
      try {
        var userProfile = null;
        if (AAAI.auth && AAAI.auth.getProfile) {
          userProfile = AAAI.auth.getProfile();
        }
        // Use enriched plan if user has saved tags, otherwise standard plan
        var actionPlan = (AAAI.actions.getEnrichedPlan && userProfile && userProfile.issue_tags)
          ? AAAI.actions.getEnrichedPlan(reportText, userProfile)
          : AAAI.actions.getActionPlan(reportText, userProfile);

        detectedIssues = actionPlan.issues;

        var panelHtml = (AAAI.actions.renderEnrichedPanel && actionPlan.savedTagCount > 0)
          ? AAAI.actions.renderEnrichedPanel(actionPlan, { maxTemplates: 4, maxResources: 3 })
          : AAAI.actions.renderActionPanel(actionPlan, { maxTemplates: 4, maxResources: 3 });

        if (panelHtml) {
          var actionDiv = document.createElement('div');
          actionDiv.className = 'message message--system';
          actionDiv.innerHTML =
            '<div class="action-panel__title">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
              ' Recommended Next Actions' +
            '</div>' + panelHtml;
          if (chatMessages) chatMessages.appendChild(actionDiv);
          scrollToBottom();
          log('ActionEngine', 'showed ' + actionPlan.issues.length + ' issues, ' +
              actionPlan.templates.flow.length + ' templates, ' +
              actionPlan.resources.length + ' resources' +
              (actionPlan.savedTagCount ? ' (enriched from ' + actionPlan.savedTagCount + ' saved tags)' : ''));
        }

        // Persist detected issue tags for smart matching across sessions
        if (detectedIssues.length > 0) {
          AAAI.actions.persistTags(detectedIssues);
        }

        // ── State Benefits Recommendations ────────────────
        // Detect state from profile or conversation text
        var userState = (userProfile && userProfile.state) ? userProfile.state : null;
        if (!userState) {
          // Try to extract state from report/conversation text
          var stateList = (typeof ResourceHub !== 'undefined' && ResourceHub.STATES) ? ResourceHub.STATES : [];
          for (var si = 0; si < stateList.length; si++) {
            var s = stateList[si];
            // Match full state name in text (case-insensitive, word boundary)
            var stateRegex = new RegExp('\\b' + s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
            if (stateRegex.test(reportText)) {
              userState = s.abbr;
              break;
            }
          }
        }

        if (userState && AAAI.actions.getStateBenefitsForUser) {
          var stateContext = {
            state: userState,
            issue_tags: detectedIssues,
            disability_rating_band: (userProfile && userProfile.disability_rating) ? userProfile.disability_rating : null,
            service_status: (userProfile && userProfile.service_status) ? userProfile.service_status : 'veteran'
          };

          AAAI.actions.getStateBenefitsForUser(stateContext).then(function(benefits) {
            if (benefits && benefits.length > 0) {
              // Look up full state name for display
              var stateName = userState;
              var statesList = (typeof ResourceHub !== 'undefined' && ResourceHub.STATES) ? ResourceHub.STATES : [];
              for (var sn = 0; sn < statesList.length; sn++) {
                if (statesList[sn].abbr === userState) {
                  stateName = statesList[sn].name;
                  break;
                }
              }

              var benefitsHtml = AAAI.actions.renderStateBenefitsPanel(benefits, stateName);
              if (benefitsHtml) {
                var benefitsDiv = document.createElement('div');
                benefitsDiv.className = 'message message--system';
                benefitsDiv.innerHTML =
                  '<div class="action-panel__title">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
                    ' Recommended State Benefits' +
                  '</div>' + benefitsHtml;
                if (chatMessages) chatMessages.appendChild(benefitsDiv);
                scrollToBottom();
                log('StateBenefits', 'showed ' + benefits.length + ' benefits for ' + stateName);
              }
            }
          }).catch(function(e) {
            log('StateBenefits', 'error: ' + e.message);
          });
        }
      } catch(e) {
        log('ActionEngine', 'render error: ' + e.message);
      }
    }

    // Save report to Supabase if logged in + auto-generate checklist
    if (typeof AAAI !== 'undefined' && AAAI.auth && AAAI.auth.isLoggedIn && AAAI.auth.isLoggedIn()) {
      // PHASE 2 - Use new persistent layer if activeCaseId present
      // Save to new reports table (case-linked) alongside existing ai_reports save.
      // Fire-and-forget — does not affect the existing flow in any way.
      if (_activeCaseId && AAAI.DataAccess && AAAI.DataAccess.reports) {
        AAAI.DataAccess.reports.save(_activeCaseId, {
          report_type:          'after_action',
          content:              reportText,
          conversation_history: conversationHistory,
          model_used:           CONFIG.model
        }).then(function(r) {
          if (r.error) {
            console.error('[AAAI ERROR][DataAccess.reports.save] failed:', r.error);
          } else if (r.data) {
            log('Phase2', 'report saved to cases/reports table — id: ' + r.data.id);
          }
        }).catch(function(e) {
          console.error('[AAAI ERROR][DataAccess.reports.save] exception:', e);
        });
      }

      AAAI.auth.saveReport(reportText, conversationHistory).then(function(result) {
        if (result && !result.error) {
          log('Report', 'saved to Supabase');
          // Signal that report was persisted — pass reportId for analytics correlation
          var savedReportId = result.data && result.data.id ? result.data.id : null;
          window.dispatchEvent(new CustomEvent('aaai:report_generated', {
            detail: { reportId: savedReportId, tags: [] }
          }));
          log('Analytics', 'dispatched aaai:report_generated | reportId=' + savedReportId);

          // ── SUCCESS HANDOFF: show confirmation + View Dashboard action ──
          var handoff = document.createElement('div');
          handoff.className = 'message message--system';
          handoff.innerHTML =
            '<div class="save-success-bar">' +
              '<span class="save-success-bar__icon">\u2705</span> ' +
              '<span class="save-success-bar__text">Report saved to your dashboard.</span> ' +
              '<a href="/profile.html" class="save-success-bar__link">View Dashboard \u2192</a>' +
            '</div>';
          if (chatMessages) chatMessages.appendChild(handoff);
          scrollToBottom();

          // Auto-redirect in text mode only (voice users stay in conversation)
          if (inputMode !== 'voice') {
            setTimeout(function() {
              // Only redirect if user hasn't scrolled away or started typing
              if (document.activeElement !== userInput) {
                window.location.href = '/profile.html';
              }
            }, 5000);
          }

          // Auto-save action engine checklist items linked to this report
          if (result.data && result.data.id && AAAI.actions && AAAI.actions.autoSaveChecklist && detectedIssues.length > 0) {
            AAAI.actions.autoSaveChecklist(result.data.id, detectedIssues).then(function(clResult) {
              if (clResult && clResult.data) {
                log('AutoChecklist', 'saved ' + clResult.data.length + ' items from action engine');
              }
            }).catch(function(e) {
              log('AutoChecklist', 'save error: ' + e.message);
            });
          }

          // Extract segmentation signals from conversation and write to profile
          if (AAAI.auth.updateSegmentation) {
            var seg = extractSegmentationFromConversation(conversationHistory);
            AAAI.auth.updateSegmentation(seg).then(function(segResult) {
              if (segResult && !segResult.skipped) {
                log('Segmentation', 'profile updated: ' + JSON.stringify(seg));
              }
            }).catch(function(e) {
              log('Segmentation', 'update error: ' + e.message);
            });
          }
        } else {
          throw new Error('saveReport:' + (result && result.error ? JSON.stringify(result.error) : 'null result'));
        }
      }).catch(function(e) {
        console.error('[AAAI ERROR][saveReport]', e.message || e);
        if (chatMessages) {
          var _rpErr = document.createElement('div');
          _rpErr.className = 'message message--system';
          _rpErr.innerHTML = '<div class="save-success-bar" style="background:#fef2f2;border-color:#fca5a5;"><span style="color:#dc2626;">⚠</span> <span style="color:#991b1b;">Report could not be saved to your account. Your session data is intact.</span></div>';
          chatMessages.appendChild(_rpErr);
          scrollToBottom();
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  SEGMENTATION EXTRACTION
  //  Parses conversation history to extract profile fields.
  //  Matches user replies against known AI prompt options.
  // ══════════════════════════════════════════════════════
  function extractSegmentationFromConversation(history) {
    // Collect all user message text — lowercase for matching
    var userText = history
      .filter(function(m) { return m.role === 'user'; })
      .map(function(m) { return (m.content || '').toLowerCase(); })
      .join(' | ');

    // ── AUDIENCE TYPE ──────────────────────────────────────
    // Maps Q3 service status options → audience_type values
    var audienceType = null;
    var audienceMap = [
      { match: ['active duty', 'active-duty'],                              value: 'active_duty' },
      { match: ['guard', 'reserve', 'guard/reserve', 'guard / reserve'],   value: 'guard_reserve' },
      { match: ['transitioning', 'within 12 months'],                      value: 'transitioning' },
      { match: ['recently separated', 'recently sep', '< 2 years', 'less than 2'],  value: 'recently_separated' },
      { match: ['veteran', '2+ years', 'two years out'],                   value: 'veteran' },
      { match: ['retired', '20+ yrs', 'medical retirement'],               value: 'retired' },
      { match: ['family', 'spouse', 'surviving', 'caregiver'],             value: 'family_member' }
    ];
    audienceMap.some(function(entry) {
      return entry.match.some(function(phrase) {
        if (userText.indexOf(phrase) !== -1) { audienceType = entry.value; return true; }
      });
    });

    // ── PRIMARY NEED ───────────────────────────────────────
    // Maps Phase 2 category selection → primary_need values
    var primaryNeed = null;
    var primaryMap = [
      { match: ['va benefits', 'disability', 'va claim', 'va rating'],     value: 'va_benefits' },
      { match: ['employment', 'career', 'job', 'resume', 'work'],          value: 'employment' },
      { match: ['education', 'gi bill', 'school', 'degree', 'training'],   value: 'education' },
      { match: ['medical', 'mental health', 'healthcare', 'counseling'],   value: 'medical_mental_health' },
      { match: ['legal', 'documents', 'power of attorney', 'will'],        value: 'legal_documents' },
      { match: ['financial', 'emergency aid', 'debt', 'budget'],           value: 'financial' },
      { match: ['housing', 'home loan', 'va loan', 'rental'],              value: 'housing' },
      { match: ['family support', 'community', 'caregiver'],               value: 'family_support' },
      { match: ['business', 'entrepreneur', 'self-employed'],              value: 'business' }
    ];
    primaryMap.some(function(entry) {
      return entry.match.some(function(phrase) {
        if (userText.indexOf(phrase) !== -1) { primaryNeed = entry.value; return true; }
      });
    });

    // ── SECONDARY NEEDS ────────────────────────────────────
    // All category matches beyond the first become secondary_needs
    var secondaryNeeds = [];
    primaryMap.forEach(function(entry) {
      var matched = entry.match.some(function(phrase) {
        return userText.indexOf(phrase) !== -1;
      });
      if (matched && entry.value !== primaryNeed) {
        secondaryNeeds.push(entry.value);
      }
    });

    // ── STATE ──────────────────────────────────────────────
    // Extract US state mentions from Q6
    var state = null;
    var statePattern = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i;
    var stateMatch = userText.match(statePattern);
    if (stateMatch) { state = stateMatch[0].replace(/\b\w/g, function(c) { return c.toUpperCase(); }); }

    // ── VETERAN STATUS ─────────────────────────────────────
    var veteranStatus = null;
    if (userText.indexOf('honorable') !== -1) { veteranStatus = 'honorable'; }
    else if (userText.indexOf('general under honorable') !== -1) { veteranStatus = 'general_under_honorable'; }
    else if (userText.indexOf('other than honorable') !== -1) { veteranStatus = 'oth'; }

    return {
      audience_type: audienceType,
      primary_need: primaryNeed,
      secondary_needs: secondaryNeeds.length > 0 ? secondaryNeeds : null,
      state: state,
      veteran_status: veteranStatus
    };
  }

  // ══════════════════════════════════════════════════════
  //  CHECKLIST PERSISTENCE - Phase 1 Fix
  //  Saves item list + completed indices to localStorage.
  //  Key: afteraction_checklist_progress_v1
  //  Progress survives page refresh.
  // ══════════════════════════════════════════════════════

  var CHECKLIST_STORAGE_KEY = 'afteraction_checklist_progress_v1'; // PERSISTENCE ADDED - Phase 1 Fix

  // PERSISTENCE ADDED - Phase 1 Fix
  // Read completed item indices from DOM and write to localStorage
  function saveChecklistState() {
    try {
      var all = document.querySelectorAll('.checklist-item');
      var completedIndices = [];
      all.forEach(function(el) {
        if (el.classList.contains('completed')) {
          completedIndices.push(parseInt(el.getAttribute('data-index'), 10));
        }
      });
      var stored = JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_KEY) || '{}');
      stored.completedIndices = completedIndices;
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(stored));
      log('Checklist', 'saved ' + completedIndices.length + ' completed items to localStorage');
    } catch(e) {
      log('Checklist', 'localStorage save failed: ' + e.message);
    }
  }

  // PERSISTENCE ADDED - Phase 1 Fix
  // Apply saved completed indices to already-rendered DOM items
  function loadChecklistState() {
    try {
      var stored = JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_KEY) || '{}');
      var indices = stored.completedIndices || [];
      if (indices.length === 0) return;
      indices.forEach(function(idx) {
        var el = document.querySelector('.checklist-item[data-index="' + idx + '"]');
        if (el) {
          el.classList.add('completed');
          var check = el.querySelector('.checklist-item__check');
          if (check) check.classList.add('checked');
        }
      });
      log('Checklist', 'restored ' + indices.length + ' completed items from localStorage');
    } catch(e) {
      log('Checklist', 'localStorage load failed: ' + e.message);
    }
  }

  // PERSISTENCE ADDED - Phase 1 Fix
  // Called from init() — if items were saved, re-render checklist DOM on page load
  // so completed state is available even after a refresh
  function restoreChecklistFromStorage() {
    try {
      var stored = JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_KEY) || '{}');
      if (!stored.items || stored.items.length === 0) return;
      log('Checklist', 'page load restore — ' + stored.items.length + ' items from localStorage');
      renderChecklistItems(stored.items);
      loadChecklistState();
      updateChecklistProgress();

      // Phase 3.3: Restore DB id + status maps from DB after re-render.
      // Runs immediately if Mission is already resolved; the aaai:mission_state_synced
      // listener in init() covers the delayed case.
      if (_activeCaseId && window.AIOS && window.AIOS.Checklist &&
          window.AIOS.Mission && window.AIOS.Mission.current &&
          window.AIOS.Mission.current._dbId) {
        window.AIOS.Checklist.restoreFromDB(window.AIOS.Mission.current._dbId)
          .then(function(r) {
            if (r && r.data && r.data.length) {
              _checklistDbIds = {};
              r.data.forEach(function(row, i) {
                var idx = (row.sort_order !== undefined && row.sort_order !== null)
                  ? row.sort_order : i;
                _checklistDbIds[idx] = row.id;
              });
              log('Phase3.3', '_checklistDbIds restored from DB — ' + r.data.length + ' items');
              _applyDbStatusToDOM();
            }
          }).catch(function(e) { console.error('[AAAI ERROR][checklist.dbIds] page-load DB restore failed — case:', _activeCaseId, '|', e); });
      }
    } catch(e) {
      log('Checklist', 'localStorage page-load restore failed: ' + e.message);
    }
  }

  // Phase 3.3: Apply DB-sourced lifecycle status to rendered checklist DOM items.
  // Called after _checklistDbIds + _statusMap are populated from DB.
  function _applyDbStatusToDOM() {
    if (!window.AIOS || !window.AIOS.Checklist) return;
    var all = document.querySelectorAll('.checklist-item');
    all.forEach(function(el) {
      var idx = parseInt(el.getAttribute('data-index'), 10);
      if (isNaN(idx)) return;
      var status = window.AIOS.Checklist.getStatus(idx);
      el.setAttribute('data-status', status);
      if (status === 'completed' && !el.classList.contains('completed')) {
        el.classList.add('completed');
        var checkEl = el.querySelector('.checklist-item__check');
        if (checkEl) checkEl.classList.add('checked');
      }
      if (status === 'in_progress') el.classList.add('in-progress');
      if (status === 'skipped')     el.classList.add('skipped');
    });
    updateChecklistProgress();
  }

  // PERSISTENCE ADDED - Phase 1 Fix
  // Replaces the old inline onclick toggle — now also saves state after each toggle
  window.toggleChecklistItem = function(checkEl) {
    checkEl.classList.toggle('checked');
    var itemEl = checkEl.closest('.checklist-item');
    itemEl.classList.toggle('completed');
    var isNowCompleted = itemEl.classList.contains('completed');

    // Phase 3.3: sync data-status attribute; clear in-progress/skipped visual state
    itemEl.setAttribute('data-status', isNowCompleted ? 'completed' : 'not_started');
    itemEl.classList.remove('in-progress', 'skipped');

    saveChecklistState(); // Phase 1 — localStorage always runs first

    var itemIdx  = parseInt(itemEl.getAttribute('data-index'), 10);
    var newStatus = isNowCompleted ? 'completed' : 'not_started';

    // Phase 3.3: prefer ChecklistManager route (handles reopen vs toggle correctly)
    if (!isNaN(itemIdx) && window.AIOS && window.AIOS.Checklist &&
        window.AIOS.Checklist.getDbId(itemIdx)) {
      window.AIOS.Checklist.transition(itemIdx, newStatus)
        .then(function(r) {
          if (!r.error) {
            log('Phase3.3', 'checklist transition — idx:' + itemIdx + ' status:' + newStatus);
          }
        }).catch(function(e) { console.error('[AAAI ERROR][checklist.transition] toggle failed — idx:', itemIdx, '| status:', newStatus, '|', e); });
    } else if (_activeCaseId && window.AAAI && window.AAAI.DataAccess &&
               !isNaN(itemIdx) && _checklistDbIds[itemIdx]) {
      // Phase 2 fallback — direct toggle (no ChecklistManager available)
      (function(_dbId, _completed) {
        withRetry(function() { return window.AAAI.DataAccess.checklistItems.toggle(_dbId, _completed); }, 'checklist.toggle:fallback')
          .then(function(r) {
            if (!r.error) {
              log('Phase2', 'checklist toggle fallback — dbId: ' + _dbId +
                  ' completed: ' + _completed);
            }
          }).catch(function(e) { console.error('[AAAI ERROR][checklist.toggle] fallback failed — dbId:', _dbId, '| completed:', _completed, '|', e); });
      })(_checklistDbIds[itemIdx], isNowCompleted);
    }
  };

  // Phase 3.3: Mark item in_progress (or toggle back to not_started on second click)
  window.markItemInProgress = function(btnEl) {
    var itemEl = btnEl.closest ? btnEl.closest('.checklist-item') : null;
    if (!itemEl) return;
    var curStatus = itemEl.getAttribute('data-status') || 'not_started';
    var newStatus = (curStatus === 'in_progress') ? 'not_started' : 'in_progress';
    itemEl.setAttribute('data-status', newStatus);
    itemEl.classList.remove('completed', 'in-progress', 'skipped');
    if (newStatus === 'in_progress') itemEl.classList.add('in-progress');
    var checkEl = itemEl.querySelector('.checklist-item__check');
    if (checkEl && newStatus !== 'completed') checkEl.classList.remove('checked');
    saveChecklistState();
    var itemIdx = parseInt(itemEl.getAttribute('data-index'), 10);
    if (!isNaN(itemIdx) && window.AIOS && window.AIOS.Checklist &&
        window.AIOS.Checklist.getDbId(itemIdx)) {
      window.AIOS.Checklist.transition(itemIdx, newStatus).catch(function(e) { console.error('[AAAI ERROR][checklist.transition] in_progress failed — idx:', itemIdx, '| status:', newStatus, '|', e); });
    }
  };

  // Phase 3.3: Skip item (or toggle back to not_started on second click)
  window.skipChecklistItem = function(btnEl) {
    var itemEl = btnEl.closest ? btnEl.closest('.checklist-item') : null;
    if (!itemEl) return;
    var curStatus = itemEl.getAttribute('data-status') || 'not_started';
    var newStatus = (curStatus === 'skipped') ? 'not_started' : 'skipped';
    itemEl.setAttribute('data-status', newStatus);
    itemEl.classList.remove('completed', 'in-progress', 'skipped');
    if (newStatus === 'skipped') itemEl.classList.add('skipped');
    var checkEl2 = itemEl.querySelector('.checklist-item__check');
    if (checkEl2 && newStatus !== 'completed') checkEl2.classList.remove('checked');
    saveChecklistState();
    var itemIdx2 = parseInt(itemEl.getAttribute('data-index'), 10);
    if (!isNaN(itemIdx2) && window.AIOS && window.AIOS.Checklist &&
        window.AIOS.Checklist.getDbId(itemIdx2)) {
      window.AIOS.Checklist.transition(itemIdx2, newStatus).catch(function(e) { console.error('[AAAI ERROR][checklist.transition] skip failed — idx:', itemIdx2, '| status:', newStatus, '|', e); });
    }
  };

  // PERSISTENCE ADDED - Phase 1 Fix
  // Extracted from buildChecklist — shared render path used by both
  // buildChecklist (fresh report) and restoreChecklistFromStorage (page load)
  function renderChecklistItems(items) {
    var sections = {
      immediate: document.querySelector('#checklistImmediate .checklist-section__items'),
      short_term: document.querySelector('#checklistShortTerm .checklist-section__items'),
      strategic: document.querySelector('#checklistStrategic .checklist-section__items'),
      optional: document.querySelector('#checklistOptional .checklist-section__items')
    };

    var keys = Object.keys(sections);
    for (var k = 0; k < keys.length; k++) {
      if (sections[keys[k]]) sections[keys[k]].innerHTML = '';
    }

    items.forEach(function(item, index) {
      var section = sections[item.category];
      if (!section) return;

      var el = document.createElement('div');
      el.className = 'checklist-item';
      el.setAttribute('data-index', index);
      el.setAttribute('data-status', 'not_started'); // Phase 3.3: lifecycle status attr

      // PERSISTENCE ADDED - Phase 1 Fix: onclick now calls toggleChecklistItem (saves state)
      // Phase 3.3: added In Progress + Skip action buttons
      el.innerHTML =
        '<div class="checklist-item__check" onclick="toggleChecklistItem(this);updateChecklistProgress();">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' +
        '</div>' +
        '<div class="checklist-item__content">' +
          '<div class="checklist-item__title">' + item.title + '</div>' +
          (item.description ? '<div class="checklist-item__desc">' + item.description + '</div>' : '') +
          '<div class="checklist-item__actions">' +
            '<button class="checklist-btn checklist-btn--assist" data-index="' + index + '" title="AI explains this step">AI Assist</button>' +
            '<button class="checklist-btn checklist-btn--progress" data-index="' + index + '" title="Mark as in progress" onclick="markItemInProgress(this);">In Progress</button>' +
            '<button class="checklist-btn checklist-btn--skip" data-index="' + index + '" title="Skip this item" onclick="skipChecklistItem(this);">Skip</button>' +
          '</div>' +
        '</div>';
      section.appendChild(el);
    });

    document.querySelectorAll('.checklist-btn--assist').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var itemEl = this.closest('.checklist-item');
        var title = itemEl.querySelector('.checklist-item__title').textContent;
        var desc = itemEl.querySelector('.checklist-item__desc');
        showAIAssist(itemEl, title, desc ? desc.textContent : '');
      });
    });
  }

  // ══════════════════════════════════════════════════════
  //  CHECKLIST INTEGRATION
  // ══════════════════════════════════════════════════════
  function showChecklistPrompt(reportText) {
    var div = document.createElement('div');
    div.className = 'message message--system';
    div.innerHTML =
      '<div class="checklist-cta">' +
        '<p class="checklist-cta__title">YOUR MISSION STARTS NOW</p>' +
        '<p class="checklist-cta__desc">Your personalized plan is ready. Convert it into an actionable mission checklist.</p>' +
        '<button id="btnLaunchChecklist" class="checklist-cta__btn">View Mission Checklist \u2192</button>' +
        '<p class="checklist-cta__note">Or keep chatting \u2014 I\'m here for as long as you need.</p>' +
      '</div>';
    if (chatMessages) chatMessages.appendChild(div);
    scrollToBottom();

    $('btnLaunchChecklist').addEventListener('click', function() {
      buildChecklist(reportText);
    });
  }

  function buildChecklist(reportText) {
    var items = parseReportToChecklist(reportText);

    // PERSISTENCE ADDED - Phase 1 Fix
    // Save items to localStorage so they survive page refresh.
    // completedIndices preserved if this is same session re-open;
    // reset to [] if this is a brand-new report (items will differ).
    try {
      var existing = JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_KEY) || '{}');
      var isSameReport = existing.items && existing.items.length === items.length &&
        existing.items[0] && items[0] && existing.items[0].title === items[0].title;
      existing.items = items;
      if (!isSameReport) existing.completedIndices = []; // fresh report — clear old progress
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(existing));
      log('Checklist', 'items saved to localStorage (' + items.length + ' items, ' +
        (isSameReport ? 'same report — kept progress' : 'new report — progress reset') + ')');
    } catch(e) {
      log('Checklist', 'could not save items to localStorage: ' + e.message);
    }

    renderChecklistItems(items); // PERSISTENCE ADDED - Phase 1 Fix: uses shared render function

    loadChecklistState(); // PERSISTENCE ADDED - Phase 1 Fix: restore completed state from localStorage

    // PHASE 3.3 — Persist to DB with idempotency guard + ChecklistManager sync.
    // saveBatch() checks for existing rows server-side; returns existing rows
    // unchanged if already saved. Mirrors result into AIOS.Checklist so all
    // lifecycle ops (toggle, in_progress, skip, reopen) work immediately.
    if (_activeCaseId && window.AAAI && window.AAAI.DataAccess &&
        window.AIOS && window.AIOS.Mission && window.AIOS.Mission.current &&
        window.AIOS.Mission.current._dbId) {
      var _missionDbId = window.AIOS.Mission.current._dbId;
      (function(_items, _caseId, _mId) {
        window.AAAI.DataAccess.checklistItems.saveBatch(_caseId, _mId, _items)
          .then(function(r) {
            if (r.error) {
              console.error('[AAAI ERROR][checklistItems.saveBatch] failed — missionId:', _mId, '| error:', r.error);
              return;
            }
            _checklistDbIds = {};
            if (r.data && r.data.length) {
              r.data.forEach(function(row, i) {
                var idx = (row.sort_order !== undefined && row.sort_order !== null)
                  ? row.sort_order : i;
                _checklistDbIds[idx] = row.id;
              });
              // Phase 3.3: mirror into ChecklistManager for full lifecycle support
              if (window.AIOS && window.AIOS.Checklist) {
                window.AIOS.Checklist.buildDbIds(r.data, _mId);
              }
              log('Phase3.3', 'checklist synced — ' + r.data.length + ' rows | missionId: ' + _mId);
            }
          }).catch(function(e) {
            console.error('[AAAI ERROR][checklistItems.saveBatch] exception — missionId:', _mId, '|', e);
          });
      })(items, _activeCaseId, _missionDbId);
    }

    var checklistScreen = $('checklistScreen');
    if (chatScreen) chatScreen.style.display = 'none';
    if (checklistScreen) checklistScreen.style.display = 'flex';
    updateChecklistProgress();
  }

  function parseReportToChecklist(text) {
    var items = [];
    var lines = text.split('\n');
    var currentCategory = 'immediate';

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      var lower = line.toLowerCase();

      if (lower.indexOf('immediate') > -1 || lower.indexOf('this week') > -1 || lower.indexOf('right now') > -1) {
        currentCategory = 'immediate'; continue;
      }
      if (lower.indexOf('short-term') > -1 || lower.indexOf('short term') > -1 || lower.indexOf('this month') > -1) {
        currentCategory = 'short_term'; continue;
      }
      if (lower.indexOf('medium-term') > -1 || lower.indexOf('strategic') > -1 || lower.indexOf('long-term') > -1 || lower.indexOf('6-12 month') > -1) {
        currentCategory = 'strategic'; continue;
      }
      if (lower.indexOf('optional') > -1 || lower.indexOf('bonus') > -1) {
        currentCategory = 'optional'; continue;
      }

      var actionMatch = line.match(/^(?:\d+[\.\)]\s*|\*\s+|-\s+|\u2022\s*)(.+)/);
      if (actionMatch && actionMatch[1].length > 10) {
        var title = actionMatch[1].replace(/\*\*/g, '').trim();
        var desc = '';
        for (var j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          var nextLine = lines[j].trim();
          if (!nextLine) continue;
          if (nextLine.match(/^(?:\d+[\.\)]\s*|\*\s+|-\s+|\u2022\s*)/)) break;
          if (nextLine.length > 15 && !nextLine.match(/^#{1,3}\s/)) {
            desc = nextLine.replace(/\*\*/g, '').trim();
            break;
          }
        }
        items.push({ category: currentCategory, title: title.substring(0, 200), description: desc.substring(0, 300) });
      }
    }

    if (items.length < 3) {
      return [
        { category: 'immediate', title: 'Review your personalized AfterAction Plan', description: 'Read through the full plan above and identify your top priority.' },
        { category: 'immediate', title: 'Contact the first resource listed in your plan', description: 'Make the first call or visit the first link recommended.' },
        { category: 'immediate', title: 'Gather required documents', description: 'Collect DD-214, VA rating letter, and any other documents mentioned.' },
        { category: 'short_term', title: 'Complete initial applications', description: 'Submit applications for benefits and programs identified in your plan.' },
        { category: 'short_term', title: 'Follow up on pending items', description: 'Check status of applications and schedule follow-up appointments.' },
        { category: 'strategic', title: 'Track progress and adjust plan', description: 'Come back to update your plan as your situation evolves.' },
        { category: 'optional', title: 'Explore additional resources', description: 'Visit the Education Hub and Resources page for more tools.' }
      ];
    }
    return items;
  }

  window.updateChecklistProgress = function() {
    // DOM-based progress — instant, always runs as primary source
    var all       = document.querySelectorAll('.checklist-item');
    var completed = document.querySelectorAll('.checklist-item.completed');
    var pct       = all.length > 0 ? Math.round((completed.length / all.length) * 100) : 0;
    var fill      = $('checklistProgressFill');
    var text      = $('checklistProgressText');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = pct + '% Complete \u2014 ' + completed.length + ' of ' + all.length + ' tasks';

    // Phase 3.3: async DB-authoritative progress — overwrites DOM count when available.
    // DB is source of truth: counts completed rows only.
    if (window.AIOS && window.AIOS.Checklist) {
      window.AIOS.Checklist.getProgress()
        .then(function(r) {
          if (r && r.data && r.data.total > 0) {
            var dbPct  = r.data.pct;
            var dbDone = r.data.completed;
            var dbTot  = r.data.total;
            if (fill) fill.style.width = dbPct + '%';
            if (text) text.textContent = dbPct + '% Complete \u2014 ' + dbDone + ' of ' + dbTot + ' tasks';
            log('Phase3.3', 'progress from DB — ' + dbDone + '/' + dbTot + ' (' + dbPct + '%)');
          }
        }).catch(function(e) { console.error('[AAAI ERROR][checklist.getProgress] failed |', e); });
    }
  };

  function showAIAssist(itemEl, title, description) {
    if (itemEl.querySelector('.ai-assist-panel')) return;

    var panel = document.createElement('div');
    panel.className = 'ai-assist-panel';
    panel.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    itemEl.querySelector('.checklist-item__content').appendChild(panel);

    var prompt = 'You are AfterAction AI. A veteran has a checklist task: "' + title + '". ' + (description ? 'Details: ' + description : '') + ' Explain in 2-3 short sentences: what this means, why it matters, and the first concrete step to take. Be direct and veteran-friendly. Keep it under 75 words.';

    var assistPromise = fetch(CONFIG.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
    }).then(function(r) { return r.json(); }).then(function(d) { return d.response; });

    assistPromise.then(function(response) {
      panel.innerHTML = '<p style="font-size:0.85rem;color:var(--gray-300);line-height:1.5;">' + response.replace(/\n/g, '<br>') + '</p>' +
        '<button class="ai-assist-close" onclick="this.parentElement.remove()">Dismiss</button>';
    }).catch(function() {
      panel.innerHTML = '<p style="font-size:0.85rem;color:var(--gray-500);">Could not load explanation. Try again later.</p>';
    });
  }

  // ══════════════════════════════════════════════════════
  //  EXPOSE GLOBALS
  // ══════════════════════════════════════════════════════
  window.AAAI_CONFIG = {
    model: CONFIG.model,
    apiEndpoint: CONFIG.apiEndpoint
  };

  window.AAAI_startChat = startChat;
  window.AAAI_endVoiceSession = endVoiceSession;
  window.AAAI_submitUserText = submitUserText; // Phase 33 — shared non-typed submission path

  // ── BOOT ────────────────────────────────────────────
  init();

})();



