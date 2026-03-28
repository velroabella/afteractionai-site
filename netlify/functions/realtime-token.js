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
    const requestBody = {
      session: {
        type: 'realtime',
        model: 'gpt-realtime',
        instructions: 'You are AfterAction AI. Speak clearly, concisely, and in a supportive veteran-focused tone. Keep responses short and conversational. In your opening greeting, let the veteran know they can upload supporting documents anytime — VA letters, denial letters, DD-214, medical records, legal paperwork, or anything relevant — using the upload button on screen.',
        audio: {
          output: {
            voice: 'ash'
          }
        }
      }
    };

    console.log('[realtime-token] POST https://api.openai.com/v1/realtime/client_secrets');
    console.log('[realtime-token] Body:', JSON.stringify(requestBody));

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
      body: JSON.stringify({ client_secret: secret, debug: 'CLIENT_SECRETS_V3' })
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