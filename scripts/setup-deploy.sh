#!/usr/bin/env bash
set -euo pipefail

# Setup script for Cloudflare Pages deployment
# Configures CNAME, custom domain, GitHub secrets, and pushes to trigger first deploy.
#
# Prerequisites:
#   - wrangler authenticated (`npx wrangler login`)
#   - gh authenticated (`gh auth login`)
#   - A Cloudflare API token for CI (create at https://dash.cloudflare.com/profile/api-tokens)

PROJECT_NAME="knuth-plass-wrap"
CUSTOM_DOMAIN="knuth-plass-wrap.current.space"
ZONE_NAME="current.space"
CNAME_TARGET="${PROJECT_NAME}.pages.dev"
GITHUB_REPO="currentspace/knuth-plass-wrap"

# --- 1. Get credentials from wrangler ---

echo "Getting account ID from wrangler..."
CLOUDFLARE_ACCOUNT_ID=$(npx wrangler whoami 2>&1 | grep -oE '[0-9a-f]{32}')
echo "Account ID: ${CLOUDFLARE_ACCOUNT_ID}"

echo ""
echo "An API token is needed for DNS setup and CI deploys."
echo "Create one at: https://dash.cloudflare.com/profile/api-tokens"
echo "  Permissions needed: Zone:DNS:Edit, Cloudflare Pages:Edit"
read -rsp "Cloudflare API Token: " CLOUDFLARE_API_TOKEN
echo

cf_api() {
  curl -s "$@" -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
}

# --- 2. Create CNAME DNS record ---

echo "Looking up zone ID for ${ZONE_NAME}..."
ZONE_ID=$(cf_api "https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}&account.id=${CLOUDFLARE_ACCOUNT_ID}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['id'])")
echo "Zone ID: ${ZONE_ID}"

echo "Creating CNAME record ${CUSTOM_DOMAIN} -> ${CNAME_TARGET}..."
cf_api -X POST \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"CNAME\",\"name\":\"${CUSTOM_DOMAIN}\",\"content\":\"${CNAME_TARGET}\",\"proxied\":true}" \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
if r.get('success'):
    print('CNAME record created.')
else:
    errors = r.get('errors', [])
    if any(e.get('code') == 81057 for e in errors):
        print('CNAME record already exists.')
    else:
        print('Error:', json.dumps(errors, indent=2))
        sys.exit(1)
"

# --- 3. Add custom domain to Cloudflare Pages project ---

echo "Adding custom domain ${CUSTOM_DOMAIN} to ${PROJECT_NAME}..."
cf_api -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/domains" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"${CUSTOM_DOMAIN}\"}" \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
if r.get('success'):
    print('Custom domain added to Pages project.')
else:
    errors = r.get('errors', [])
    if any(e.get('code') == 8000040 for e in errors):
        print('Custom domain already configured.')
    else:
        print('Error:', json.dumps(errors, indent=2))
        sys.exit(1)
"

# --- 4. Set GitHub secrets ---

echo "Setting GitHub secrets on ${GITHUB_REPO}..."
echo "${CLOUDFLARE_ACCOUNT_ID}" | gh secret set CLOUDFLARE_ACCOUNT_ID --repo="${GITHUB_REPO}"
echo "${CLOUDFLARE_API_TOKEN}"  | gh secret set CLOUDFLARE_API_TOKEN  --repo="${GITHUB_REPO}"
echo "GitHub secrets set."

# --- 5. Push to trigger deploy ---

echo "Pushing to origin main..."
git push origin main

echo ""
echo "Done! The GitHub Actions deploy job will run shortly."
echo "Monitor at: https://github.com/${GITHUB_REPO}/actions"
echo "Site will be live at: https://${CUSTOM_DOMAIN}"
