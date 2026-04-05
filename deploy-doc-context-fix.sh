#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AfterActionAI — Document Context Fix Deploy
# Deploys app.js + request-builder.js patches to Netlify
# Site: bebbd6ed-2643-4f30-80ba-1e5683e3d345
#
# WHAT THIS FIXES:
#   1. Uploaded document text now injected into AI prompt (was metadata-only)
#   2. False dashboard handoff bars removed (gated on real save)
#   3. Template routing disabled (docs flow through main chat)
#   4. Prompt budget raised 7000 → 15000 for doc content
#
# USAGE:
#   export NETLIFY_TOKEN="nfp_xxxxxxxxxxxx"
#   cd /path/to/site
#   bash deploy-doc-context-fix.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

SITE_ID="bebbd6ed-2643-4f30-80ba-1e5683e3d345"
API="https://api.netlify.com/api/v1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Token check ──────────────────────────────────────────────────────────────
if [ -z "$NETLIFY_TOKEN" ]; then
  echo "❌  NETLIFY_TOKEN not set."
  echo "    export NETLIFY_TOKEN=\"nfp_xxxxxxxxxxxx\""
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AfterActionAI — Document Context Fix Deploy"
echo "  Site: $SITE_ID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Get current production deploy ─────────────────────────────────────
echo ""
echo "▸ Fetching current production deploy..."
SITE_RESP=$(curl -s \
  -H "Authorization: Bearer $NETLIFY_TOKEN" \
  "$API/sites/$SITE_ID")

