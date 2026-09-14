# Tsukiweb engine 1.1.0

The game runtime and supporting conversion tools are based on upstream
`requinDr/tsukiweb-public` tag `v1.1.0` (`bd56857e`). The common engine is pinned
to the upstream release's `bc82c66e0060849d34e0bb7f501a8ef671f0a80e` commit.
This is an engine version, independent of the MAO translation release version.

The upgrade brings upstream flowchart zoom, save import and validation, controls,
backlog layout, asset caching/preloading, and image/end-of-play fixes. Affection
serialization now uses the upstream common implementation rather than our
temporary backport.

## MAO integration

- MAO game scripts, choices, logic, reader/audit data, and publication pages stay
  intact, including the corrections for issues #18 and #19.
- Game modules remain lazy so opening a reader page does not start game audio,
  input handling, or script playback. Exiting the game stops its runtime.
- Remote media URLs and HTMLAudioElement playback remain necessary for our
  existing media host, which does not grant fetch/WebAudio CORS. The upstream
  cache uses image elements for remote image loading and does not decode
  direct audio. Speculative page preloading is disabled in direct-media mode
  because the host rate-limits request bursts; current graphics and audio still
  load on demand. Same-origin/CORS WebAudio mode keeps upstream preloading.
- The shared flowchart component imports its stylesheet so it works without
  first opening Extras. MAO's aligned text-continuation correction remains.
- Converters accept upstream's `sources/` layout and the existing MAO raw-script
  location. Source directories are excluded from the public build.

## Validation

Run `npm ci`, `npm run test:runtime`, and `npm run build`.

For browser regression checks, install Playwright separately (or point
`PLAYWRIGHT_MODULE` at its module), start `npm start -- --port 5174`, and run:

```sh
TSUKI_TEST_URL=http://127.0.0.1:5174/tsukihime/ node tests/issues-browser-smoke.mjs
TSUKI_MEDIA_FIXTURES=1 node tests/upgrade-browser-smoke.mjs
node tests/live-media-smoke.mjs
```

Set `CHROME_PATH` to use an installed Chrome instead of Playwright's bundled
Chromium. Tests create isolated browser profiles; they do not use personal saves.
The browser checks cover imported MAO 0.7.7 and legacy regard-based saves,
persistence across reload, playback advancement, affection retention, media
providers, flowchart zoom, narrow-screen rendering, and reader isolation.
They are targeted runtime checks, not a complete route playthrough.

For repeated UI runs, `TSUKI_MEDIA_FIXTURES=1` serves synthetic images and silent
WAV data inside the isolated browser. This validates the runtime and controls
without stressing the external host, but does not verify live media delivery.
The host can respond with HTTP 429 during repeated tests; live playback should
be checked separately after allowing the host to recover.

Existing saves with missing affection values cannot recover those lost values.
Retain an exported save backup before moving between engine versions. The
pre-upgrade code is commit `7ec550a8`; a rollback should revert the engine upgrade
as a new linear commit and rebuild, preserving the issue fixes.
