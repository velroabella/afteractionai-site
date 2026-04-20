/* ══════════════════════════════════════════════════════════
   AIOS — Response Intelligence Layer (RIL)
   Response Catalog  (Phase E-A)

   DATA ONLY — no functions, no logic, no side effects.
   The RIL engine (Phase E-B) reads this catalog to assemble
   every user-facing response. Nothing is generated at runtime.

   SLOT ORDER (fixed, enforced by engine):
     1  PREFIX       — acknowledgment / continuity opener
     2  ANSWER       — primary answer (1–2 sentences)
     3  REASONING    — compact "why" (1 sentence)
     4  ACTION       — what to do now
     5  MISSING_FIELD — one question for one missing fact
     6  CLOSER       — depth offer or continuity anchor

   TONE MODES:
     CRISIS         — immediate safety, lifeline first
     AT_RISK        — urgent but not crisis; action-first
     URGENT_ACTION  — time-pressured, deadline visible
     GUIDED         — first-time / confused veteran
     ADVISORY       — default professional tone
     CONFIDENT      — repeat user, deep session

   PLACEHOLDER CONVENTIONS:
     {{protected:X}}  — verbatim pass-through; engine
                        hard-fails if any modifier applied
     {{X}}            — safe non-protected interpolation
                        from the skill result envelope

   CURATION RULES (enforced at authoring time, not runtime):
     - No generic filler
     - No "as an AI" or "I think" or "I believe"
     - No emojis
     - No exclamation marks in CRISIS, AT_RISK, URGENT_ACTION
     - Every template vetted for legal / benefits precision
     - Protected-field slots filled verbatim from envelope

   SKILLS COVERED IN THIS FILE (Phase E-A):
     1. PACT_ACT        — Toxic Exposure / PACT Act
     2. VA_HEALTHCARE   — Enrollment, Priority Groups, Care Path
     3. HOUSING_SUPPORT — Home Loan, Rental Assistance, Crisis Housing

   Remaining skills (TDIU, MENTAL_HEALTH, EMPLOYMENT_TRANSITION,
   EDUCATION, FAMILY_SURVIVOR) are deferred to Phase E-A extension.
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     RESPONSE CATALOG
     ══════════════════════════════════════════════════════════ */

  var RESPONSE_CATALOG = {

    /* ┌─────────────────────────────────────────────────────┐
       │  PACT_ACT — Toxic Exposure / PACT Act Claims        │
       └─────────────────────────────────────────────────────┘ */
    PACT_ACT: {

      /* ── Slot 1: PREFIX ─────────────────────────────────
         Populated in: CRISIS, AT_RISK, GUIDED, CONFIDENT.
         Omitted in:   ADVISORY, URGENT_ACTION.             */
      PREFIX: {

        CRISIS: [
          'I hear you.',
          'You reached out — that matters.',
          'Whatever brought you here today, you are not alone right now.'
        ],

        AT_RISK: [
          "You've already been through enough. Let's focus on what's most immediate.",
          'Given what you are dealing with right now, here is the most direct path forward.',
          'Your situation sounds urgent, and there is help available right now.'
        ],

        GUIDED: [
          "Let's figure this out together.",
          "You are in the right place — here is what we know and what comes next.",
          'Toxic exposure claims can feel complicated, but we can work through this step by step.'
        ],

        CONFIDENT: [
          'Picking up from your PACT Act question, here is what applies to your situation.',
          'Based on what you have shared about your exposure history, here is what the PACT Act means for your claim.',
          'Building on your exposure history, here is the most relevant information for where you are in the process.'
        ]

      },


      /* ── Slot 2: ANSWER ─────────────────────────────────
         Primary answer. 1–2 sentences. Verbatim pass-through
         for any {{protected:X}} field in the template.
         Keyed by tone mode; drawn from exposureType result. */
      ANSWER: {

        CRISIS: [
          'The benefits questions can wait — right now, call 988 and press 1 to reach the Veterans Crisis Line.',
          'You matter more than the paperwork. Please call 988 and press 1 right now.',
          'The Veterans Crisis Line is available this moment: 988, press 1, or text 838255.'
        ],

        AT_RISK: [
          'Your {{exposureType}} exposure is covered under the PACT Act, and we can sort out the claim details once your immediate situation is stable.',
          'You have rights under the PACT Act that do not expire — but right now, the most important step is getting you stable support.',
          'The PACT Act benefits you are owed will still be there. Right now, here is the most urgent thing to do.'
        ],

        URGENT_ACTION: [
          'Your {{exposureType}} claim has a time-sensitive element — action is needed by {{protected:deadline}}.',
          'There is a pending deadline of {{protected:deadline}} that affects your PACT Act effective date — here is what to do immediately.',
          'To preserve your claim effective date, you need to file an Intent to File before {{protected:deadline}}.'
        ],

        GUIDED: [
          'The PACT Act is a 2022 law that makes it easier for veterans exposed to {{exposureType}} to get VA benefits without having to prove every link in the chain between exposure and illness.',
          'Because of your {{exposureType}} exposure, the VA is now required to presume a service connection for certain conditions — that means less burden of proof on you.',
          "Here is the short version: your {{exposureType}} exposure during service likely qualifies you for presumed conditions under the PACT Act, even if you do not have a confirmed diagnosis yet."
        ],

        ADVISORY: [
          'Based on your {{exposureType}} exposure, you may be covered under the PACT Act — which expanded presumptive eligibility for veterans with service-connected toxic exposure.',
          'Your {{exposureType}} history makes you a strong candidate for PACT Act eligibility; a formal claim is the next step to confirm service connection.',
          'The PACT Act presumes a service connection for {{exposureType}}-related conditions — meaning you do not need to prove the exposure caused your condition, only that the exposure occurred during your service.'
        ],

        CONFIDENT: [
          'Your {{exposureType}} exposure puts you in the presumptive eligibility pool — the primary question now is whether your diagnosed conditions are on the applicable presumptive list.',
          'Given your {{exposureType}} history and current rating of {{protected:vaRating}}%, the PACT Act pathway is the most direct route to expanding your service connection.',
          '{{exposureType}} is a covered exposure type under the PACT Act — your claim should reference the applicable presumptive condition list for your era and deployment location.'
        ]

      },


      /* ── Slot 3: REASONING ──────────────────────────────
         Compact "why." One sentence inline.
         Omitted in: CRISIS, AT_RISK.
         Collapsed (expandable) in: URGENT_ACTION.         */
      REASONING: {

        URGENT_ACTION: [
          'Filing an Intent to File by {{protected:deadline}} preserves your effective date even if the full claim takes longer to complete.',
          'The {{protected:deadline}} window is tied to the date your condition was first diagnosed — missing it affects retroactive pay, not eligibility itself.',
          'A claim filed after {{protected:deadline}} will still be accepted, but your back-pay calculation resets to the new filing date rather than the earlier diagnosis date.'
        ],

        GUIDED: [
          'Before the PACT Act, many veterans with {{exposureType}} exposure were denied because they could not prove the exact medical link between their exposure and their illness — that standard has now changed.',
          'The law works in your favor: if your deployment era and location match the exposure criteria, the VA must presume the connection exists without requiring a nexus letter from a doctor.',
          'A presumptive condition means the VA accepts that your illness is likely related to your service, so you are not fighting the same uphill battle veterans faced before 2022.'
        ],

        ADVISORY: [
          'The PACT Act established over 20 presumptive conditions for burn pit, Agent Orange, and other toxic exposures — your {{exposureType}} history places you within its scope.',
          'Without the PACT Act, you would need a nexus letter linking your condition directly to service; presumptive status removes that requirement for covered conditions.',
          'Veterans with {{exposureType}} exposure who were deployed in qualifying locations and eras are covered — your service record, not a medical opinion, is the primary evidence.'
        ],

        CONFIDENT: [
          'Presumptive status under the PACT Act means the evidentiary threshold for {{exposureType}}-related conditions is met by your service record alone, without a medical nexus opinion.',
          'Your {{protected:vaRating}}% rating history will factor into the combined rating calculation once PACT Act conditions are added — the effective date of your new claim preserves your retroactive entitlement.',
          'Claim bundling — filing all related PACT Act conditions simultaneously — is the most efficient path when multiple presumptive conditions may apply to your exposure history.'
        ]

      },


      /* ── Slot 4: ACTION ─────────────────────────────────
         CRISIS: exactly 1 action.
         AT_RISK: exactly 1 URGENT action.
         All others: up to 3 actions.                      */
      ACTION: {

        CRISIS: [
          'Call the Veterans Crisis Line now: dial 988 and press 1, or text 838255.',
          'Reach the Veterans Crisis Line at 988, press 1 — available 24 hours a day, every day of the year.',
          'Text 838255 to reach the Veterans Crisis Line right now — you do not need to be in immediate danger to call.'
        ],

        AT_RISK: [
          'Call the VA National Call Center for Homeless Veterans at {{protected:hotlineVAHousing}} — available 24 hours a day, 7 days a week.',
          'Contact VA.gov/homeless or call 1-877-4AID-VET to access emergency housing support alongside your PACT Act claim.',
          'Call 1-800-827-1000 and ask to flag your claim as a financial hardship case — this can accelerate processing timeline.'
        ],

        URGENT_ACTION: [
          'File an Intent to File at VA.gov/decision-reviews/file-an-appeal/intent-to-file before {{protected:deadline}} to lock in your effective date.',
          'Submit VA Form 21-0966 online at VA.gov or by calling 1-800-827-1000 before {{protected:deadline}}.',
          'Log into VA.gov now and begin a PACT Act claim — completing the Intent to File step today preserves your claim effective date.'
        ],

        GUIDED: [
          'The first step is filing VA Form {{protected:formNumber}} — you can do this online at VA.gov at no cost and, for most exposure types, there is no hard deadline to file.',
          'Visit your nearest VA Medical Center and ask specifically for a PACT Act toxic exposure screening — this creates the official record that supports your claim.',
          'A VSO (Veterans Service Organization) like the DAV, VFW, or American Legion can file your PACT Act claim for free and will walk you through every form required.'
        ],

        ADVISORY: [
          'File a PACT Act claim using VA Form {{protected:formNumber}} at VA.gov/disability/file-disability-claim-form-21-526ez.',
          'Request a PACT Act toxic exposure screening at your nearest VA facility — this documents the exposure and strengthens your claim record.',
          'Contact a VA-accredited claims agent or VSO for free help completing your PACT Act claim — they charge nothing and can significantly improve claim outcomes.'
        ],

        CONFIDENT: [
          'File VA Form {{protected:formNumber}} and list all applicable PACT Act presumptive conditions — bundling them in one submission avoids separate effective dates for each condition.',
          'Request your exposure records through the Military Exposure Records request at VA.gov to support your claim with primary documentation.',
          'If a previous claim was denied for the same conditions before the PACT Act passed, file a Supplemental Claim citing the new presumptive law as new and relevant evidence.'
        ]

      },


      /* ── Slot 5: MISSING_FIELD ──────────────────────────
         Engine picks the first field from REQUIRED_PRIORITY
         that appears in the skill envelope's unknownFields[].
         Asks exactly one question. Omitted in CRISIS/AT_RISK. */
      MISSING_FIELD: {

        REQUIRED_PRIORITY: [
          'serviceEra',
          'exposureType',
          'branch',
          'dischargeStatus'
        ],

        FIELDS: {

          serviceEra: [
            'One thing that will help me narrow this down: what era did you serve in, or do you know the approximate years of your deployment?',
            'To confirm which PACT Act provisions apply, can you share when you served — for example, post-9/11, Vietnam era, or Gulf War?',
            'Which conflict or deployment are we working with — that helps me identify the right exposure presumptions for your situation.'
          ],

          exposureType: [
            'Do you know what type of exposure you experienced — for example, burn pits, Agent Orange, water contamination at Camp Lejeune, or something else?',
            'What kind of toxic exposure are you dealing with — burn pit smoke, Agent Orange, Gulf War illness, or another type? That determines which PACT Act presumptive list applies.',
            'Can you tell me more about the exposure itself — what you were exposed to and roughly where or when? That determines which PACT Act pathway is most relevant to your claim.'
          ],

          branch: [
            'Which branch of the military did you serve in?',
            'Can you tell me your branch of service — that helps confirm deployment records and exposure eligibility.',
            'What branch did you serve with — Army, Navy, Marine Corps, Air Force, Coast Guard, or another branch?'
          ],

          dischargeStatus: [
            'Do you know the type of discharge you received? An Honorable or General discharge is typically required for most PACT Act benefits.',
            'What was your discharge characterization — this affects which VA benefits you can access through the PACT Act.',
            'Can you share your discharge status? If you are unsure, it should appear on your DD-214 (discharge papers).'
          ]

        }

      },


      /* ── Slot 6: CLOSER ─────────────────────────────────
         ADVISORY and CONFIDENT only. One sentence.
         Suppressed if Slot 5 was populated (one-question rule). */
      CLOSER: {

        ADVISORY: [
          'Want me to walk through what a PACT Act claim filing looks like, step by step?',
          'If you have a diagnosis, I can help you map it to the specific presumptive condition list for your exposure type and era.',
          'Let me know if you want to look at whether any prior denials are worth reopening under the new PACT Act presumptive standards.'
        ],

        CONFIDENT: [
          'If you want to run through the Supplemental Claim process or the appeals path for a prior denial, I can take you through that next.',
          'Ready to look at claim bundling strategy — combining your PACT Act conditions with your existing {{protected:vaRating}}% rated conditions in one submission?',
          'I can also walk through how the new PACT Act conditions will interact with your existing rating if that calculation would be useful.'
        ]

      }

    },


    /* ┌─────────────────────────────────────────────────────┐
       │  VA_HEALTHCARE — Enrollment, Priority Group, Care   │
       └─────────────────────────────────────────────────────┘ */
    VA_HEALTHCARE: {

      /* ── Slot 1: PREFIX ─────────────────────────────────  */
      PREFIX: {

        CRISIS: [
          'I hear you.',
          'You reached out — that takes something, and you are not alone.',
          'Whatever brought you here right now, there is support available this moment.'
        ],

        AT_RISK: [
          'Getting you connected to VA care right now is the priority — we can sort out enrollment details as we go.',
          'Your health comes first. Here is the fastest path to VA care given what you are facing.',
          'There is a direct route to VA healthcare for veterans in urgent need — let us start there.'
        ],

        GUIDED: [
          "Let's get you into the VA healthcare system — it is more straightforward than it sounds.",
          'VA healthcare eligibility can feel confusing, but your service record likely qualifies you for more than you realize.',
          'You are asking the right question. Here is what you need to know to get started with VA care.'
        ],

        CONFIDENT: [
          'Picking up from your VA healthcare question —',
          'Continuing on your enrollment and care access —',
          'Building on your priority group and care path —'
        ]

      },


      /* ── Slot 2: ANSWER ─────────────────────────────────  */
      ANSWER: {

        CRISIS: [
          'The Veterans Crisis Line is available right now — call 988 and press 1.',
          'You can reach the Veterans Crisis Line at any hour by calling 988 and pressing 1, or by texting 838255.',
          'Right now, the most important number to call is 988, then press 1 — it connects you directly to a trained Veterans Crisis Line counselor.'
        ],

        AT_RISK: [
          'You can access VA emergency care immediately, even before full enrollment is complete — no advance paperwork is required in a genuine medical emergency.',
          'Your service history makes you eligible for VA healthcare, and veterans in financial hardship are prioritized in several enrollment categories.',
          'VA healthcare does not require upfront payment in emergency situations — the priority right now is getting you the care you need, not processing forms.'
        ],

        URGENT_ACTION: [
          'Your enrollment window or eligibility period requires action by {{protected:deadline}} — here is what to do immediately.',
          'There is a limited enrollment window in your case that closes on {{protected:deadline}} — submitting Form 10-10EZ before that date is the critical step.',
          'To preserve your Priority Group {{protected:priorityGroup}} status, enrollment must be confirmed by {{protected:deadline}}.'
        ],

        GUIDED: [
          'VA healthcare is a health system run by the Department of Veterans Affairs — if you qualify, you get a primary care team, specialist access, and in many cases mental health care, all through one enrollment.',
          'Most veterans who served on active duty for at least 24 months and were honorably discharged can enroll in VA healthcare at no cost or very low cost.',
          'The VA healthcare system works differently than private insurance — instead of paying monthly premiums, you enroll once and your priority group determines what, if anything, you pay per visit.'
        ],

        ADVISORY: [
          'Based on your service history, you are likely eligible to enroll in VA healthcare — your priority group will determine your copay level and care access.',
          'Your discharge status and service record indicate VA healthcare eligibility; enrollment through Form 10-10EZ is the starting point.',
          'You appear eligible for VA healthcare based on what you have shared — your priority group will be {{protected:priorityGroup}}, which determines your cost-sharing structure.'
        ],

        CONFIDENT: [
          'Your current Priority Group of {{protected:priorityGroup}} places you on the {{carePath}} care track — that means {{carePath}} access with the associated copay schedule.',
          'At {{protected:vaRating}}%, your service-connected rating puts you in Priority Group {{protected:priorityGroup}}, which covers all service-connected care at no cost to you.',
          'Based on your rating and service era, you are enrolled at Priority Group {{protected:priorityGroup}} — your care path is {{carePath}}, which includes the specific care access outlined in your next steps.'
        ]

      },


      /* ── Slot 3: REASONING ──────────────────────────────  */
      REASONING: {

        URGENT_ACTION: [
          'Form 10-10EZ can be submitted online, by mail, or in person — the online path at VA.gov is fastest and generates immediate confirmation of receipt.',
          'Priority Group assignment is retroactive to your enrollment date, not your first appointment date — filing now preserves your earliest possible effective date.',
          'If your application is time-sensitive due to income or employment changes, note that in the application — the VA has provisions for financial hardship processing.'
        ],

        GUIDED: [
          'Priority groups run from 1 to 8 — Group 1 veterans pay nothing and receive the fastest access; Group 8 veterans may pay modest copays depending on income. Most veterans land in Groups 1 through 5.',
          'Your discharge status is the first eligibility filter — an Honorable or General discharge is required for VA healthcare. After that, your rating and service era determine your priority group assignment.',
          'Community Care is available when a VA facility cannot provide timely or geographically accessible care — it allows you to see a non-VA provider with VA covering the cost.'
        ],

        ADVISORY: [
          'Priority groups are assigned based on service-connected disability rating, income, and combat veteran status — they determine your copay level, not whether you can access care at all.',
          'Veterans with service-connected disabilities generally receive priority enrollment in VA healthcare, and your eligibility tier determines your cost-sharing.',
          'Even if your income is above the VA threshold, a service-connected disability rating typically overrides the income-based limitation and places you in the priority enrollment groups.'
        ],

        CONFIDENT: [
          'At {{protected:vaRating}}%, all care directly related to your service-connected conditions is covered at zero cost regardless of income — non-service-connected care follows the standard Priority Group {{protected:priorityGroup}} copay schedule.',
          'Community Care eligibility activates when you live more than 30 minutes from a VA facility or the VA cannot schedule within the access standard — these are reviewable criteria, not discretionary decisions.',
          'Your symptom history from this session — {{sessionSymptomContext}} — supports enrolling in the appropriate specialty care track from the start, rather than beginning with general primary care intake.'
        ]

      },


      /* ── Slot 4: ACTION ─────────────────────────────────  */
      ACTION: {

        CRISIS: [
          'You can also connect with a Veterans Crisis Line counselor by chat at VeteransCrisisLine.net — available 24 hours a day if calling is not possible.',
          'Go to your nearest VA emergency department — VA facilities are required to provide emergency care regardless of your enrollment status.',
          'Send an urgent message to your VA care team through My HealtheVet at myhealth.va.gov if you have an existing VA care relationship and need immediate clinical contact.'
        ],

        AT_RISK: [
          'Call 1-877-4AID-VET (1-877-424-3838) — the VA National Call Center for Homeless Veterans — and let them know you need healthcare and housing support simultaneously.',
          'Walk into any VA Medical Center and identify yourself as a veteran in need of urgent care — emergency services are available regardless of enrollment status.',
          'Ask to speak with a VA social worker at your nearest facility — they can facilitate emergency enrollment and connect you to healthcare and housing support at the same time.'
        ],

        URGENT_ACTION: [
          'Complete VA Form 10-10EZ at VA.gov/health-care/apply/application/introduction before {{protected:deadline}}.',
          'Call the VA Health Benefits Hotline at 1-877-222-8387 today to begin enrollment by phone before {{protected:deadline}}.',
          'Walk into your nearest VA enrollment office with your DD-214 and a photo ID — request same-day enrollment processing given your {{protected:deadline}} window.'
        ],

        GUIDED: [
          'Start at VA.gov/health-care/apply — the online Form 10-10EZ walks you through every field and explains what each section is asking for.',
          'Bring three things when you apply: your DD-214 (discharge paperwork), a photo ID, and your Social Security number — that is all you need to get the process started.',
          'If filling out the form online feels like too much right now, call 1-877-222-8387 and a VA specialist will complete the application with you over the phone at no cost.'
        ],

        ADVISORY: [
          'Enroll in VA healthcare by completing Form 10-10EZ online at VA.gov — it takes roughly 20 minutes and you can save your progress mid-application.',
          'Locate your nearest VA Medical Center at VA.gov/find-locations and call to schedule an enrollment appointment or new patient intake.',
          'If you have a service-connected disability rating, call the VA Health Benefits Hotline at 1-877-222-8387 to confirm your priority group assignment.'
        ],

        CONFIDENT: [
          'If you have not yet linked your My HealtheVet account to your VA.gov profile, doing so gives you online appointment scheduling and secure direct messaging with your care team.',
          'Request a Community Care referral from your VA primary care provider if you are experiencing wait times beyond 28 days for specialty care — that is the access standard that triggers eligibility.',
          'Review your current Priority Group assignment in your VA.gov profile and flag any discrepancy with your current disability rating — rating increases sometimes require a manual priority group update.'
        ]

      },


      /* ── Slot 5: MISSING_FIELD ──────────────────────────  */
      MISSING_FIELD: {

        REQUIRED_PRIORITY: [
          'dischargeStatus',
          'serviceEra',
          'vaRating',
          'income'
        ],

        FIELDS: {

          dischargeStatus: [
            'What type of discharge did you receive? Honorable and General discharges qualify for VA healthcare — other discharge types have a review process available.',
            'Do you know your discharge characterization? It is listed on your DD-214 and is the first eligibility check for VA healthcare enrollment.',
            'Was your discharge Honorable, General, or another type? That determines the enrollment path we would take from here.'
          ],

          serviceEra: [
            'Which era did you serve in — post-9/11, Gulf War, Vietnam, or another period? Some service eras carry automatic eligibility extensions for VA healthcare.',
            'Can you tell me roughly when you served on active duty? Combat veterans from certain eras receive a 10-year enhanced eligibility window for VA healthcare.',
            'Did your service include any combat deployments? That affects your priority group and the length of your enrollment eligibility window.'
          ],

          vaRating: [
            'Do you currently have a VA disability rating? If so, what percentage — even a 0% service-connected rating affects your priority group assignment.',
            'Have you ever filed a disability claim with the VA, and if so, do you know your current rating percentage?',
            'Your VA rating — if you have one — directly determines your priority group and whether your care is covered at no cost. Do you know that number?'
          ],

          income: [
            'For veterans without a service-connected rating, VA healthcare eligibility is also checked against a household income threshold — do you have a rough sense of your annual household income?',
            'Some VA healthcare categories are income-based. Does your annual household income fall below roughly $40,000, or is it above that range?',
            'If you do not have a VA disability rating, income is one factor in priority group assignment — are you comfortable sharing your general income range so I can identify the right enrollment path?'
          ]

        }

      },


      /* ── Slot 6: CLOSER ─────────────────────────────────  */
      CLOSER: {

        ADVISORY: [
          'Want me to walk through what your first VA appointment will look like, or explain how Community Care works if there is no nearby VA facility?',
          'I can also help you understand what the Priority Group system means for your specific copay costs if you want to dig into that.',
          'If you have specific conditions you want treated through the VA, I can help you identify whether they fall under your current enrollment status and priority group.'
        ],

        CONFIDENT: [
          'If you want to review your Community Care eligibility or contest a Priority Group assignment, I can walk through that process.',
          'Ready to look at how your {{protected:vaRating}}% rating interacts with your copay structure under Priority Group {{protected:priorityGroup}}?',
          'I can also help you navigate My HealtheVet setup or sort out a specialist referral request if that would be useful.'
        ]

      }

    },


    /* ┌─────────────────────────────────────────────────────┐
       │  HOUSING_SUPPORT — Home Loan, Rental, Crisis        │
       └─────────────────────────────────────────────────────┘ */
    HOUSING_SUPPORT: {

      /* ── Slot 1: PREFIX ─────────────────────────────────  */
      PREFIX: {

        CRISIS: [
          'I hear you.',
          'You reached out — that matters, and you are not alone right now.',
          'Whatever brought you here today, there is support available this moment.'
        ],

        AT_RISK: [
          'Your housing situation is urgent and there are people whose job it is to help veterans facing what you are facing right now.',
          'Given what you shared, the priority is connecting you to immediate support — benefits paperwork comes second.',
          'There is help available for veterans facing what you are facing. Here is where to start right now.'
        ],

        GUIDED: [
          "Housing questions for veterans cover a lot of ground — let's figure out which path fits your situation.",
          'Whether you need emergency help, rental support, or a home loan, there is a VA program designed for it.',
          "Let's work through this together and figure out the right type of housing support for where you are right now."
        ],

        CONFIDENT: [
          'Picking up from your housing question —',
          'Continuing on your VA home loan or housing support path —',
          'Building on your housing situation and eligibility —'
        ]

      },


      /* ── Slot 2: ANSWER ─────────────────────────────────  */
      ANSWER: {

        CRISIS: [
          'You are not alone in this, and there is support available right now — please call 988 and press 1.',
          'The Veterans Crisis Line is available 24 hours a day: call 988, press 1.',
          'Whatever you are carrying right now, you do not have to handle it alone — 988, press 1, is available this moment.'
        ],

        AT_RISK: [
          'You have immediate rights as a veteran in a housing crisis — there are VA programs specifically designed to help veterans in exactly this situation, and they are not waitlist programs.',
          'Veterans facing homelessness or imminent housing loss have access to HUD-VASH vouchers, SSVF emergency assistance, and VA homeless prevention programs — here is the fastest path in.',
          'Housing instability does not disqualify you from VA services. In fact, it prioritizes you for several programs that have faster intake timelines than standard VA processes.'
        ],

        URGENT_ACTION: [
          'Your housing situation requires action before {{protected:deadline}} to prevent escalation — here is the single most important step right now.',
          'There is a {{protected:deadline}} deadline on your housing situation — missing it significantly changes your available options.',
          'To prevent eviction or foreclosure, one specific action needs to happen before {{protected:deadline}}.'
        ],

        GUIDED: [
          'The VA offers two main types of housing help: the VA Home Loan for buying or refinancing a home, and emergency or rental assistance programs for veterans facing housing instability. Based on what you shared, your path is {{housingTrack}}.',
          'If you are trying to stay housed or get housed quickly, the VA has programs specifically for that — they are separate from the home loan program and designed for veterans under immediate housing pressure.',
          'A VA Home Loan lets qualified veterans buy a home with no down payment. Rental and crisis assistance programs are a different track entirely, built for veterans facing immediate need.'
        ],

        ADVISORY: [
          'Based on what you have shared, your situation falls into the {{housingTrack}} path — here is what that means for your options and next steps.',
          'Your service history and current status indicate eligibility for {{housingTrack}} assistance through the VA, with specifics depending on a few additional details.',
          'The VA housing system has two distinct tracks — home loan assistance and rental or crisis housing support — and your situation points toward {{housingTrack}}.'
        ],

        CONFIDENT: [
          'Your Certificate of Eligibility (COE) status and {{protected:vaRating}}% rating confirm your {{housingTrack}} eligibility — the next step is lender selection or direct VA program contact depending on your track.',
          'At {{protected:vaRating}}%, your VA loan funding fee is reduced — and if your service-connected disability is rated at 10% or higher, you may be fully exempt from the funding fee.',
          'Your housing track is {{housingTrack}}, which based on your profile and goals puts you on the {{assistanceType}} path — here is the specific process from this point.'
        ]

      },


      /* ── Slot 3: REASONING ──────────────────────────────  */
      REASONING: {

        URGENT_ACTION: [
          'Contacting the VA homeless veterans hotline immediately flags your case for priority processing across HUD-VASH, SSVF, and GPD programs.',
          'An eviction notice does not end your options — VA programs can intervene in the eviction process if contacted before the lock-out date of {{protected:deadline}}.',
          'SSVF emergency funds can sometimes be disbursed within 48 to 72 hours when there is a documented housing crisis — the key is initiating the intake process immediately.'
        ],

        GUIDED: [
          'You do not need perfect credit to get a VA home loan — lenders can be more flexible with VA-backed loans than conventional mortgages because the VA is guaranteeing a portion of the risk.',
          'SSVF (Supportive Services for Veteran Families) funds are distributed through local nonprofit organizations, not the VA directly — they can cover rent, utilities, and security deposits.',
          'If you are behind on rent or at risk of eviction, timing matters — many VA housing intake processes take 24 to 72 hours, not weeks, when a crisis is documented.'
        ],

        ADVISORY: [
          'The VA Home Loan program offers no-down-payment financing through approved private lenders, with the VA guaranteeing a portion of the loan — the VA is not the lender itself.',
          'SSVF (Supportive Services for Veteran Families) is a grant-based program, not a loan — it provides emergency financial assistance to prevent veteran homelessness, with no repayment required.',
          'HUD-VASH combines a housing voucher with ongoing case management support — it is for veterans experiencing homelessness and has no minimum credit or asset threshold for initial entry.'
        ],

        CONFIDENT: [
          'Your VA loan entitlement is based on your service duration and discharge status — at full entitlement, there is no county loan limit for a VA-backed purchase loan.',
          'The funding fee exemption at {{protected:vaRating}}% or higher is automatic once your service-connected rating is confirmed in VA systems — it does not require a separate application or waiver form.',
          'SSVF has a rapid rehousing track for veterans who are currently homeless and a homelessness prevention track for veterans at imminent risk — your current situation determines which track intake process to begin.'
        ]

      },


      /* ── Slot 4: ACTION ─────────────────────────────────  */
      ACTION: {

        CRISIS: [
          'Call the Veterans Crisis Line now: dial 988 and press 1.',
          'Text 838255 right now — a Veterans Crisis Line counselor will respond.',
          'Go to VeteransCrisisLine.net to connect with a counselor immediately.'
        ],

        AT_RISK: [
          'Call the VA National Call Center for Homeless Veterans at 1-877-4AID-VET (1-877-424-3838) right now — available 24 hours a day, 7 days a week.',
          'Walk into your nearest VA Medical Center and ask to speak with a social worker — they can start HUD-VASH or SSVF intake the same day, alongside any healthcare needs.',
          'Reach out to a local SSVF provider at VA.gov/homeless/ssvf — they can provide emergency rent or utility assistance faster than going through the VA directly.'
        ],

        URGENT_ACTION: [
          'Call 1-877-4AID-VET (1-877-424-3838) immediately and tell them you have a deadline of {{protected:deadline}} — this puts your case into urgent status.',
          'Contact your landlord or mortgage servicer today and specifically ask about a VA-connected forbearance or payment delay — servicers are often required to discuss alternatives before proceeding to eviction or foreclosure.',
          'Go to VA.gov/homeless and use the facility locator to find the nearest SSVF provider — bring any eviction or foreclosure paperwork you have received.'
        ],

        GUIDED: [
          'For a VA Home Loan, the first step is getting your Certificate of Eligibility — you can request it online at VA.gov/housing-assistance/home-loans/how-to-apply, and your lender can often pull it automatically.',
          'For emergency housing help, call 1-877-4AID-VET right now — that number connects you to the VA national homeless veterans hotline, which coordinates SSVF and HUD-VASH access.',
          'Have your DD-214 and a photo ID ready — those two documents are what most VA housing programs need to start your intake.'
        ],

        ADVISORY: [
          'Start your Certificate of Eligibility (COE) request at VA.gov/housing-assistance/home-loans/how-to-apply — lenders can also pull this directly when you are ready to move forward.',
          'Contact a HUD-approved housing counselor or a VA-accredited lender to discuss your home loan options — VA.gov/housing-assistance/home-loans/lenders maintains the approved lender list.',
          'If you need rental or emergency assistance, find your local SSVF provider at VA.gov/homeless/ssvf and contact them directly — they administer the grants, not the VA itself.'
        ],

        CONFIDENT: [
          'Request your COE through VA.gov — if your loan entitlement has been used previously, confirm your remaining or restored entitlement before engaging a lender on a new purchase.',
          'If you are pursuing a VA IRRRL (Interest Rate Reduction Refinance Loan), confirm with your current servicer that no other refinance has occurred in the last 210 days, as that is the seasoning requirement.',
          'For HUD-VASH, the voucher is issued through your local Public Housing Authority in coordination with the VA — confirm your local PHA has open vouchers before beginning intake, as availability varies significantly by region.'
        ]

      },


      /* ── Slot 5: MISSING_FIELD ──────────────────────────  */
      MISSING_FIELD: {

        REQUIRED_PRIORITY: [
          'housingStatus',
          'dischargeStatus',
          'vaRating',
          'income',
          'assistanceType'
        ],

        FIELDS: {

          assistanceType: [
            'What kind of housing help are you looking for — a VA home loan, emergency rental assistance, or help finding a place to stay right now?',
            'Are you trying to purchase a home, get help with rent or utilities, or access crisis housing support? That determines which VA program is the right fit.',
            'Is this about buying or refinancing a home, or do you need rental assistance or emergency housing support? The VA has different programs for each, and knowing which applies helps me point you to the right one.'
          ],

          housingStatus: [
            'To point you to the right program: are you looking to buy a home, trying to prevent eviction or housing loss, or do you need somewhere to stay right now?',
            'Is this a home loan question, a rental assistance question, or something more urgent — like you need immediate housing support?',
            'Are you currently housed and exploring options, at risk of losing your housing, or currently without a stable place to stay?'
          ],

          dischargeStatus: [
            'What type of discharge did you receive? VA home loans and most housing programs require an Honorable or General discharge.',
            'Do you know your discharge characterization? That is the first eligibility check for VA housing programs — it should be on your DD-214.',
            'Was your service discharge Honorable, General, or something else? If you are unsure, that information is on your DD-214 under Box 24.'
          ],

          vaRating: [
            'Do you have a VA disability rating? A rating of 10% or higher may exempt you entirely from the VA loan funding fee.',
            'What is your current VA disability rating, if you have one? That number affects your funding fee, your housing program priority, and several other factors.',
            'Have you received a VA disability rating? Even a lower rating can have a meaningful impact on your VA loan costs and housing benefit eligibility.'
          ],

          income: [
            'For rental assistance and some crisis housing programs, income is a factor in eligibility — do you have a general sense of your annual household income?',
            'Some VA housing assistance programs are income-adjusted. Is your annual household income roughly above or below $30,000?',
            'Is income a consideration right now? Some programs like SSVF prioritize veterans below certain income thresholds — knowing your range helps me identify the right intake path.'
          ]

        }

      },


      /* ── Slot 6: CLOSER ─────────────────────────────────  */
      CLOSER: {

        ADVISORY: [
          'Want me to walk through the VA home loan process from Certificate of Eligibility to closing, or dig deeper into the rental and crisis assistance options?',
          'If you want to look at specific loan limits, funding fees, or refinancing options for your situation, I can take you through those details.',
          'I can also help you understand how SSVF and HUD-VASH work in practice if you need immediate or transitional housing support rather than a purchase loan.'
        ],

        CONFIDENT: [
          'If you want to walk through entitlement restoration after a previous VA loan, or review the IRRRL refinance path, I can take you through those specifics.',
          'Ready to review your funding fee exemption status based on your {{protected:vaRating}}% rating, or look at how your COE and entitlement interact with a second VA loan?',
          'I can also help you navigate the Public Housing Authority coordination process for HUD-VASH if the voucher path is where you are headed.'
        ]

      }

    }

  };


  /* ── Expose on window.AIOS namespace ────────────────────
     Engine reads: window.AIOS.ResponseCatalog
     Feature flag: window.AIOS.RIL_ENABLED (set by E-C)   */
  window.AIOS            = window.AIOS || {};
  window.AIOS.ResponseCatalog = RESPONSE_CATALOG;

}());
