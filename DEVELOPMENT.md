# Development

## Building the UI

The web UI source lives in `ui/` and is built with Vite. The built artifacts go to `public/`, which is gitignored and produced fresh on each build.

```bash
npm install
npm run build:ui
```

This runs `vite build` (see [vite.config.js](vite.config.js)) and outputs to
`public/`. The app icons are committed to git (see below), so the build no
longer generates them and does not need the `sharp`/`png-to-ico` toolchain.

## Icons

Every app and web icon is derived from a single master,
[branding/anchoralarm.png](branding/anchoralarm.png), by
[scripts/generate-icons.js](scripts/generate-icons.js) (using
[`sharp`](https://sharp.pixelplumbing.com/) and `png-to-ico`):

- the Signal K appstore icon (`anchoralarm.png`, referenced by
  `signalk.appIcon` in [package.json](package.json)),
- the browser favicons (`favicon-16x16.png`, `favicon-32x32.png`,
  `favicon.ico`),
- the Apple/iOS home-screen icon (`apple-touch-icon.png`), and
- the Android/PWA manifest icons (`android-chrome-192x192.png`,
  `android-chrome-512x512.png`, referenced by `site.webmanifest`), and
- the Android adaptive-icon "maskable" variants (`maskable-192x192.png`,
  `maskable-512x512.png`): the logo scaled into the central safe zone on a
  full-bleed background so the launcher's circle/squircle mask never clips it.

```bash
npm run generate:icons
```

The generator writes into `ui/public/` (Vite's publicDir), and `vite build`
copies the results into `public/`. This is a standalone step: the generated
icons are committed to git, so `npm run build:ui` does **not** run it. Run it
only when the master changes, then commit the regenerated icons alongside it.

The master lives outside `ui/public/` on purpose so Vite never copies it into
the build output, and it is excluded from the published npm tarball (`branding/`
is not listed in `files` in [package.json](package.json)). To change the icon,
replace `branding/anchoralarm.png` with a new square image (≥512×512), run
`npm run generate:icons`, and commit the master together with the regenerated
`ui/public/` icons.

## Releasing

The build runs automatically before publishing via the `prepack` script in [package.json](package.json), so `public/` does not need to be committed. Both `npm pack` and `npm publish` will rebuild it.

To cut a release:

```bash
npm version <patch|minor|major>
npm run release
```
