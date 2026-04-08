#!/bin/bash
# ================================================================
# AIOS Phase 3 System Correction — Netlify Deploy
# Deploys 6 updated files for the multi-route transition guide
# and data page fetch path fixes.
# ================================================================
set -e

SITE_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_ID="bebbd6ed-2643-4f30-80ba-1e5683e3d345"

# --- Check for Netlify CLI ---
if ! command -v netlify &> /dev/null; then
  echo "❌ Netlify CLI not found. Install with: npm install -g netlify-cli"
  echo "   Then run: netlify login"
  exit 1
fi

echo "=========================================="
echo "  AIOS Phase 3 — System Correction Deploy"
echo "=========================================="
echo ""
echo "Site directory: $SITE_DIR"
echo "Site ID:        $SITE_ID"
echo ""
echo "Files being deployed (full site, including these critical updates):"
echo "  ✓ transition-guide.html     (multi-route card renderer)"
echo "  ✓ hidden-benefits.html      (root-relative fetch path)"
echo "  ✓ emergency-assistance.html (root-relative fetch path + response time fix)"
echo "  ✓ data/transition-resources.json (routes array schema)"
echo "  ✓ data/hidden-benefits.json      (must be in deploy bundle)"
echo "  ✓ data/emergency-assistance.json  (must be in deploy bundle)"
echo ""

# --- Deploy ---
echo "🚀 Deploying to Netlify (production)..."
cd "$SITE_DIR"
netlify deploy --prod --dir=. --site="$SITE_ID"

echo ""
echo "=========================================="
echo "  ✅ Deploy complete!"
echo "=========================================="
echo ""
echo "Post-deploy checklist:"
echo "  1. Open https://afteractionai.org/transition-guide"
echo "     → Each card should show 'Explore Resources' panel with 2-4 internal links"
echo "     → External links should appear as 'Official Source ↗' (outline button)"
echo "  2. Open https://afteractionai.org/hidden-benefits"
echo "     → Cards should render (check browser console for '[HB] Loaded hidden benefits: 30 entries')"
echo "  3. Open https://afteractionai.org/emergency-assistance"
echo "     → Cards should render (check console for '[EA] Loaded emergency assistance: 30 entries')"
echo "     → Response time filter pills should all return results"
echo ""
