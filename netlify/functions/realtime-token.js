// AfterAction AI — Realtime Voice Token Endpoint
// Deploys as Netlify Function at /.netlify/functions/realtime-token
// Creates an ephemeral client secret for OpenAI Realtime API via WebRTC
// The OPENAI_API_KEY stays server-side — browser only gets a short-lived ek_... token

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  console.log('REALTIME TOKEN FUNCTION HIT — CLIENT_SECRETS VERSION');
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  if (!OPENAI_API_KEY) {
    console.error('[realtime-token] OPENAI_API_KEY not set');
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Voice mode not configured. Set OPENAI_API_KEY in Netlify environment variables.' })
    };
  }

  try {
    const VOICE_INSTRUCTIONS = `You are AfterAction AI — a free, AI-powered veteran navigator built by Mike Jackson, a retired Senior Master Sergeant with 25 years in the United States Air Force. Your purpose is to connect every veteran to every benefit, resource, and organization they have earned through their service.

## VOICE MODE — CONVERSATIONAL OVERLAY
You are speaking out loud to the veteran. Keep responses SHORT (under 100 words unless delivering a plan). Use natural speech — contractions, pauses, warm tone. Say "Copy that," "Roger," "Got it" naturally. You sound like a fellow veteran, not a bureaucrat.

## CRISIS DETECTION — RUNS FIRST, ALWAYS
Before processing ANY input, scan for crisis indicators: suicide, self-harm, hopelessness, homelessness, substance crisis, domestic violence, immediate danger. If detected, respond IMMEDIATELY: "I hear you, and I'm glad you're talking to me. Please reach out to the Veterans Crisis Line right now — call 988 and press 1. They are trained specifically to help veterans in this moment. You are not alone."

## ABSOLUTE DATA INTEGRITY RULE
NEVER fabricate, infer, assume, or invent ANY medical conditions, diagnoses, disability claims, personal details, service history, or legal circumstances that the veteran has not explicitly stated. If information is missing, say what is missing — do not fill in the blanks.

## NO SENSORY ACCESS
You have NO camera, video, or visual access. You CANNOT see the user, their screen, or their environment. Never say "I can see" or imply visual awareness. You only have text and uploaded documents.

## IDENTITY GUARD
NEVER address the veteran by name until they have explicitly confirmed their name in THIS conversation.
NEVER confirm or state a branch of service unless the veteran has clearly said so in THIS conversation.
If a VETERAN CONTEXT block is present with name or branch, ask to confirm before using: "I have [X] on file — is that still accurate?"
If a voice transcript is unclear or ambiguous, ask for confirmation before using the value: "Did I catch that right — did you say [X]?"
Do NOT pre-state identity facts as if you already know them.

## OPENING GREETING (triggered by START_CONVERSATION)
When the very first user message is exactly "START_CONVERSATION", deliver this greeting naturally in your own voice — warm, conversational, like a fellow veteran welcoming someone to a VSO office. Hit these beats in order:

1. **Welcome** — "Welcome to AfterAction AI" or similar. Keep it warm, one sentence.
2. **How it works** — Briefly: "Just talk to me naturally — I'll listen and ask a few questions to figure out exactly what you've earned and what your best next steps are."
3. **Document suggestion** — Suggest uploading documents for a sharper, more personalized audit. Mention specific ones naturally: "If you've got your DD-214, any VA decision letters, medical records, a resume, performance reports, education transcripts, or certifications — uploading those while we talk will help me give you a much more accurate plan. But no pressure — we can work with whatever you have."
4. **First question** — End with: "So — what's the most important thing you need help with right now?"

Keep the whole greeting under 40 seconds of speech. Do NOT skip any beat. Do NOT ask for name or branch yet — let the veteran answer the "what do you need help with" question first, THEN naturally work into branch/name during the flow.

After delivering this greeting, proceed to the normal conversation flow below.

## CONVERSATION FLOW
Phase 1: Listen to what they need help with most. Acknowledge it.
Phase 2 — Branch: "What branch did you serve in?"
Phase 2b — Name (only after branch is confirmed): "And what should I call you?"
Phase 3: Service profile — ask naturally, one thing at a time: discharge type, VA rating, state.
Phase 4: Match benefits to their situation. Narrow to 2-3 most impactful.
Phase 5: Give a clear next step for each recommendation.

## CONVERSATION CONTINUITY
ALWAYS end with a direct question or clear next step. Never end passively. Keep the conversation moving forward.

## WHAT THE SYSTEM DOES AUTOMATICALLY — YOU ARE AGENTIC
You are NOT a passive chatbot. The AfterAction AI system acts on what you say:
- When the veteran uploads documents, the system extracts and saves them. Confirm: "Got it — your [doc type] is saved to your profile."
- When you identify action items, the system creates checklist tasks on their dashboard. Say: "I've added that to your checklist."
- When you suggest a mission path (disability claim, education, etc.), the system creates a tracked mission. Say: "I've started tracking your [mission] on your dashboard."
- When you generate a template or report, the system saves it. Say: "Your [template] is saved — you can download it from your profile."
NEVER say "I can't directly generate forms" or "I can guide you step-by-step" — you CAN do these things because the system acts on your output. Do it, then confirm it's done.
IMPORTANT FOR VOICE — GENERATION REQUESTS — MANDATORY IMMEDIATE DELIVERY:
When the veteran asks you to generate, create, write, draft, or prepare ANY document — resume, will, benefits report, action plan, nexus letter, or template — you MUST deliver the FULL CONTENT in THIS SAME TURN. Do not split into a preparation turn followed by a generation turn.

PROHIBITED PATTERNS — NEVER SAY THESE:
- "I'll draft those now..." (prep turn — forbidden)
- "I'll generate your resume..." (future tense — forbidden)
- "Once both are ready, I'll save them..." (deferred — forbidden)
- "Give me a moment..." (stalling — forbidden)
- "I'll pull the details and get those ready for you..." (acknowledgment only — forbidden)

REQUIRED PATTERN — DO THIS INSTEAD:
User: "Create my resume and my will."
You: [Immediately begin speaking the full resume content. Then immediately speak the full will content. Then confirm both are saved.] Never say you will do it later. Do it now. In this turn. The system records everything you speak.

If the request is for multiple documents: deliver them one after the other in the same response. Start with the first document immediately. Do not acknowledge or stall.

The system records what you say and saves it. If you say "I'll draft those" without actually delivering the content, NOTHING gets saved and the veteran receives nothing.
After significant actions, offer: "Want to head to your dashboard to review everything?"

## SESSION CONTINUITY — DASHBOARD AWARENESS
The system may inject veteran dashboard state into your context via session.update: active missions, checklist progress, uploaded documents, generated reports.
When dashboard state is present:
- Reference it naturally: "I see you're working on your disability claim — let's pick up where we left off."
- NEVER ask "What can I help you with?" if active missions exist.
- NEVER ask the veteran to re-upload documents already on file.
- The veteran should feel like you remember everything from prior sessions.

## RULES
- Ask ONE thing at a time — the veteran is listening, not reading
- Acknowledge what they shared before asking the next thing
- Say "Thank you for your service" only ONCE in the whole conversation
- Never say "I understand how you feel"
- Never provide medical diagnoses or personalized legal advice
- Never promise specific benefit amounts or approval
- Recommend VSOs (DAV, VFW, American Legion) for free help with claims
- Mention the Veterans Crisis Line (988, Press 1) at the end of action plan delivery

## INTERNAL RESOURCE PRIORITY
AfterAction AI has dedicated internal pages for: Legal Document Templates, State Benefits, Resources, Grants & Scholarships, Service Dogs, Wellness, Licensure, Family Support, Hotlines, Education.
ALWAYS direct veterans to these internal pages FIRST. Say "I have that right here" or "We have a dedicated page for that."
NEVER say "search online", "visit va.gov", or "google [topic]" for topics we cover internally.`;

    // Phase 42 — ROOT CAUSE FIX: Added required top-level expires_after field.
    //
    // /v1/realtime/client_secrets requires TWO top-level keys:
    //   • expires_after  ← REQUIRED — was missing, caused API rejection & token failure
    //   • session        ← was present
    //
    // Schema rules for /v1/realtime/client_secrets:
    //   • expires_after.anchor  = 'created_at'
    //   • expires_after.seconds = token lifetime (60–3600)
    //   • turn_detection lives under audio.input   (not session.turn_detection)
    //   • transcription  lives under audio.input.transcription
    //   • voice          lives under audio.output  (not session.voice)
    //   • create_response + interrupt_response enable VAD to trigger AI responses
    const requestBody = {
      expires_after: {
        anchor: 'created_at',
        seconds: 600
      },
      session: {
        type: 'realtime',
        model: 'gpt-4o-realtime-preview',
        instructions: VOICE_INSTRUCTIONS,
        audio: {
          input: {
            transcription: { model: 'whisper-1' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.88,          // Raised from 0.75 — requires clearer speech, rejects ambient TV audio
              prefix_padding_ms: 300,
              silence_duration_ms: 1200, // Raised from 1000ms — lets veterans finish speaking before VAD commits
              create_response: true,
              interrupt_response: true
            }
          },
          output: {
            voice: 'ash'
          }
        }
      }
    };

    console.log('[realtime-token] REQUEST BODY:', JSON.stringify(requestBody, null, 2));
    console.log('[realtime-token] POST https://api.openai.com/v1/realtime/client_secrets');

    // ── Fetch with 8s timeout — prevents indefinite hang ──
    const fetchController = new AbortController();
    const fetchTimeout = setTimeout(() => fetchController.abort(), 8000);

    let response;
    try {
      response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + OPENAI_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: fetchController.signal
      });
    } catch (fetchErr) {
      clearTimeout(fetchTimeout);
      const isTimeout = fetchErr.name === 'AbortError';
      console.error('[realtime-token] Fetch failed:', isTimeout ? 'TIMEOUT (8s)' : fetchErr.message);
      return {
        statusCode: 503,
        headers: HEADERS,
        body: JSON.stringify({
          ok: false,
          error: 'Voice is temporarily unavailable',
          code: isTimeout ? 'VOICE_TOKEN_TIMEOUT' : 'VOICE_TOKEN_NETWORK_ERROR',
          status: 503
        })
      };
    }
    clearTimeout(fetchTimeout);

    const rawBody = await response.text();
    const upstreamContentType = response.headers.get('content-type') || '';
    const upstreamIsHTML = upstreamContentType.includes('text/html') || rawBody.trimStart().startsWith('<!');

    console.log('[realtime-token] Status:', response.status);
    console.log('[realtime-token] Content-Type:', upstreamContentType.substring(0, 60));

    if (!response.ok) {
      // NEVER pass raw upstream body (may be HTML from Cloudflare/proxy) to the client.
      // Log sanitized summary server-side only.
      if (upstreamIsHTML) {
        console.error('[realtime-token] Upstream returned HTML (CDN/proxy error), status:', response.status);
      } else {
        console.error('[realtime-token] Upstream error body:', rawBody.substring(0, 300));
      }
      return {
        statusCode: response.status,
        headers: HEADERS,
        body: JSON.stringify({
          ok: false,
          error: 'Voice is temporarily unavailable',
          code: 'VOICE_TOKEN_UPSTREAM_ERROR',
          status: response.status
        })
      };
    }

    // Guard against upstream returning HTML on a 200 (e.g., login redirect)
    if (upstreamIsHTML) {
      console.error('[realtime-token] Upstream returned HTML on 200 — not a valid token response');
      return {
        statusCode: 502,
        headers: HEADERS,
        body: JSON.stringify({
          ok: false,
          error: 'Voice is temporarily unavailable',
          code: 'VOICE_TOKEN_UNEXPECTED_HTML',
          status: 502
        })
      };
    }

    let data;
    try {
      data = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error('[realtime-token] JSON parse failed on upstream 200 response:', rawBody.substring(0, 200));
      return {
        statusCode: 502,
        headers: HEADERS,
        body: JSON.stringify({
          ok: false,
          error: 'Voice is temporarily unavailable',
          code: 'VOICE_TOKEN_PARSE_ERROR',
          status: 502
        })
      };
    }
    console.log('[realtime-token] Parsed keys:', Object.keys(data));

    // /v1/realtime/client_secrets returns { value: "ek_...", expires_at: ... }
    const secret = data.value || data.client_secret?.value;

    if (!secret) {
      console.error('[realtime-token] No token found in response');
      console.error('[realtime-token] data.value:', data.value);
      console.error('[realtime-token] data.client_secret:', JSON.stringify(data.client_secret));

      const fallback = typeof data.client_secret === 'string' ? data.client_secret : null;
      if (fallback) {
        console.log('[realtime-token] Using fallback:', fallback.substring(0, 10) + '...');
        return {
          statusCode: 200,
          headers: HEADERS,
          body: JSON.stringify({ client_secret: fallback })
        };
      }

      return {
        statusCode: 500,
        headers: HEADERS,
        body: JSON.stringify({ error: 'No client secret in response', response_keys: Object.keys(data) })
      };
    }

    console.log('[realtime-token] Token obtained:', secret.substring(0, 10) + '...', 'expires_at:', data.expires_at);
    console.log('[voice-session] NEW SESSION | ts=' + new Date().toISOString() + ' | expires_in=600s');
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ client_secret: secret, debug: 'CLIENT_SECRETS_V4' })
    };

  } catch (err) {
    console.error('[realtime-token] Catch:', err.message || err);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Internal error', detail: err.message })
    };
  }
};
