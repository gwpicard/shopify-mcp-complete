# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-04-20

### Added
- Initial release: 33 Shopify tools across 9 domains (products, bulk, metafields, collections, inventory, orders, customers, discounts, store).
- Two-query bulk export strategy to stay under Shopify's 5-connection-per-operation limit.
- Cost-aware rate limiting via `extensions.cost.throttleStatus`.
- Tool annotations on every tool for Claude Desktop auto-approval of read-only calls.
- `productSet`-based create/update path (atomic, matches Shopify's recommended pattern).
- Interactive OAuth setup script (`scripts/get-token.sh`) for one-time `shpat_` token exchange.
