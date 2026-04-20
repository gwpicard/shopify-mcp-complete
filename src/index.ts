#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveAuth } from "./auth/index.js";
import { ShopifyClient } from "./client/graphql.js";
import { setupTools } from "./tools/index.js";

// Domain registrations (side-effect imports)
import "./tools/products/index.js";
import "./tools/bulk/index.js";
import "./tools/metafields/index.js";
import "./tools/collections/index.js";
import "./tools/inventory/index.js";
import "./tools/orders/index.js";
import "./tools/customers/index.js";
import "./tools/discounts/index.js";
import "./tools/store/index.js";

const SERVER_INSTRUCTIONS = `You are connected to a Shopify store via MCP. You have 32 tools across 9 domains: Products, Bulk Operations, Metafields, Collections, Inventory, Orders, Customers, Discounts, and Store.

## Key Workflows

### Product Audit
1. Use get_products or bulk_export_products to pull product data
2. Use get_product for comprehensive single-product detail (SEO, metafields, media, variants with cost, collections, category)
3. Analyze locally and identify issues
4. Use update_product (productSet) to fix issues — list fields use SET semantics (provide complete desired state)

### Bulk Operations
1. bulk_export_products kicks off 2 sequential queries (core+variants, then media+metafields+collections)
2. Poll with get_bulk_operation_status until COMPLETED
3. Download JSONL from the returned URL
4. For bulk updates: prepare JSONL with ProductSetInput objects, upload, use bulk_update_products

### Metafields
- get_metafields works on ANY resource via HasMetafields interface — just pass the GID
- set_metafields can set up to 25 metafields atomically across multiple resources
- get_metafield_definitions shows the schema (types, validations) for a resource type

### Inventory
- set_inventory is idempotent (absolute value) — safe to retry
- adjust_inventory is NOT idempotent (delta) — do NOT retry on ambiguous failures

### Important Notes
- All IDs are Shopify GIDs (e.g. gid://shopify/Product/123)
- Product mutations use productSet (atomic create-or-update)
- Orders and Customers are read-only in this server
- Use manage_tags to add/remove tags on any taggable resource
- Use search_products for convenient title/SKU/tag search without building Shopify query syntax`;

async function main() {
  const config = await resolveAuth();
  const client = new ShopifyClient(config);

  const server = new Server(
    { name: "shopify-mcp-complete", version: "1.0.0" },
    {
      capabilities: { tools: {} },
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  setupTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Shopify MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
