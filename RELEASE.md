# Release Process

## What's set up

- Releases are automated via GitHub Actions. Pushing a `vX.Y.Z` tag triggers `.github/workflows/publish.yml`, which runs tests, publishes to npm, and creates a matching GitHub Release.
- The package is on npm at https://www.npmjs.com/package/shopify-mcp-complete.
- Release notes are read from `CHANGELOG.md` — the section matching the tag's version becomes the GitHub Release body.

## Releasing a new version

1. **Update `CHANGELOG.md`.** Move entries from `## [Unreleased]` into a new `## [X.Y.Z] - YYYY-MM-DD` section. Follow the existing format (`### Added / Changed / Fixed` subsections).
2. **Bump the version and tag:**
   ```bash
   npm version patch   # or `minor` / `major` — bumps package.json, commits, tags vX.Y.Z
   ```
3. **Push the commit and tag:**
   ```bash
   git push --follow-tags
   ```
4. **Watch the run:** https://github.com/gwpicard/shopify-mcp-complete/actions. When it turns green, the new version is live on npm and a matching release exists on GitHub.

That's it — no manual `npm publish`, no manual `gh release create`.

## Picking a version bump

- `patch` — bug fix, no API change.
- `minor` — new tool or new optional parameter, backwards compatible.
- `major` — breaking change (tool removed, required parameter added, renamed field).
