# Releasing

1. Make sure `master` is clean and pulled, lint passes:

   ```sh
   git status
   git pull
   npm run lint
   npm run format:check
   ```

2. Add a new section at the top of [CHANGELOG.md](CHANGELOG.md) for the new version. Match the style of previous entries.

3. Bump the version in `package.json` (and `package-lock.json`):

   ```sh
   npm version <patch|minor|major> --no-git-tag-version
   ```

   - **patch** = bug fixes only
   - **minor** = new features, backwards compatible
   - **major** = breaking changes

4. Commit the changelog + version bump together:

   ```sh
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "release vX.Y.Z"
   ```

5. Tag, push, publish:

   ```sh
   npm run release
   ```

   This tags `vX.Y.Z`, pushes tags + commits, and runs `npm publish`. If `npm publish` fails, just re-run it — the tag is already pushed.

6. Verify on [npm](https://www.npmjs.com/package/hoekens-anchor-alarm) and [GitHub tags](https://github.com/hoeken/hoekens-anchor-alarm/tags).
