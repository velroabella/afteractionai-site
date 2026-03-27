// AfterAction AI — Signed URL Generator
// Deploys as Netlify Function at /.netlify/functions/signed-url
// Generates short-lived signed URLs for private Supabase storage access
// NEVER exposes raw file paths — all access goes through this endpoint

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // Service role key (server-side only)

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Signed URL expiration: 10 minutes (600 seconds)
const SIGNED_URL_EXPIRY_SECONDS = 600;

// Allowed storage buckets
const ALLOWED_BUCKETS = ['user_uploads'];

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // ── 1. Verify required environment variables ──────────────────────────────
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[signed-url] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Storage service not configured' })
    };
  }

  // ── 2. Authenticate the request — require valid Supabase JWT ─────────────
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Authentication required' })
    };
  }

  const userJwt = authHeader.replace('Bearer ', '').trim();

  // Verify the user JWT by calling Supabase auth.getUser
  let authenticatedUser;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${userJwt}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });

    if (!userRes.ok) {
      console.warn('[signed-url] Auth verification failed:', userRes.status);
      return {
        statusCode: 401,
        headers: HEADERS,
        body: JSON.stringify({ error: 'Invalid or expired session' })
      };
    }

    authenticatedUser = await userRes.json();

    if (!authenticatedUser?.id) {
      return {
        statusCode: 401,
        headers: HEADERS,
        body: JSON.stringify({ error: 'Could not verify user identity' })
      };
    }
  } catch (err) {
    console.error('[signed-url] Auth check error:', err.message);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Authentication check failed' })
    };
  }

  // ── 3. Parse and validate request body ───────────────────────────────────
  let requestBody;
  try {
    requestBody = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Invalid JSON body' })
    };
  }

  const { bucket, path: filePath } = requestBody;

  if (!bucket || !filePath) {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ error: 'bucket and path are required' })
    };
  }

  // ── 4. Validate bucket is allowed ────────────────────────────────────────
  if (!ALLOWED_BUCKETS.includes(bucket)) {
    return {
      statusCode: 403,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Access to this bucket is not permitted' })
    };
  }

  // ── 5. Validate the file path belongs to the authenticated user ──────────
  // File paths must start with the user's own UID to prevent cross-user access
  // Expected pattern: {user_id}/{filename}
  const expectedPrefix = authenticatedUser.id + '/';
  if (!filePath.startsWith(expectedPrefix)) {
    console.warn(`[signed-url] Path traversal attempt: user=${authenticatedUser.id}, path=${filePath}`);
    return {
      statusCode: 403,
      headers: HEADERS,
      body: JSON.stringify({ error: 'You do not have permission to access this file' })
    };
  }

  // ── 6. Block path traversal attempts ─────────────────────────────────────
  if (filePath.includes('..') || filePath.includes('//') || filePath.startsWith('/')) {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Invalid file path' })
    };
  }

  // ── 7. Generate signed URL via Supabase Storage API ──────────────────────
  try {
    const signedUrlEndpoint = `${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${filePath}`;

    const signRes = await fetch(signedUrlEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ expiresIn: SIGNED_URL_EXPIRY_SECONDS })
    });

    if (!signRes.ok) {
      const errText = await signRes.text();
      console.error('[signed-url] Supabase sign error:', signRes.status, errText);
      return {
        statusCode: 502,
        headers: HEADERS,
        body: JSON.stringify({ error: 'Could not generate file access URL' })
      };
    }

    const signData = await signRes.json();

    if (!signData?.signedURL) {
      console.error('[signed-url] No signedURL in response:', JSON.stringify(signData));
      return {
        statusCode: 502,
        headers: HEADERS,
        body: JSON.stringify({ error: 'Unexpected response from storage service' })
      };
    }

    // Return the signed URL — it is usable for SIGNED_URL_EXPIRY_SECONDS seconds
    console.log(`[signed-url] Signed URL generated for user=${authenticatedUser.id}, bucket=${bucket}`);
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        signedUrl: `${SUPABASE_URL}/storage/v1${signData.signedURL}`,
        expiresIn: SIGNED_URL_EXPIRY_SECONDS,
        expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toISOString()
      })
    };

  } catch (err) {
    console.error('[signed-url] Catch:', err.message);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Internal error generating file URL' })
    };
  }
};
