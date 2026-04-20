# Shopify MCP Server

[![npm version](https://img.shields.io/npm/v/shopify-mcp-complete.svg)](https://www.npmjs.com/package/shopify-mcp-complete)
[![Publish](https://github.com/gwpicard/shopify-mcp-complete/actions/workflows/publish.yml/badge.svg)](https://github.com/gwpicard/shopify-mcp-complete/actions/workflows/publish.yml)
[![License: MIT](https://img.shields.io/npm/l/shopify-mcp-complete.svg)](LICENSE)

A Shopify MCP server for Claude Desktop. 33 tools covering products, bulk operations, metafields, collections, inventory, orders, customers, discounts, and the store itself.

## Notes

- Uses `productSet` for both creating and updating products, so the same tool covers both.
- Rate limiting reads `extensions.cost.throttleStatus` on each response and backs off before hitting a 429.
- Bulk export splits across two sequential queries to stay under Shopify's 5-connection-per-operation limit.
- Read-only tools are annotated so Claude Desktop can auto-approve them.
- Authentication is a Shopify `shpat_` access token. `scripts/get-token.sh` runs the one-time OAuth exchange.
- Runtime dependency: `@modelcontextprotocol/sdk`.

## Quick Start

### 1. Install

```bash
npm install -g shopify-mcp-complete
```

### 2. Add to Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "shopify": {
      "command": "npx",
      "args": ["shopify-mcp-complete"],
      "env": {
        "SHOPIFY_STORE_DOMAIN": "your-store.myshopify.com",
        "SHOPIFY_ACCESS_TOKEN": "shpat_xxxxx"
      }
    }
  }
}
```

All credentials are passed via the `env` block in your MCP client config. No `.env` file needed.

<details>
<summary>Local development</summary>

If you're working on the server itself, clone the repo and point to the built output:

```bash
git clone https://github.com/gwpicard/shopify-mcp-complete.git
cd shopify-mcp-complete
npm install
npm run build
```

```json
{
  "mcpServers": {
    "shopify": {
      "command": "node",
      "args": ["/path/to/shopify-mcp-complete/dist/index.js"],
      "env": {
        "SHOPIFY_STORE_DOMAIN": "your-store.myshopify.com",
        "SHOPIFY_ACCESS_TOKEN": "shpat_xxxxx"
      }
    }
  }
}
```

</details>

## Authentication

You need an app on the [Shopify Dev Dashboard](https://dev.shopify.com/dashboard) and a one-time OAuth exchange to get a permanent `shpat_` access token.

### Getting Your Access Token

#### 1. Create the app

1. Go to [dev.shopify.com/dashboard](https://dev.shopify.com/dashboard) → **Apps** → **Create app**
2. Choose **Start from Dev Dashboard** and name your app

#### 2. Create and release a version

3. Go to the **Versions** tab → **Create a version**
4. Set the **Allowed redirection URL** to `https://example.com` (you'll grab the code from the redirect)
5. Under **Access scopes**, select the permissions you need:
   - `read_products`, `write_products`: product tools
   - `read_orders`: order tools
   - `read_customers`: customer tools
   - `read_inventory`, `write_inventory`: inventory tools
6. Click **Release** to make the version active

#### 3. Install and get credentials

7. Go to the app's **Home** tab → **Install app** → select your store
8. Go to **Settings** and copy your **Client ID** and **Client secret**

#### 4. Exchange an auth code for a permanent token

9. Run the setup script:
   ```bash
   bash scripts/get-token.sh
   ```
   It will prompt for your store domain, client ID, client secret, and scopes,
   then construct the authorize URL for you to open in a browser and exchange
   the code for a permanent `shpat_` token.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_STORE_DOMAIN` | Yes | Your `.myshopify.com` domain |
| `SHOPIFY_ACCESS_TOKEN` | Yes | The `shpat_` token from step 9 above |
| `SHOPIFY_API_VERSION` | No | Defaults to `2026-04` |

## Tools (33)

### Products (9)

| Tool | R/W | Description |
|------|-----|-------------|
| `get_product` | R | Full single-product detail (SEO, metafields, media, variants with cost, collections, category) |
| `get_products` | R | Paginated list with Shopify query syntax and sort keys |
| `search_products` | R | Convenience search by title, SKU, tag, or text |
| `count_products` | R | Product count with optional filter |
| `create_product` | W | Create via `productSet` (synchronous) |
| `update_product` | W | Update via `productSet` (set semantics for list fields) |
| `delete_product` | W | Permanently delete a product |
| `manage_product_media` | W | Add/delete product media |
| `manage_product_variants` | W | Bulk create/update/delete variants |

### Bulk Operations (4)

| Tool | R/W | Description |
|------|-----|-------------|
| `bulk_export_products` | R | Kick off 2 sequential bulk queries for full product data, with an optional Shopify `query` filter applied at source |
| `get_bulk_operation_status` | R | Poll operation status and get download URL |
| `get_bulk_operation_results` | R | Download and parse completed bulk operation JSONL. Supports `offset`/`limit` paging, `fields` projection (dotted paths), and `output_file` to write results to disk instead of returning inline |
| `bulk_update_products` | W | JSONL upload + bulk `productSet` mutation |

### Metafields (4)

| Tool | R/W | Description |
|------|-----|-------------|
| `get_metafields` | R | Get metafields on any resource via GID |
| `set_metafields` | W | Set up to 25 metafields atomically |
| `delete_metafields` | W | Delete a metafield by GID |
| `get_metafield_definitions` | R | Get metafield schema for a resource type |

### Collections (2)

| Tool | R/W | Description |
|------|-----|-------------|
| `get_collections` | R | Paginated list with search |
| `get_collection` | R | Full detail with products, rules, SEO, metafields |

### Inventory (4)

| Tool | R/W | Description |
|------|-----|-------------|
| `get_inventory_levels` | R | Quantities by name across locations |
| `set_inventory` | W | Absolute set (idempotent) |
| `adjust_inventory` | W | Delta adjustment (NOT idempotent) |
| `get_locations` | R | List store locations |

### Orders (2, read-only)

| Tool | R/W | Description |
|------|-----|-------------|
| `get_orders` | R | Paginated with query and sort |
| `get_order` | R | Full detail with line items, addresses, fulfillments |

### Customers (2, read-only)

| Tool | R/W | Description |
|------|-----|-------------|
| `get_customers` | R | Paginated with search and sort |
| `get_customer` | R | Full detail with addresses, spend, metafields |

### Discounts (4)

| Tool | R/W | Description |
|------|-----|-------------|
| `get_discounts` | R | Unified query across all 6 discount types |
| `create_discount` | W | Create basic code discount |
| `update_discount` | W | Update basic code discount |
| `delete_discount` | W | Delete code or automatic discount |

### Store & Utility (2)

| Tool | R/W | Description |
|------|-----|-------------|
| `get_shop` | R | Store info, plan, currency, timezone |
| `manage_tags` | W | Add/remove tags on any taggable resource |

## Example Workflows

### Product Audit

```
1. get_products (status:ACTIVE) → get list
2. get_product (per product) → full detail with SEO, metafields, variants
3. Analyze: missing descriptions, bad SEO, no images, pricing issues
4. update_product → fix issues using productSet
```

### Bulk Export & Update

```
1. bulk_export_products → get 2 operation IDs
2. get_bulk_operation_status (poll until COMPLETED)
3. Download JSONL from returned URL
4. Analyze locally, prepare update JSONL
5. bulk_update_products with JSONL URL
```

### Inventory Management

```
1. get_inventory_levels → current stock across locations
2. set_inventory → absolute count after physical inventory
3. adjust_inventory → relative adjustment (+10, -5)
```

## Development

```bash
npm run dev      # Watch mode
npm run lint     # Type check
npm test         # Run tests
npm run build    # Build for production
```

## Architecture

- TypeScript ESM, ES2022 target, strict mode.
- Shopify Admin GraphQL API, version 2026-04.
- Node 18+ (uses native `fetch`).
- Tools self-register via side-effect imports from domain modules.

See [SPECIFICATION.md](SPECIFICATION.md) for the full technical spec.
See [RELEASE.md](RELEASE.md) for how releases are cut.
