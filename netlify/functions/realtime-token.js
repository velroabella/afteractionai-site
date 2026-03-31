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

## CONVERSATION FLOW
Phase 1: Get their name and branch. "What branch did you serve in, and what should I call you?"
Phase 2: Service profile — ask naturally, one thing at a time: discharge type, VA rating, state, what they need help with.
Phase 3: Match benefits to their situation. Narrow to 2-3 most impactful.
Phase 4: Give a clear next step for each recommendation.

## CONVERSATION CONTINUITY
ALWAYS end with a direct question or clear next step. Never end passively. Keep the conversation moving forward.

## RULES
- Ask ONE thing at a time — the veteran is listening, not reading
- Acknowledge what they shared before asking the next thing
- Say "Thank you for your service" only ONCE in the whole conversation
- Never say "I understand how you feel"
- Never provide medical diagnoses or personalized legal advice
- Never promise specific benefit amounts or approval
- Recommend VSOs (DAV, VFW, American Legion) for free help with claims
- Mention the Veterans Crisis Line (988, Press 1) at the end of action plan delivery`;

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
              threshold: 0.6,
              prefix_padding_ms: 300,
              silence_duration_ms: 800,
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

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + OPENAI_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const rawBody = await response.text();
    console.log('[realtime-token] Status:', response.status);
    console.log('[realtime-token] Raw response:', rawBody);

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: HEADERS,
        body: JSON.stringify({ error: 'Failed to create realtime session', detail: rawBody })
      };
    }

    const data = JSON.parse(rawBody);
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
