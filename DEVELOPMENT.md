# Development

## Building the UI

The web UI source lives in `ui/` and is built with Vite. The built artifacts go to `public/`, which is gitignored and produced fresh on each build.

```bash
npm install
npm run build:ui
```

This runs `vite build` (see [vite.config.js](vite.config.js)) and outputs to `public/`.

## Releasing

The build runs automatically before publishing via the `prepack` script in [package.json](package.json), so `public/` does not need to be committed. Both `npm pack` and `npm publish` will rebuild it.

To cut a release:

```bash
npm version <patch|minor|major>
npm run release
```
