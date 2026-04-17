#!/usr/bin/env bash
#
# get-token.sh — Interactive Shopify OAuth token exchange
#
# Prompts for store domain, client ID, client secret, and scopes,
# then walks you through the authorization code flow to get a
# permanent shpat_ access token.
#
# Requirements: bash, curl
#

set -euo pipefail

echo "=== Shopify Access Token Setup ==="
echo

# Prompt for inputs
read -rp "Store domain (e.g. my-store.myshopify.com): " STORE_DOMAIN
read -rp "Client ID: " CLIENT_ID
read -rp "Client secret: " CLIENT_SECRET
read -rp "Scopes [read_products,write_products,read_orders,read_customers,read_inventory,write_inventory]: " SCOPES
SCOPES="${SCOPES:-read_products,write_products,read_orders,read_customers,read_inventory,write_inventory}"

REDIRECT_URI="https://example.com"

echo
echo "Open this URL in your browser to authorize the app:"
echo
echo "  https://${STORE_DOMAIN}/admin/oauth/authorize?client_id=${CLIENT_ID}&scope=${SCOPES}&redirect_uri=${REDIRECT_URI}&response_type=code"
echo
echo "After approving, you'll be redirected to:"
echo "  https://example.com?code=SOME_CODE&..."
echo
read -rp "Paste the code from the redirect URL: " AUTH_CODE

echo
echo "Exchanging code for access token..."
echo

JSON_BODY=$(printf '{"client_id":"%s","client_secret":"%s","code":"%s"}' "$CLIENT_ID" "$CLIENT_SECRET" "$AUTH_CODE")

RESPONSE=$(curl -s -X POST "https://${STORE_DOMAIN}/admin/oauth/access_token" \
  -H "Content-Type: application/json" \
  -d "$JSON_BODY")

# Try to extract the access_token from the JSON response
TOKEN=$(echo "$RESPONSE" | grep -o '"access_token":"[^"]*"' | sed 's/^"access_token":"//;s/"$//')

if [ -z "$TOKEN" ]; then
  echo "Error: Could not extract access token from response:"
  echo "$RESPONSE"
  exit 1
fi

echo "Success! Your permanent access token:"
echo
echo "  SHOPIFY_ACCESS_TOKEN=${TOKEN}"
echo
echo "Add this to your MCP client config (e.g. claude_desktop_config.json)."
echo "This token does not expire — no need to run this script again."
