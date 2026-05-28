# Releasing

1. Make sure `master` is clean and pulled, ui is rebuilt, lint passes:

   ```sh
   git status
   git pull
   npm run build:ui
   npm run lint
   npm run format:check
   ```

2. Edit two files:
   - [CHANGELOG.md](CHANGELOG.md) — add a new section at the top matching the style of previous entries
   - [package.json](package.json) — bump the `version` field

3. Commit:

   ```sh
   git commit -am "release vX.Y.Z"
   ```

4. Make sure you're logged in to npm, sessions expire periodically

   ```sh
   npm login
   ```

5. Tag, push, publish:

   ```sh
   npm run release
   ```

   This tags `vX.Y.Z`, pushes tags + commits, and runs `npm publish`. If `npm publish` fails, just re-run it — the tag is already pushed.

6. Verify on [npm](https://www.npmjs.com/package/hoekens-anchor-alarm) and [GitHub tags](https://github.com/hoeken/hoekens-anchor-alarm/tags).