CURRENT_DEPLOY_ID=$(echo "$SITE_RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
# published_deploy has the full file manifest
pd = d.get('published_deploy', {})
print(pd.get('id', ''))
")

if [ -z "$CURRENT_DEPLOY_ID" ]; then
  echo "  ❌  Could not get current deploy ID"
  exit 1
fi
echo "  ✓  Current deploy: $CURRENT_DEPLOY_ID"

# ── Step 2: Get full file manifest from current deploy ────────────────────────
echo "▸ Fetching full file manifest from current deploy..."
DEPLOY_RESP=$(curl -s \
  -H "Authorization: Bearer $NETLIFY_TOKEN" \
  "$API/sites/$SITE_ID/deploys/$CURRENT_DEPLOY_ID")

# Extract the full file→SHA1 manifest (this is what makes the site complete)
python3 -c "
import sys, json
d = json.load(sys.stdin)
# Netlify returns the manifest as a dict of path→sha1 under 'summary' or
# we need to reconstruct from required_functions + required
# Actually the full manifest is not always in the response.
# Let's check what keys exist
keys = list(d.keys())
print('Keys:', ', '.join(sorted(keys)))
" <<< "$DEPLOY_RESP"

# The site files are available via the files endpoint
echo "▸ Fetching file listing from deploy..."
FILES_RESP=$(curl -s \
  -H "Authorization: Bearer $NETLIFY_TOKEN" \
  "$API/deploys/$CURRENT_DEPLOY_ID/files")

FILE_COUNT=$(echo "$FILES_RESP" | python3 -c "
import sys, json
files = json.load(sys.stdin)
print(len(files))
")
echo "  ✓  Got $FILE_COUNT files from current deploy"

# ── Step 3: Build full manifest, replacing our 2 changed files ────────────────
echo ""
echo "▸ Computing SHA1s for patched files..."
APP_JS_SHA=$(shasum -a 1 "$SCRIPT_DIR/js/app.js" | awk '{print $1}')
RB_JS_SHA=$(shasum -a 1 "$SCRIPT_DIR/js/aios/request-builder.js" | awk '{print $1}')
echo "  js/app.js                    → $APP_JS_SHA"
echo "  js/aios/request-builder.js   → $RB_JS_SHA"

echo ""
echo "▸ Building merged manifest (current files + patched files)..."
MANIFEST=$(echo "$FILES_RESP" | python3 -c "
import sys, json

files = json.load(sys.stdin)
manifest = {}
for f in files:
    path = f.get('path', f.get('id', ''))
    sha = f.get('sha', '')
    if path and sha:
        # Ensure paths start with /
        if not path.startswith('/'):
            path = '/' + path
        manifest[path] = sha

# Override with our patched files
manifest['/js/app.js'] = '$APP_JS_SHA'
manifest['/js/aios/request-builder.js'] = '$RB_JS_SHA'

print(json.dumps({'files': manifest}))
")

MANIFEST_FILE_COUNT=$(echo "$MANIFEST" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(len(d.get('files', {})))
")
echo "  ✓  Manifest has $MANIFEST_FILE_COUNT files (full site + 2 patched)"

# ── Step 4: Create new deploy with full manifest ──────────────────────────────
echo ""
echo "▸ Creating Netlify deploy..."
DEPLOY_CREATE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $NETLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$MANIFEST" \
  "$API/sites/$SITE_ID/deploys")

HTTP_CODE=$(echo "$DEPLOY_CREATE" | tail -1)
DEPLOY_BODY=$(echo "$DEPLOY_CREATE" | head -n -1)

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
  echo "  ❌  Deploy creation failed (HTTP $HTTP_CODE)"
  echo "  $DEPLOY_BODY" | head -200
  exit 1
fi

NEW_DEPLOY_ID=$(echo "$DEPLOY_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  ✓  Deploy created: $NEW_DEPLOY_ID"

# ── Step 5: Check which files Netlify needs uploaded ──────────────────────────
REQUIRED=$(echo "$DEPLOY_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
req = d.get('required', [])
print(' '.join(req))
print(len(req), file=sys.stderr)
" 2>&1)

REQ_COUNT=$(echo "$REQUIRED" | tail -1)
REQUIRED_SHAS=$(echo "$REQUIRED" | head -1)

echo "  Required uploads: $REQ_COUNT files"

if [ "$REQ_COUNT" = "0" ]; then
  echo ""
  echo "✅  All files cached — deploy finalized!"
  exit 0
fi

# ── Step 6: Upload our patched files if required ──────────────────────────────
echo ""
echo "▸ Uploading patched files..."

upload_file() {
  local deploy_path="$1"
  local local_path="$2"
  local sha="$3"

  if echo "$REQUIRED_SHAS" | grep -q "$sha"; then
    echo "  ↑  Uploading: $deploy_path"
    UP_RESP=$(curl -s -w "\n%{http_code}" \
      -X PUT \
      -H "Authorization: Bearer $NETLIFY_TOKEN" \
      -H "Content-Type: application/octet-stream" \
      --data-binary "@$local_path" \
      "$API/deploys/$NEW_DEPLOY_ID/files/$deploy_path")

    UP_CODE=$(echo "$UP_RESP" | tail -1)
    if [ "$UP_CODE" != "200" ] && [ "$UP_CODE" != "204" ]; then
      echo "  ❌  Upload failed: $deploy_path (HTTP $UP_CODE)"
      echo "  $(echo "$UP_RESP" | head -n -1)"
      return 1
    fi
    echo "  ✓  $deploy_path uploaded"
  else
    echo "  ⊙  $deploy_path — already cached"
  fi
}

upload_file "js/app.js" "$SCRIPT_DIR/js/app.js" "$APP_JS_SHA"
upload_file "js/aios/request-builder.js" "$SCRIPT_DIR/js/aios/request-builder.js" "$RB_JS_SHA"

# ── Step 7: Wait for deploy to finalize ───────────────────────────────────────
echo ""
echo "▸ Waiting for deploy to finalize..."
for attempt in 1 2 3 4 5 6 7 8; do
  sleep 4
  STATE_RESP=$(curl -s \
    -H "Authorization: Bearer $NETLIFY_TOKEN" \
    "$API/deploys/$NEW_DEPLOY_ID")

  STATE=$(echo "$STATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('state','unknown'))")

  if [ "$STATE" = "ready" ]; then
    DEPLOY_URL=$(echo "$STATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('deploy_ssl_url',''))")
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ✅  DEPLOY COMPLETE"
    echo "  Deploy ID:  $NEW_DEPLOY_ID"
    echo "  URL:        $DEPLOY_URL"
    echo "  Site:       https://afteractionai.org"
    echo ""
    echo "  PATCHES DEPLOYED:"
    echo "  • js/app.js — template routing disabled, doc context in"
    echo "    _loadDashboardContext, false handoff triggers removed"
    echo "  • js/aios/request-builder.js — extracted_text injection,"
    echo "    prompt budget raised to 15000"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
  elif [ "$STATE" = "error" ]; then
    echo "  ❌  Deploy failed"
    echo "$STATE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error_message','unknown'))"
    exit 1
  else
    echo "  ↻  State: $STATE (attempt $attempt/8)..."
  fi
done

echo "  ⚠️  Deploy still processing — check:"
echo "  https://app.netlify.com/sites/afteractionai/deploys/$NEW_DEPLOY_ID"
