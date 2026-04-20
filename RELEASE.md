# Release Process

## What's set up

- Releases run through GitHub Actions. Pushing a `vX.Y.Z` tag triggers `.github/workflows/publish.yml`, which runs tests, publishes to npm, and creates a matching GitHub Release.
- The package is on npm at https://www.npmjs.com/package/shopify-mcp-complete.
- Release notes come from `CHANGELOG.md`. The section matching the tag's version becomes the GitHub Release body.

## Releasing a new version

1. Update `CHANGELOG.md`. Move entries from `## [Unreleased]` into a new `## [X.Y.Z] - YYYY-MM-DD` section. Follow the existing `### Added / Changed / Fixed` format.
2. Bump the version and tag:
   ```bash
   npm version patch
   ```
   Use `minor` or `major` for larger bumps. `npm version` updates `package.json`, creates a commit, and tags it `vX.Y.Z`.
3. Push the commit and tag:
   ```bash
   git push --follow-tags
   ```
4. Check the run at https://github.com/gwpicard/shopify-mcp-complete/actions. When it passes, the new version is on npm and a matching GitHub Release is live.

## Version bumps

- `patch`: bug fix, no API change.
- `minor`: new tool or new optional parameter, backwards compatible.
- `major`: breaking change (tool removed, required parameter added, field renamed).
