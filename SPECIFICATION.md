# Shopify MCP Server Specification

**Version:** 1.0.0
**Status:** Approved
**Last Updated:** 2026-04-16

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Decisions](#2-architecture-decisions)
3. [Complete Tool Reference](#3-complete-tool-reference)
4. [Bulk Export Field Specification](#4-bulk-export-field-specification)
5. [What's Excluded (and Why)](#5-whats-excluded-and-why)
6. [Changelog](#6-changelog)

---

## 1. Overview

The Shopify MCP server is a Model Context Protocol server that connects Claude Desktop to a Shopify store via the Shopify Admin GraphQL API. It exposes 32 tools across 9 domains covering products, orders, customers, inventory, collections, discounts, and store configuration.

### Key Workflow

The primary use case is a product audit loop:

1. **Pull** product data (single-product detail, paginated lists, or bulk exports for thousands of products).
2. **Audit** locally. The LLM examines SEO metadata, missing images, price anomalies, inventory gaps, tag consistency, and other quality signals.
3. **Update** products back to Shopify: titles, descriptions, tags, metafields, variants, and media over the same connection.

The server also supports order review, customer lookup, inventory management, discount administration, and store-level configuration queries.

### Tool Count Summary

| Domain | Tools | Read | Write |
|---|---|---|---|
| Products | 9 | 3 | 6 |
| Bulk Operations | 3 | 2 | 1 |
| Metafields | 4 | 2 | 2 |
| Collections | 2 | 2 | 0 |
| Inventory | 4 | 2 | 2 |
| Orders | 2 | 2 | 0 |
| Customers | 2 | 2 | 0 |
| Discounts | 4 | 1 | 3 |
| Store & Utility | 2 | 1 | 1 |
| **Total** | **32** | **17** | **15** |

---

## 2. Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript, ESM, strict mode, ES2022 target | Full type safety; ES2022 enables top-level await and current builtins; strict mode catches null/undefined errors at compile time. |
| API | Shopify Admin GraphQL only, version 2026-04 | Shopify's recommended API surface. GraphQL allows precise field selection, reducing payload sizes. REST Admin API is legacy and lacks newer mutations. |
| HTTP | Native `fetch()` (Node 18+) | Zero extra dependencies. Node 18+ ships a spec-compliant `fetch` based on `undici`. Eliminates `axios`, `node-fetch`, or `got`. |
| Runtime dependencies | 1: `@modelcontextprotocol/sdk` | Lean dependency tree. The SDK provides `Server`, `StdioServerTransport`, and the JSON-RPC message handling. Everything else is hand-written. |
| Tool schemas | Raw JSON Schema objects (no Zod) | Avoids a second runtime dependency. JSON Schema objects are passed directly to the MCP SDK and are already the wire format the protocol requires. |
| Product mutations | `productSet` (not `productCreate`/`productUpdate`) | `productSet` is Shopify's atomic create-or-update operation. It accepts a full product payload with `synchronous: true` and returns the complete product, so there's no separate create and update code path. Uses set semantics for list fields (tags, metafields, variants). |
| Bulk export | 2 sequential queries | Shopify limits each `bulkOperationRunQuery` to 5 connections. Splitting into two queries (core+variants and media+metafields+collections) stays under the limit while still pulling all the fields the audit workflow needs. |
| Rate limiting | Cost-aware via `extensions.cost.throttleStatus` | Every GraphQL response includes `throttleStatus` with `currentlyAvailable`, `maximumAvailable`, and `restoreRate`. The client tracks these values and sleeps before sending a request that would exceed the budget, so 429 errors don't happen in the first place. |
| Auth | Token-only (`SHOPIFY_ACCESS_TOKEN`) + setup script | The server requires a single `SHOPIFY_ACCESS_TOKEN` environment variable containing a permanent `shpat_` token. A standalone `scripts/get-token.sh` bash script handles the one-time OAuth authorization code exchange interactively (prompts for store domain, client ID, client secret, and scopes). The server resolves auth at startup and uses a single `X-Shopify-Access-Token` header thereafter. |
| Transport | stdio | Required for Claude Desktop integration. The server reads JSON-RPC messages from stdin and writes responses to stdout. Logging goes to stderr. |
| Tool naming | `snake_case` | MCP convention. All tool names use lowercase with underscores (e.g., `get_product`, `bulk_export_products`). |
| Tool annotations | On every tool | MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) are declared on every tool. This enables Claude Desktop to auto-approve read-only tool calls without user confirmation. |
| Server instructions | Cross-tool workflow guidance | The server's `instructions` field contains guidance that helps the LLM pick the right tools for multi-step workflows (e.g., "use `get_product` for single-product detail, `get_products` for lists, `bulk_export_products` for full catalog"). |
| Error handling | Structured `userErrors` + GraphQL errors | Every mutation response is checked for both top-level GraphQL `errors` and Shopify-specific `userErrors` arrays. Errors are formatted into human-readable messages returned via the MCP `isError` flag. |

---

## 3. Complete Tool Reference

### 3.1 Products (9 tools)

#### `get_product`

| Property | Value |
|---|---|
| **Domain** | Products |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Get full detail for a single product by GID. Returns SEO metadata, metafields (first 50), all media types including images/video/3D models (first 50), variants with cost/SKU/barcode/weight/compareAtPrice (first 100), collections the product belongs to (first 50), product category, selling plan groups (first 10), price range, compare-at price range, and full option definitions. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `product_id` | string | Yes | Shopify product GID (e.g., `gid://shopify/Product/123456789`) |

**Key implementation details:**
- Single GraphQL query with nested connections for variants (100), media (50), metafields (50), collections (50), and sellingPlanGroups (10).
- Media uses inline fragments to capture type-specific fields: `MediaImage`, `Video`, `ExternalVideo`, `Model3d`.
- Variant fields include `inventoryItem.unitCost` for COGS data.
- Returns `pageInfo` on each connection so the caller knows if pagination is needed.

---

#### `get_products`

| Property | Value |
|---|---|
| **Domain** | Products |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | List products with summary fields only. Supports full Shopify query syntax (e.g., `status:ACTIVE vendor:"Nike"`) and sort keys. Returns paginated results. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `query` | string | No | Shopify search query (e.g., `status:ACTIVE AND vendor:"Nike"`) |
| `first` | number | No | Page size, 1-250 (default 50) |
| `after` | string | No | Cursor for forward pagination |
| `sort_key` | string | No | Sort field: `TITLE`, `PRODUCT_TYPE`, `VENDOR`, `UPDATED_AT`, `CREATED_AT`, `INVENTORY_TOTAL`, `ID` |
| `reverse` | boolean | No | Reverse sort order |

**Key implementation details:**
- Returns summary fields only: `id`, `title`, `handle`, `status`, `vendor`, `productType`, `tags`, `totalInventory`, `totalVariants`, `createdAt`, `updatedAt`.
- No nested connections (no variants, no images) to keep response size small and query cost low.
- Supports the full Shopify query mini-language including boolean operators and field prefixes.

---

#### `search_products`

| Property | Value |
|---|---|
| **Domain** | Products |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Convenience wrapper around `get_products` that builds a Shopify query from a `search_type` parameter. Simplifies common search patterns so the LLM does not need to know Shopify query syntax. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `search_value` | string | Yes | The value to search for |
| `search_type` | string | Yes | One of `title`, `sku`, `tag`, `text`. `text` performs a full-text search across all product fields. |
| `first` | number | No | Page size, 1-250 (default 50) |
| `after` | string | No | Cursor for forward pagination |

**Key implementation details:**
- `title` maps to `title:*{term}*`.
- `sku` maps to `sku:{term}`.
- `tag` maps to `tag:{term}`.
- `text` passes the term as a bare query string for Shopify's full-text search.

---

#### `count_products`

| Property | Value |
|---|---|
| **Domain** | Products |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Returns the total number of products matching an optional filter. Uses the `productsCount` query which is cheaper than fetching a full page. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `query` | string | No | Shopify filter query (same syntax as `get_products`) |

**Key implementation details:**
- Uses `productsCount(query: $query) { count }`, a single scalar query with minimal cost.
- Useful for determining whether to use paginated listing vs. bulk export.

---

#### `create_product`

| Property | Value |
|---|---|
| **Domain** | Products |
| **R/W** | Write |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: true` |
| **Description** | Create a new product using the `productSet` mutation with `synchronous: true`. Accepts the full product payload including title, description, SEO, variants, metafields, tags, media, and category. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Product title |
| `descriptionHtml` | string | No | Product description in HTML |
| `vendor` | string | No | Vendor name |
| `productType` | string | No | Product type |
| `status` | string | No | `ACTIVE`, `DRAFT`, or `ARCHIVED` (default `DRAFT`) |
| `tags` | string[] | No | Product tags |
| `variants` | object[] | No | Variant definitions with price, sku, barcode, weight, options |
| `metafields` | object[] | No | Metafield definitions with namespace, key, type, value |
| `seo` | object | No | SEO title and description |
| `category` | string | No | Shopify product category GID |

**Key implementation details:**
- Uses `productSet` mutation (not `productCreate`) for atomic create-or-update semantics.
- `synchronous: true` ensures the product is fully indexed before the response returns.
- If no `id` is provided, `productSet` creates a new product.
- Returns the created product with all resolved GIDs.

---

#### `update_product`

| Property | Value |
|---|---|
| **Domain** | Products |
| **R/W** | Write |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Update an existing product using `productSet`. Accepts any subset of product fields. Uses set semantics for list fields: the provided list replaces the existing list entirely. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `product_id` | string | Yes | Shopify product GID |
| `title` | string | No | New title |
| `descriptionHtml` | string | No | New description (HTML) |
| `vendor` | string | No | New vendor |
| `productType` | string | No | New product type |
| `status` | string | No | `ACTIVE`, `DRAFT`, or `ARCHIVED` |
| `tags` | string[] | No | New tags (replaces all existing tags) |
| `seo` | object | No | Updated SEO title and description |
| `metafields` | object[] | No | Metafields to set (upsert by namespace+key) |
| `category` | string | No | Product category GID |

**Key implementation details:**
- Uses `productSet` with the product `id` field set, triggering update mode.
- **Set semantics for list fields:** providing `tags: ["sale"]` replaces all existing tags with `["sale"]`. To add a tag, read the current tags first and merge.
- `synchronous: true` ensures index consistency.
- Idempotent: calling with the same payload twice produces the same result.

---

#### `delete_product`

| Property | Value |
|---|---|
| **Domain** | Products |
| **R/W** | Write |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false`, `openWorldHint: true` |
| **Description** | Permanently delete a product. This cannot be undone. The product and all its variants, media, and metafields are removed. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `product_id` | string | Yes | Shopify product GID to delete |

**Key implementation details:**
- Uses `productDelete` mutation.
- Returns the `deletedProductId` on success.
- Marked as `destructiveHint: true` so Claude Desktop will always require user confirmation.

---

#### `manage_product_media`

| Property | Value |
|---|---|
| **Domain** | Products |
| **R/W** | Write |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: true` |
| **Description** | Add or delete media on a product. Routes to `productCreateMedia` or `productDeleteMedia` based on the `action` parameter. Supports images, video, and 3D models via external URLs. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `product_id` | string | Yes | Shopify product GID |
| `action` | string | Yes | `add` or `delete` |
| `media` | object[] | Conditional | For `add`: array of `{ originalSource, alt, mediaContentType }`. `mediaContentType` is `IMAGE`, `VIDEO`, `EXTERNAL_VIDEO`, or `MODEL_3D`. |
| `media_ids` | string[] | Conditional | For `delete`: array of media GIDs to remove |

**Key implementation details:**
- `add` action uses `productCreateMedia` with `CreateMediaInput` objects.
- `delete` action uses `productDeleteMedia` with media GIDs.
- `openWorldHint: true` because `add` fetches external URLs.
- Media is processed asynchronously by Shopify; newly added images may take a moment to appear.

---

#### `manage_product_variants`

| Property | Value |
|---|---|
| **Domain** | Products |
| **R/W** | Write |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: true` |
| **Description** | Bulk create, update, or delete variants on a product. Routes to the appropriate mutation based on `action`. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `product_id` | string | Yes | Shopify product GID |
| `action` | string | Yes | `create`, `update`, or `delete` |
| `variants` | object[] | Conditional | For `create`/`update`: array of variant objects with price, sku, barcode, weight, weightUnit, options, compareAtPrice |
| `variant_ids` | string[] | Conditional | For `delete`: array of variant GIDs |

**Key implementation details:**
- `create` uses `productVariantsBulkCreate` for batch efficiency.
- `update` uses `productVariantsBulkUpdate`.
- `delete` uses `productVariantsBulkDelete`.
- A product must always retain at least one variant; attempting to delete all variants will fail.

---

### 3.2 Bulk Operations (3 tools)

#### `bulk_export_products`

| Property | Value |
|---|---|
| **Domain** | Bulk Operations |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Start a bulk export of all products (or a filtered subset). Uses 2 sequential `bulkOperationRunQuery` calls to stay within the 5-connection limit. Returns operation IDs that can be polled with `get_bulk_operation_status`. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `query` | string | No | Shopify filter query to limit which products are exported |

**Key implementation details:**
- Fires two sequential bulk queries (see [Section 4](#4-bulk-export-field-specification) for field details).
- Query 1: Product Core + Variants (2 connections).
- Query 2: Media + Metafields + Collections (4 connections, within the 5-connection limit).
- Returns both operation IDs so the caller can poll each independently.
- `openWorldHint: true` because the JSONL result is downloaded from a Shopify-generated URL.

---

#### `get_bulk_operation_status`

| Property | Value |
|---|---|
| **Domain** | Bulk Operations |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Check the status of a bulk operation by its ID. Returns status, progress, error info, and the download URL when complete. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `operation_id` | string | Yes | Bulk operation GID (e.g., `gid://shopify/BulkOperation/123`) |

**Key implementation details:**
- Uses `node(id:)` query to fetch `BulkOperation` fields: `status`, `errorCode`, `objectCount`, `fileSize`, `url`, `partialDataUrl`.
- Status values: `CREATED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELING`, `CANCELED`, `EXPIRED`.
- When status is `COMPLETED`, the `url` field contains a JSONL file for download.
- Recommended polling interval: 3-5 seconds for small stores, 10-30 seconds for large catalogs.

---

#### `bulk_update_products`

| Property | Value |
|---|---|
| **Domain** | Bulk Operations |
| **R/W** | Write |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Bulk update products via staged upload. Accepts a JSONL payload, uploads it via `stagedUploadsCreate`, then starts a `bulkOperationRunMutation` targeting `productSet`. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `mutations` | object[] | Yes | Array of product payloads. Each object is a `productSet` input with at least an `id` field. |

**Key implementation details:**
- Step 1: Call `stagedUploadsCreate` with `resource: BULK_MUTATION_VARIABLES`, `httpMethod: POST`, `mimeType: application/jsonl`.
- Step 2: Upload the JSONL payload to the staged URL.
- Step 3: Call `bulkOperationRunMutation` with the `productSet` mutation template and the staged upload URL.
- Returns the bulk operation ID for polling.
- Idempotent because `productSet` is itself idempotent.

---

### 3.3 Metafields (4 tools)

#### `get_metafields`

| Property | Value |
|---|---|
| **Domain** | Metafields |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | List metafields on any resource that implements the `HasMetafields` interface. Provide the resource GID and optionally filter by namespace. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `owner_id` | string | Yes | Resource GID (e.g., `gid://shopify/Product/123`, `gid://shopify/Customer/456`) |
| `namespace` | string | No | Filter to a specific namespace |
| `first` | number | No | Page size, 1-250 (default 50) |
| `after` | string | No | Pagination cursor |

**Key implementation details:**
- Uses a `node(id:)` query with `... on HasMetafields { metafields(...) }` inline fragment.
- Works with any resource type: Product, ProductVariant, Customer, Order, Collection, Shop, etc.
- Returns: `id`, `namespace`, `key`, `value`, `type`, `createdAt`, `updatedAt`.

---

#### `set_metafields`

| Property | Value |
|---|---|
| **Domain** | Metafields |
| **R/W** | Write |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Create or update metafields atomically. Uses the `metafieldsSet` mutation, which upserts by owner + namespace + key. Up to 25 metafields per call. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `metafields` | object[] | Yes | Array of metafield inputs (max 25). Each: `{ ownerId, namespace, key, type, value }` |

**Key implementation details:**
- `metafieldsSet` is an upsert: if a metafield with the same `ownerId` + `namespace` + `key` exists, it is updated; otherwise it is created.
- `type` must be a valid Shopify metafield type: `single_line_text_field`, `multi_line_text_field`, `number_integer`, `number_decimal`, `json`, `boolean`, `date`, `date_time`, `url`, `color`, `dimension`, `volume`, `weight`, `rating`, `money`, etc.
- Atomic: all 25 metafields succeed or all fail.
- Idempotent: setting the same value twice is a no-op.

---

#### `delete_metafields`

| Property | Value |
|---|---|
| **Domain** | Metafields |
| **R/W** | Write |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Delete a metafield by its GID. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `metafield_id` | string | Yes | Metafield GID (e.g., `gid://shopify/Metafield/123`) |

**Key implementation details:**
- Uses `metafieldDelete(input: { id: $id })`.
- Returns `deletedId` on success.
- Idempotent: deleting an already-deleted metafield returns success.
- Marked `destructiveHint: true` because the data is permanently removed.

---

#### `get_metafield_definitions`

| Property | Value |
|---|---|
| **Domain** | Metafields |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | List metafield definitions for a given owner type. Definitions describe the schema (namespace, key, type, validations) for metafields that appear in the Shopify admin. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `owner_type` | string | Yes | `PRODUCT`, `PRODUCTVARIANT`, `CUSTOMER`, `ORDER`, `COLLECTION`, `SHOP`, etc. |
| `first` | number | No | Page size (default 50) |
| `after` | string | No | Pagination cursor |

**Key implementation details:**
- Uses `metafieldDefinitions(ownerType: $ownerType, ...)` query.
- Returns: `id`, `name`, `namespace`, `key`, `type { name }`, `description`, `pinnedPosition`, `validations { name, type, value }`.

---

### 3.4 Collections (2 tools)

#### `get_collections`

| Property | Value |
|---|---|
| **Domain** | Collections |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | List collections (both smart and custom) with optional search query. Returns summary fields and product counts. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `query` | string | No | Search query |
| `first` | number | No | Page size, 1-250 (default 50) |
| `after` | string | No | Pagination cursor |

**Key implementation details:**
- Returns: `id`, `title`, `handle`, `sortOrder`, `productsCount`, `updatedAt`.
- Both smart collections (rule-based) and custom collections (manual) are included.

---

#### `get_collection`

| Property | Value |
|---|---|
| **Domain** | Collections |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Get full detail for a single collection including its products, rules (for smart collections), SEO metadata, image, and metafields. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `collection_id` | string | Yes | Collection GID |

**Key implementation details:**
- Returns products (first 50) with summary fields.
- For smart collections, includes `ruleSet { appliedDisjunctively, rules { column, relation, condition } }`.
- Includes `seo { title, description }`, `image { url, altText }`, and `metafields(first: 20)`.

---

### 3.5 Inventory (4 tools)

#### `get_inventory_levels`

| Property | Value |
|---|---|
| **Domain** | Inventory |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | List inventory levels across all locations. Returns quantities broken down by name: `available`, `incoming`, `committed`, `damaged`, `on_hand`, `reserved`, `safety_stock`. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `first` | number | No | Page size, 1-250 (default 50) |
| `after` | string | No | Pagination cursor |

**Key implementation details:**
- Uses `inventoryItems(first:)` with nested `inventoryLevels(first: 10)` per item.
- Each level includes `location { id, name }` and `quantities(names: ["available", "incoming", "committed", "damaged", "on_hand", "reserved", "safety_stock"]) { name, quantity }`.

---

#### `set_inventory`

| Property | Value |
|---|---|
| **Domain** | Inventory |
| **R/W** | Write |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Set an absolute inventory quantity at a specific location. Uses `inventorySetQuantities` with `ignoreCompareQuantity: true` for unconditional set. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `inventory_item_id` | string | Yes | Inventory item GID |
| `location_id` | string | Yes | Location GID |
| `quantity` | number | Yes | New absolute quantity |

**Key implementation details:**
- Uses `inventorySetQuantities` mutation with `name: "available"` and `reason: "correction"`.
- `ignoreCompareQuantity: true` makes this an unconditional set (no optimistic concurrency).
- Idempotent: setting to the same value twice is a no-op.

---

#### `adjust_inventory`

| Property | Value |
|---|---|
| **Domain** | Inventory |
| **R/W** | Write |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: true` |
| **Description** | Adjust inventory by a delta (positive to add, negative to subtract). Uses `inventoryAdjustQuantities`. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `inventory_item_id` | string | Yes | Inventory item GID |
| `location_id` | string | Yes | Location GID |
| `delta` | number | Yes | Quantity change (positive or negative) |
| `reason` | string | No | Reason code: `correction`, `cycle_count_available`, `damaged`, `shrinkage`, `restock`, `received`, `promotion`, `quality_control`, `safety_stock`, `other` (default `correction`) |

**Key implementation details:**
- Uses `inventoryAdjustQuantities` with `name: "available"`.
- **NOT idempotent:** calling twice doubles the adjustment. The LLM should confirm before repeating.
- Reason code is recorded in Shopify's inventory history for audit trail.

---

#### `get_locations`

| Property | Value |
|---|---|
| **Domain** | Inventory |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | List all store locations (warehouses, retail stores, dropship locations) with address, active status, and fulfillment capabilities. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `first` | number | No | Page size (default 50) |
| `after` | string | No | Pagination cursor |

**Key implementation details:**
- Returns: `id`, `name`, `address { ... }`, `isActive`, `fulfillsOnlineOrders`, `hasActiveInventory`.
- Use location GIDs from this tool when calling `set_inventory` or `adjust_inventory`.

---

### 3.6 Orders (2 tools)

#### `get_orders`

| Property | Value |
|---|---|
| **Domain** | Orders |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | List orders with optional filtering. Supports Shopify's query syntax for filtering by status, financial status, fulfillment status, date range, and customer. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `query` | string | No | Shopify query (e.g., `financial_status:paid AND fulfillment_status:unshipped`) |
| `first` | number | No | Page size, 1-250 (default 50) |
| `after` | string | No | Pagination cursor |
| `sort_key` | string | No | Sort field: `PROCESSED_AT`, `TOTAL_PRICE`, `ID`, `CREATED_AT`, `UPDATED_AT`, `ORDER_NUMBER` |
| `reverse` | boolean | No | Reverse sort order |

**Key implementation details:**
- Returns summary fields: `id`, `name` (order number), `createdAt`, `totalPriceSet`, `displayFinancialStatus`, `displayFulfillmentStatus`, `customer { displayName, email }`, `lineItemsCount`.
- Read-only: no order mutations are exposed to prevent accidental modifications.

---

#### `get_order`

| Property | Value |
|---|---|
| **Domain** | Orders |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Get full detail for a single order including line items, customer, shipping/billing addresses, fulfillments, transactions, discount applications, refunds, and risk assessments. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `order_id` | string | Yes | Shopify order GID |

**Key implementation details:**
- Line items (first 100) include: `title`, `quantity`, `originalUnitPriceSet`, `discountedUnitPriceSet`, `sku`, `variant { id, title }`, `product { id, title }`.
- Fulfillments include tracking info.
- Transactions include `kind`, `status`, `amountSet`, `gateway`.
- Shipping/billing addresses are fully expanded.

---

### 3.7 Customers (2 tools)

#### `get_customers`

| Property | Value |
|---|---|
| **Domain** | Customers |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | List customers with optional search. Returns display name, email, phone, order count, total spent, tags, and creation date. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `query` | string | No | Search query (name, email, phone, tag) |
| `first` | number | No | Page size, 1-250 (default 50) |
| `after` | string | No | Pagination cursor |

**Key implementation details:**
- Returns summary fields: `id`, `displayName`, `email`, `phone`, `ordersCount`, `totalSpentV2 { amount, currencyCode }`, `tags`, `createdAt`, `state`.
- Read-only: no customer mutations are exposed for safety.

---

#### `get_customer`

| Property | Value |
|---|---|
| **Domain** | Customers |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Get full detail for a single customer including all addresses, order history summary, metafields, notes, tax exemptions, and marketing consent. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `customer_id` | string | Yes | Shopify customer GID |

**Key implementation details:**
- Includes `addresses(first: 10)` with full address fields.
- Includes `metafields(first: 20)` for custom customer data.
- Includes `emailMarketingConsent { marketingState, consentUpdatedAt }`.
- Includes last order date and lifetime duration.

---

### 3.8 Discounts (4 tools)

#### `get_discounts`

| Property | Value |
|---|---|
| **Domain** | Discounts |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | List all discounts (both code-based and automatic) using the unified `discountNodes` query. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `query` | string | No | Search filter |
| `first` | number | No | Page size, 1-250 (default 50) |
| `after` | string | No | Pagination cursor |

**Key implementation details:**
- Uses `discountNodes` which returns both `DiscountCodeNode` and `DiscountAutomaticNode` types.
- Inline fragments resolve type-specific fields: code, percentage/amount, customer selection, minimum requirements.
- Returns: `id`, `title`, `status`, `startsAt`, `endsAt`, discount value, usage count.

---

#### `create_discount`

| Property | Value |
|---|---|
| **Domain** | Discounts |
| **R/W** | Write |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: true` |
| **Description** | Create a new code-based discount using `discountCodeBasicCreate`. Supports percentage and fixed-amount discounts. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Internal discount name |
| `code` | string | Yes | Customer-facing discount code |
| `type` | string | Yes | `percentage` or `fixed_amount` |
| `value` | number | Yes | Discount value. For percentage: decimal (e.g., `0.20` = 20%). For fixed_amount: currency amount (e.g., `10.00`). |
| `starts_at` | string | No | Start date (ISO 8601, default now) |
| `ends_at` | string | No | End date (ISO 8601, optional for no-expiry) |
| `applies_once_per_customer` | boolean | No | Limit to once per customer |
| `minimum_subtotal` | string | No | Minimum order subtotal to qualify |

**Key implementation details:**
- Uses `discountCodeBasicCreate` mutation.
- `customerGets.items` is set to `{ all: true }` (applies to all products).
- `customerSelection` is set to `{ all: true }` (available to all customers).
- For `percentage` type: value is passed as `{ percentage: value }`.
- For `fixed_amount` type: value is passed as `{ discountAmount: { amount: value, appliesOnEachItem: false } }`.

---

#### `update_discount`

| Property | Value |
|---|---|
| **Domain** | Discounts |
| **R/W** | Write |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Update a code-based discount's title, dates, or usage limits using `discountCodeBasicUpdate`. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `discount_id` | string | Yes | Discount node GID |
| `title` | string | No | New title |
| `starts_at` | string | No | New start date |
| `ends_at` | string | No | New end date |

**Key implementation details:**
- Uses `discountCodeBasicUpdate` mutation.
- Only updates the fields provided; other fields remain unchanged.

---

#### `delete_discount`

| Property | Value |
|---|---|
| **Domain** | Discounts |
| **R/W** | Write |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Delete a discount. Routes to the correct mutation based on discount type (code-based or automatic). |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `discount_id` | string | Yes | Discount node GID |
| `type` | string | Yes | `code` or `automatic` |

**Key implementation details:**
- For `type: "code"`: uses `discountCodeDelete`.
- For `type: "automatic"`: uses `discountAutomaticDelete`.
- The caller must specify the type because different GID types require different mutations.
- Marked `destructiveHint: true` for user confirmation.

---

### 3.9 Store & Utility (2 tools)

#### `get_shop`

| Property | Value |
|---|---|
| **Domain** | Store & Utility |
| **R/W** | Read |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Get store configuration and metadata. Returns store name, plan, domain, timezone, currency, weight unit, billing address, enabled features, and contact info. |

**Parameters:**

None.

**Key implementation details:**
- Single `shop` query with no arguments.
- Returns: `name`, `email`, `myshopifyDomain`, `plan { displayName }`, `primaryDomain { url }`, `contactEmail`, `billingAddress`, `timezoneAbbreviation`, `currencyCode`, `weightUnit`, `features { ... }`.
- Useful as a first call to verify connectivity and understand store configuration.

---

#### `manage_tags`

| Property | Value |
|---|---|
| **Domain** | Store & Utility |
| **R/W** | Write |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` |
| **Description** | Add or remove tags on any taggable resource (Product, Customer, Order, DraftOrder, etc.). Uses `tagsAdd` or `tagsRemove` mutations. |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `resource_id` | string | Yes | GID of the resource (e.g., `gid://shopify/Product/123`) |
| `action` | string | Yes | `add` or `remove` |
| `tags` | string[] | Yes | Tags to add or remove |

**Key implementation details:**
- `tagsAdd` and `tagsRemove` work on any resource that implements the `HasTags` interface.
- Idempotent: adding a tag that already exists is a no-op; removing a tag that does not exist is a no-op.
- Tags are case-insensitive in Shopify.

---

## 4. Bulk Export Field Specification

Bulk exports use Shopify's `bulkOperationRunQuery` API, which processes the entire dataset asynchronously and writes results as JSONL. Each `bulkOperationRunQuery` supports a maximum of 5 connections per query, so we split product export into two queries.

### Query 1: Product Core + Variants

**Connections used:** 2 (variants, options)

```graphql
{
  products {
    edges {
      node {
        id
        title
        handle
        descriptionHtml
        status
        vendor
        productType
        tags
        createdAt
        updatedAt
        publishedAt
        onlineStoreUrl
        totalInventory
        tracksInventory
        hasOnlyDefaultVariant
        seo { title description }
        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        compareAtPriceRange {
          minVariantCompareAtPrice { amount currencyCode }
          maxVariantCompareAtPrice { amount currencyCode }
        }
        category { id name fullName }
        templateSuffix
        options {
          id name position values
        }
        variants {
          edges {
            node {
              id
              title
              sku
              barcode
              price
              compareAtPrice
              position
              inventoryQuantity
              requiresShipping
              taxable
              taxCode
              selectedOptions { name value }
              inventoryItem {
                id
                unitCost { amount currencyCode }
                tracked
                measurement { weight { value unit } }
              }
            }
          }
        }
      }
    }
  }
}
```

**Scalar fields (Product):**

| Field | Included | Reason |
|---|---|---|
| `id` | Yes | Primary identifier |
| `title` | Yes | Core data |
| `handle` | Yes | URL slug, SEO relevance |
| `descriptionHtml` | Yes | Full HTML body for content audit |
| `status` | Yes | ACTIVE/DRAFT/ARCHIVED |
| `vendor` | Yes | Vendor attribution |
| `productType` | Yes | Categorization |
| `tags` | Yes | Tagging audit |
| `createdAt` | Yes | Age tracking |
| `updatedAt` | Yes | Staleness detection |
| `publishedAt` | Yes | Publication date |
| `onlineStoreUrl` | Yes | Canonical URL |
| `totalInventory` | Yes | Stock overview |
| `tracksInventory` | Yes | Inventory management flag |
| `hasOnlyDefaultVariant` | Yes | Variant structure indicator |
| `templateSuffix` | Yes | Theme template |
| `seo.title` | Yes | SEO audit |
| `seo.description` | Yes | SEO audit |
| `priceRangeV2` | Yes | Price consistency check |
| `compareAtPriceRange` | Yes | Sale pricing audit |
| `category` | Yes | Taxonomy classification |

**Scalar fields (Variant):**

| Field | Included | Reason |
|---|---|---|
| `id` | Yes | Primary identifier |
| `title` | Yes | Display name |
| `sku` | Yes | SKU audit (missing/duplicate) |
| `barcode` | Yes | Barcode audit |
| `price` | Yes | Pricing audit |
| `compareAtPrice` | Yes | Sale pricing consistency |
| `position` | Yes | Sort order |
| `inventoryQuantity` | Yes | Stock level |
| `inventoryItem.measurement.weight` | Yes | Shipping weight audit (value + unit) |
| `requiresShipping` | Yes | Fulfillment configuration |
| `taxable` / `taxCode` | Yes | Tax configuration |
| `selectedOptions` | Yes | Option mapping |
| `inventoryItem.unitCost` | Yes | COGS / margin calculation |
| `inventoryItem.tracked` | Yes | Inventory tracking flag |

### Query 2: Media + Metafields + Collections

**Connections used:** 4 (media, metafields, collections, sellingPlanGroups)

```graphql
{
  products {
    id
    media {
      ... on MediaImage {
        id
        alt
        image { url width height }
        mediaContentType
        status
      }
      ... on Video {
        id
        alt
        mediaContentType
        status
        sources { url mimeType format width height }
      }
      ... on ExternalVideo {
        id
        alt
        mediaContentType
        host
        originUrl
      }
      ... on Model3d {
        id
        alt
        mediaContentType
        sources { url mimeType format }
      }
    }
    metafields {
      id
      namespace
      key
      value
      type
      createdAt
      updatedAt
    }
    collections {
      id
      title
      handle
    }
    sellingPlanGroups {
      id
      name
      sellingPlans {
        edges {
          node {
            id name
          }
        }
      }
    }
  }
}
```

### Trimmed Fields

The following fields are deliberately excluded from bulk export to reduce payload size and query cost:

| Excluded Field | Reason |
|---|---|
| `description` (plain text) | `descriptionHtml` is the source of truth; plain text can be derived |
| `images` (legacy connection) | `media` is the replacement and includes images |
| `variants.image` | Image-to-variant association is rarely needed in bulk audit |
| `variants.fulfillmentService` | Fulfillment config is location-specific, not relevant for product audit |
| `variants.inventoryPolicy` | Can be audited separately via inventory tools |
| `bodyHtml` (REST legacy) | Not available in GraphQL; use `descriptionHtml` |
| `productPublications` | Publication channel data is store-config, not product-content |
| `resourcePublications` | Same as above |
| `feedback` | App feedback is developer-facing, not merchant-facing |

---

## 5. What's Excluded (and Why)

This server is scoped to the product audit workflow and adjacent merchant operations. The following Shopify API areas are intentionally omitted.

### API Domains Not Included

| Domain | Reason |
|---|---|
| **Webhooks** (`webhookSubscriptionCreate`, etc.) | Infrastructure concern, not relevant for interactive product audit. Webhook management belongs in deployment tooling, not an LLM conversation. |
| **Themes / Assets** (`theme`, `asset`) | Theme editing requires file I/O and template rendering knowledge. Out of scope for product data audit. |
| **Script Tags** (`scriptTagCreate`, etc.) | Deprecated in favor of Shopify Functions. Legacy storefront concern. |
| **Carrier Services** (`carrierServiceCreate`, etc.) | Shipping rate calculation infrastructure. Requires a callback URL, which an MCP server cannot provide. |
| **Online Store / Pages** (`page`, `blog`, `article`) | CMS content is distinct from product data. Could be a future addition. |
| **Files** (`fileCreate`, `stagedUploadsCreate` for general use) | Generic file management is exposed only internally for bulk operations. Direct file management is out of scope. |
| **App Installations / Extensions** | Developer-facing APIs, not merchant-facing. |
| **Shopify Payments** (`dispute`, `payout`, `balance`) | Financial operations require elevated trust and are dangerous in an LLM context. |
| **Gift Cards** (`giftCardCreate`, etc.) | Monetary instrument creation is a financial risk. Read-only gift card data could be a future addition. |
| **Translations** (`translationsRegister`, etc.) | Internationalization is a specialized workflow that requires language expertise. Could be a future addition. |
| **Markets / Market Localizations** | Multi-market configuration is an advanced setup task, not routine audit work. |

### Mutations Intentionally Withheld

| Mutation Category | Reason |
|---|---|
| **Order mutations** (`orderUpdate`, `orderCancel`, `refundCreate`, etc.) | Orders represent completed financial transactions. Accidental modification can cause refund issues, fulfillment problems, and accounting discrepancies. The server provides read-only order access for audit and reporting. |
| **Customer mutations** (`customerCreate`, `customerUpdate`, `customerDelete`, etc.) | Customer records contain PII and are linked to orders, accounts, and marketing consent. Mutations are excluded to prevent accidental data modification or deletion. Read-only access supports customer lookup for order context. |
| **Shop mutations** (`shopUpdate`, etc.) | Store-level configuration changes (currency, timezone, address) have broad impact and should be made through the Shopify admin UI with proper review. |
| **Location mutations** (`locationAdd`, `locationDelete`, etc.) | Location changes affect inventory distribution, fulfillment routing, and tax calculation. High-impact infrastructure changes. |

---

## 6. Changelog

### v1.0.0 (2026-04-16)

Initial release.

- 32 tools across 9 domains: Products, Bulk Operations, Metafields, Collections, Inventory, Orders, Customers, Discounts, Store & Utility.
- Shopify Admin GraphQL API version 2026-04.
- Token-only authentication (`SHOPIFY_ACCESS_TOKEN`) with standalone `scripts/get-token.sh` setup script for OAuth exchange.
- Cost-aware rate limiting using `extensions.cost.throttleStatus`.
- Two-query bulk export strategy that stays under the 5-connection limit while capturing full product data.
- MCP tool annotations on every tool for auto-approval of read-only operations.
- stdio transport for Claude Desktop integration.
- Single runtime dependency: `@modelcontextprotocol/sdk`.
