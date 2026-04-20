# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.0] - 2026-04-20

### Added
- `query` parameter on `bulk_export_products` for source-side filtering (Shopify query syntax, e.g. `status:ACTIVE`).
- `offset` parameter on `get_bulk_operation_results` for paging through large result sets.
- `fields` parameter on `get_bulk_operation_results` for dotted-path projection (e.g. `["id", "title", "seo.title"]`).
- `output_file` parameter on `get_bulk_operation_results` that writes results to a local file and omits `data` from the tool response, so large catalogues stay out of the LLM context window.

### Changed
- Rewrote the npm package description to a factual tool-coverage summary.

## [1.0.2] - 2026-04-20

### Changed
- Rewrote README, RELEASE.md, SPECIFICATION.md, and CHANGELOG in plainer language.

## [1.0.1] - 2026-04-20

### Changed
- Set up automated release pipeline via GitHub Actions with npm Trusted Publishing (OIDC). Tag pushes now publish to npm and create a matching GitHub Release.

## [1.0.0] - 2026-04-20

### Added
- Initial release: 33 tools across 9 domains (products, bulk, metafields, collections, inventory, orders, customers, discounts, store).
- Bulk export split across two sequential queries to stay under Shopify's 5-connection-per-operation limit.
- Rate limiting via `extensions.cost.throttleStatus`.
- Tool annotations on every tool so Claude Desktop can auto-approve read-only calls.
- `productSet` for both product creation and updates.
- OAuth setup script (`scripts/get-token.sh`) for the one-time `shpat_` token exchange.
