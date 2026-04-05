#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AfterActionAI — Targeted Deploy Script
# Deploys only the 4 changed files to Netlify site bebbd6ed-2643-4f30-80ba-1e5683e3d345
#
# USAGE:
#   export NETLIFY_TOKEN="nfp_xxxxxxxxxxxx"
#   bash deploy-changes.sh
#
# Or inline:
#   NETLIFY_TOKEN="nfp_xxxxxxxxxxxx" bash deploy-changes.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

SITE_ID="bebbd6ed-2643-4f30-80ba-1e5683e3d345"
API="https://api.netlify.com/api/v1"

# ── Token check ──────────────────────────────────────────────────────────────
if [ -z "$NETLIFY_TOKEN" ]; then
  echo "❌  NETLIFY_TOKEN is not set."
  echo "    Run: export NETLIFY_TOKEN=\"nfp_xxxxxxxxxxxx\""
  echo "    Then re-run this script."
  exit 1
fi

# ── Files to deploy (relative to this script's directory) ───────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
declare -A FILES
FILES["data/service_dogs.json"]="$SCRIPT_DIR/data/service_dogs.json"
FILES["data/licensure.json"]="$SCRIPT_DIR/data/licensure.json"
FILES["families_support_database.json"]="$SCRIPT_DIR/families_support_database.json"
FILES["netlify/functions/realtime-token.js"]="$SCRIPT_DIR/netlify/functions/realtime-token.js"
FILES["js/realtime-voice.js"]="$SCRIPT_DIR/js/realtime-voice.js"
FILES["js/app.js"]="$SCRIPT_DIR/js/app.js"
FILES["service-dogs.html"]="$SCRIPT_DIR/service-dogs.html"
FILES["grants-scholarships.html"]="$SCRIPT_DIR/grants-scholarships.html"
FILES["wellness.html"]="$SCRIPT_DIR/wellness.html"
FILES["licensure.html"]="$SCRIPT_DIR/licensure.html"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AfterActionAI Targeted Deploy"
echo "  Site: $SITE_ID"
echo "  Files: ${#FILES[@]}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Verify all files exist ───────────────────────────────────────────────────
echo ""
echo "▸ Checking files..."
for path in "${!FILES[@]}"; do
  local_path="${FILES[$path]}"
  if [ ! -f "$local_path" ]; then
    echo "  ❌  Missing: $local_path"
    exit 1
  fi
  echo "  ✓  $path"
done

# ── Compute SHA1s ────────────────────────────────────────────────────────────
echo ""
echo "▸ Computing SHA1 hashes..."
declare -A SHAS
for path in "${!FILES[@]}"; do
  local_path="${FILES[$path]}"
  sha=$(shasum -a 1 "$local_path" | awk '{print $1}')
  SHAS["$path"]="$sha"
  echo "  $sha  $path"
done

# ── Build manifest JSON ──────────────────────────────────────────────────────
echo ""
echo "▸ Building file manifest..."
MANIFEST_JSON='{"files":{'
first=1
for path in "${!SHAS[@]}"; do
  sha="${SHAS[$path]}"
  if [ $first -eq 0 ]; then MANIFEST_JSON+=","; fi
  MANIFEST_JSON+="\"/$path\":\"$sha\""
  first=0
done
MANIFEST_JSON+='}}'

# ── Create deploy ────────────────────────────────────────────────────────────
echo "▸ Creating Netlify deploy..."
DEPLOY_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $NETLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$MANIFEST_JSON" \
  "$API/sites/$SITE_ID/deploys")

HTTP_CODE=$(echo "$DEPLOY_RESPONSE" | tail -1)
DEPLOY_BODY=$(echo "$DEPLOY_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
  echo "  ❌  Deploy creation failed (HTTP $HTTP_CODE)"
  echo "  Response: $DEPLOY_BODY"
  exit 1
fi

DEPLOY_ID=$(echo "$DEPLOY_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'])")
echo "  ✓  Deploy created: $DEPLOY_ID"

# ── Get required files ───────────────────────────────────────────────────────
REQUIRED=$(echo "$DEPLOY_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
required_shas = set(d.get('required', []))
print(' '.join(required_shas))
")

if [ -z "$REQUIRED" ]; then
  echo ""
  echo "✅  All files already cached — deploy finalized instantly!"
  echo "  Deploy ID: $DEPLOY_ID"
  exit 0
fi

echo "  Required SHAs: $REQUIRED"

# ── Upload required files ────────────────────────────────────────────────────
echo ""
echo "▸ Uploading required files..."

for path in "${!SHAS[@]}"; do
  sha="${SHAS[$path]}"
  local_path="${FILES[$path]}"

  # Check if this file's SHA is in required list
  if echo "$REQUIRED" | grep -q "$sha"; then
    echo "  ↑  Uploading: $path"
    UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" \
      -X PUT \
      -H "Authorization: Bearer $NETLIFY_TOKEN" \
      -H "Content-Type: application/octet-stream" \
      --data-binary "@$local_path" \
      "$API/deploys/$DEPLOY_ID/files/$path")

    UP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -1)
    if [ "$UP_CODE" != "200" ] && [ "$UP_CODE" != "204" ]; then
      echo "  ❌  Upload failed for $path (HTTP $UP_CODE)"
      echo "  $(echo "$UPLOAD_RESPONSE" | head -n -1)"
      exit 1
    fi
    echo "  ✓  $path — uploaded"
  else
    echo "  ⊙  $path — cached (no upload needed)"
  fi
done

# ── Check final deploy state ─────────────────────────────────────────────────
echo ""
echo "▸ Verifying deploy state..."
sleep 3

for attempt in 1 2 3 4 5; do
  STATE_RESPONSE=$(curl -s \
    -H "Authorization: Bearer $NETLIFY_TOKEN" \
    "$API/deploys/$DEPLOY_ID")

  STATE=$(echo "$STATE_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('state','unknown'))")

  if [ "$STATE" = "ready" ]; then
    DEPLOY_URL=$(echo "$STATE_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('deploy_ssl_url',''))")
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ✅  DEPLOY COMPLETE"
    echo "  Deploy ID: $DEPLOY_ID"
    echo "  URL: $DEPLOY_URL"
    echo "  State: $STATE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
  elif [ "$STATE" = "error" ]; then
    echo "  ❌  Deploy entered error state"
    echo "  $STATE_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error_message','No error detail'))"
    exit 1
  else
    echo "  ↻  State: $STATE (attempt $attempt/5)..."
    sleep 4
  fi
done

echo ""
echo "  ⚠️  Deploy still processing. Check status at:"
echo "  https://app.netlify.com/sites/afteractionai/deploys/$DEPLOY_ID"
