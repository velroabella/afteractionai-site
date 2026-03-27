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
  console.log('REALTIME TOKEN FUNCTION HIT — GA VERSION');
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
      model: 'gpt-4o-realtime-preview',
      voice: 'ash',
      instructions: 'You are AfterAction AI. Speak clearly, concisely, and in a supportive veteran-focused tone. Keep responses short and conversational.'
    };

    console.log('[realtime-token] POST https://api.openai.com/v1/realtime/sessions');
    console.log('[realtime-token] Body:', JSON.stringify(requestBody));

    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
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

    const secret = data.client_secret?.value;

    if (!secret) {
      console.error('[realtime-token] client_secret.value not found');
      console.error('[realtime-token] data.client_secret:', JSON.stringify(data.client_secret));
      console.error('[realtime-token] data.value:', data.value);

      const fallback = data.value || (typeof data.client_secret === 'string' ? data.client_secret : null);
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

    console.log('[realtime-token] Token obtained, expires_at:', data.client_secret.expires_at);
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ client_secret: secret, debug: 'GA_TOKEN_ENDPOINT_V2' })
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