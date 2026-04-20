# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-04-20

### Added
- Initial release: 33 tools across 9 domains (products, bulk, metafields, collections, inventory, orders, customers, discounts, store).
- Bulk export split across two sequential queries to stay under Shopify's 5-connection-per-operation limit.
- Rate limiting via `extensions.cost.throttleStatus`.
- Tool annotations on every tool so Claude Desktop can auto-approve read-only calls.
- `productSet` for both product creation and updates.
- OAuth setup script (`scripts/get-token.sh`) for the one-time `shpat_` token exchange.
