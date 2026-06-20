# Releasing

Releases are automated. Pushing a `vX.Y.Z` tag triggers
[`.github/workflows/publish.yml`](.github/workflows/publish.yml), which:

1. extracts the matching `# vX.Y.Z` section from [CHANGELOG.md](CHANGELOG.md)
   and creates a GitHub Release with those notes as the body, then
2. publishes to npm using OIDC trusted publishing (with provenance).

The Signal K appstore Changelog tab reads the GitHub Release notes, so the
curated CHANGELOG.md section is what users see before installing.

## One-time setup (npm trusted publishing)

No `NPM_TOKEN` is stored. Instead, configure the package on npmjs.com once:

- npm package **Settings → Trusted Publisher → GitHub Actions**
- Repository: `hoeken/hoekens-anchor-alarm`
- Workflow filename: `publish.yml`

## Cutting a release

### 1. Make sure `master` is clean and pulled, ui is rebuilt, lint passes:

```sh
git status
git pull
npm run build:ui
npm run lint
npm run format:check
```

### 2. Edit two files:

- [CHANGELOG.md](CHANGELOG.md) — add a new `# vX.Y.Z` section at the top
  matching the style of previous entries (the version heading must match the
  tag exactly, e.g. tag `v2.4.0` → heading `# v2.4.0`)
- [package.json](package.json) — bump the `version` field

### 3. Commit:

```sh
git commit -am "release vX.Y.Z"
```

### 4. Tag and push:

```sh
npm run release
```

This pushes `master` and the `vX.Y.Z` tag. The publish workflow takes it from
there — no `npm login` or local `npm publish` needed.

### 5. Verify:

- [GitHub Actions](https://github.com/hoeken/hoekens-anchor-alarm/actions) — the "Publish to npm" run is green
- [GitHub Releases](https://github.com/hoeken/hoekens-anchor-alarm/releases) — the release shows your CHANGELOG notes
- [npm](https://www.npmjs.com/package/hoekens-anchor-alarm) — the new version is live

Pre-release tags (`v2.4.0-beta.1`, `-alpha`, `-rc`) are marked as
pre-releases on GitHub and published under the matching npm dist-tag.
