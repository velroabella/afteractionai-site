#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AfterActionAI — Deploy All Session Fixes
# Deploys 3 patched files to Netlify site bebbd6ed-2643-4f30-80ba-1e5683e3d345
#
# PATCHES INCLUDED:
#   1. chat.js       — tool_choice 'any'→'auto', RULE 4 (no save on questions),
#                      RULE 5 (prove document use), RULE 6 (no brackets)
#   2. data-access.js — extracted_text added to documents.listByCase() SELECT
#   3. app.js        — content gate (rawText<400 blocks save),
#                      synthesis threshold tightened (800 chars + structure check),
#                      template routing disabled, false handoff triggers removed,
#                      dashboard context maps extracted_text,
#                      AI working indicator (showAIWorkingState/clearAIWorkingState)
#   4. legal-docx-generator.js — AI text in DOCX export
#   5. styles.css    — AI working banner + TTS mute button styles
#   6. index.html    — TTS mute button in chat input area
#
# USAGE:
#   cd /path/to/04_Technology/site
#   export NETLIFY_TOKEN="nfp_xxxxxxxxxxxx"
#   bash deploy-all-fixes.sh
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
echo "  AfterActionAI — Deploy All Session Fixes"
echo "  Site: $SITE_ID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Files to deploy ──────────────────────────────────────────────────────────
declare -A FILES
FILES["js/app.js"]="$SCRIPT_DIR/js/app.js"
FILES["js/data-access.js"]="$SCRIPT_DIR/js/data-access.js"
FILES["js/legal-docx-generator.js"]="$SCRIPT_DIR/js/legal-docx-generator.js"
FILES["netlify/functions/chat.js"]="$SCRIPT_DIR/netlify/functions/chat.js"
FILES["css/styles.css"]="$SCRIPT_DIR/css/styles.css"
FILES["index.html"]="$SCRIPT_DIR/index.html"
FILES["js/aios/mission-extractor.js"]="$SCRIPT_DIR/js/aios/mission-extractor.js"
FILES["js/aios/action-bar.js"]="$SCRIPT_DIR/js/aios/action-bar.js"
FILES["resources.html"]="$SCRIPT_DIR/resources.html"
FILES["css/resources-upgrade.css"]="$SCRIPT_DIR/css/resources-upgrade.css"
FILES["js/aios/resource-mapper.js"]="$SCRIPT_DIR/js/aios/resource-mapper.js"
FILES["profile.html"]="$SCRIPT_DIR/profile.html"
FILES["js/action-engine.js"]="$SCRIPT_DIR/js/action-engine.js"
FILES["state-benefits.html"]="$SCRIPT_DIR/state-benefits.html"

# ── Verify files exist ───────────────────────────────────────────────────────
echo ""
echo "▸ Checking local files..."
for path in "${!FILES[@]}"; do
  local_path="${FILES[$path]}"
  if [ ! -f "$local_path" ]; then
    echo "  ❌  Missing: $local_path"
    exit 1
  fi
  echo "  ✓  $path"
done

# ── Step 1: Get current production deploy ────────────────────────────────────
echo ""
echo "▸ Fetching current production deploy..."
SITE_RESP=$(curl -s \
  -H "Authorization: Bearer $NETLIFY_TOKEN" \
  "$API/sites/$SITE_ID")

CURRENT_DEPLOY_ID=$(echo "$SITE_RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
pd = d.get('published_deploy', {})
print(pd.get('id', ''))
")

if [ -z "$CURRENT_DEPLOY_ID" ]; then
  echo "  ❌  Could not get current deploy ID"
  echo "  Check your NETLIFY_TOKEN is valid."
  exit 1
fi
echo "  ✓  Current deploy: $CURRENT_DEPLOY_ID"

# ── Step 2: Get file listing from current deploy ────────────────────────────
echo "▸ Fetching file listing from current deploy..."
FILES_RESP=$(curl -s \
  -H "Authorization: Bearer $NETLIFY_TOKEN" \
  "$API/deploys/$CURRENT_DEPLOY_ID/files")

FILE_COUNT=$(echo "$FILES_RESP" | python3 -c "
import sys, json
files = json.load(sys.stdin)
print(len(files))
")
echo "  ✓  Got $FILE_COUNT files from current deploy"

# ── Step 3: Compute SHA1s for patched files ──────────────────────────────────
echo ""
echo "▸ Computing SHA1 hashes for patched files..."
declare -A SHAS
for path in "${!FILES[@]}"; do
  local_path="${FILES[$path]}"
  sha=$(shasum -a 1 "$local_path" | awk '{print $1}')
  SHAS["$path"]="$sha"
  echo "  $sha  $path"
done

# ── Step 4: Build merged manifest ────────────────────────────────────────────
echo ""
echo "▸ Building merged manifest (current files + 3 patched files)..."

# Export SHAs for Python
APP_JS_SHA="${SHAS["js/app.js"]}"
DA_JS_SHA="${SHAS["js/data-access.js"]}"
LDOCX_JS_SHA="${SHAS["js/legal-docx-generator.js"]}"
CHAT_JS_SHA="${SHAS["netlify/functions/chat.js"]}"
CSS_SHA="${SHAS["css/styles.css"]}"
IDX_SHA="${SHAS["index.html"]}"
MEXTR_SHA="${SHAS["js/aios/mission-extractor.js"]}"
ABAR_SHA="${SHAS["js/aios/action-bar.js"]}"
RES_HTML_SHA="${SHAS["resources.html"]}"
RES_CSS_SHA="${SHAS["css/resources-upgrade.css"]}"
RMAP_SHA="${SHAS["js/aios/resource-mapper.js"]}"
PROF_SHA="${SHAS["profile.html"]}"
AENG_SHA="${SHAS["js/action-engine.js"]}"
SBHTML_SHA="${SHAS["state-benefits.html"]}"

MANIFEST=$(echo "$FILES_RESP" | python3 -c "
import sys, json

files = json.load(sys.stdin)
manifest = {}
for f in files:
    path = f.get('path', f.get('id', ''))
    sha = f.get('sha', '')
    if path and sha:
        if not path.startswith('/'):
            path = '/' + path
        manifest[path] = sha

# Override with patched files
manifest['/js/app.js'] = '$APP_JS_SHA'
manifest['/js/data-access.js'] = '$DA_JS_SHA'
manifest['/js/legal-docx-generator.js'] = '$LDOCX_JS_SHA'
manifest['/netlify/functions/chat.js'] = '$CHAT_JS_SHA'
manifest['/css/styles.css'] = '$CSS_SHA'
manifest['/index.html'] = '$IDX_SHA'
manifest['/js/aios/mission-extractor.js'] = '$MEXTR_SHA'
manifest['/js/aios/action-bar.js'] = '$ABAR_SHA'
manifest['/resources.html'] = '$RES_HTML_SHA'
manifest['/css/resources-upgrade.css'] = '$RES_CSS_SHA'
manifest['/js/aios/resource-mapper.js'] = '$RMAP_SHA'
manifest['/profile.html'] = '$PROF_SHA'
manifest['/js/action-engine.js'] = '$AENG_SHA'
manifest['/state-benefits.html'] = '$SBHTML_SHA'

print(json.dumps({'files': manifest}))
")

MANIFEST_COUNT=$(echo "$MANIFEST" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(len(d.get('files', {})))
")
echo "  ✓  Manifest has $MANIFEST_COUNT files (full site + patched)"

# ── Step 5: Create new deploy ────────────────────────────────────────────────
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
  echo "  $DEPLOY_BODY" | head -20
  exit 1
fi

NEW_DEPLOY_ID=$(echo "$DEPLOY_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  ✓  Deploy created: $NEW_DEPLOY_ID"

# ── Step 6: Check required uploads ───────────────────────────────────────────
REQUIRED_SHAS=$(echo "$DEPLOY_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
req = d.get('required', [])
print(' '.join(req))
")

REQ_COUNT=$(echo "$DEPLOY_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(len(d.get('required', [])))
")

echo "  Required uploads: $REQ_COUNT files"

if [ "$REQ_COUNT" = "0" ]; then
  echo ""
  echo "✅  All files cached — deploy finalized!"
  exit 0
fi

# ── Step 7: Upload patched files if required ─────────────────────────────────
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

upload_file "js/app.js" "${FILES["js/app.js"]}" "$APP_JS_SHA"
upload_file "js/data-access.js" "${FILES["js/data-access.js"]}" "$DA_JS_SHA"
upload_file "js/legal-docx-generator.js" "${FILES["js/legal-docx-generator.js"]}" "$LDOCX_JS_SHA"
upload_file "netlify/functions/chat.js" "${FILES["netlify/functions/chat.js"]}" "$CHAT_JS_SHA"
upload_file "css/styles.css" "${FILES["css/styles.css"]}" "$CSS_SHA"
upload_file "index.html" "${FILES["index.html"]}" "$IDX_SHA"
upload_file "js/aios/mission-extractor.js" "${FILES["js/aios/mission-extractor.js"]}" "$MEXTR_SHA"
upload_file "js/aios/action-bar.js" "${FILES["js/aios/action-bar.js"]}" "$ABAR_SHA"
upload_file "resources.html" "${FILES["resources.html"]}" "$RES_HTML_SHA"
upload_file "css/resources-upgrade.css" "${FILES["css/resources-upgrade.css"]}" "$RES_CSS_SHA"
upload_file "js/aios/resource-mapper.js" "${FILES["js/aios/resource-mapper.js"]}" "$RMAP_SHA"
upload_file "profile.html" "${FILES["profile.html"]}" "$PROF_SHA"
upload_file "js/action-engine.js" "${FILES["js/action-engine.js"]}" "$AENG_SHA"
upload_file "state-benefits.html" "${FILES["state-benefits.html"]}" "$SBHTML_SHA"

# ── Step 8: Wait for deploy to finalize ──────────────────────────────────────
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
    echo "  • chat.js — tool_choice auto, RULE 4 + 5 + 6 (no brackets)"
    echo "  • data-access.js — extracted_text in listByCase"
    echo "  • legal-docx-generator.js — uses AI text in DOCX export"
    echo "  • app.js — content gate, synthesis threshold,"
    echo "    template routing off, false handoffs removed,"
    echo "    AI working indicator"
    echo "  • styles.css — AI working banner + TTS mute button styles"
    echo "  • index.html — TTS mute button in text chat input"
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
