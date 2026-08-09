# Tsukihime — MAO Translations

The complete MAO English browser edition of *Tsukihime* (2000), including:

- the visual novel in the browser with music, artwork, choices, saves, and flowchart;
- 14,620 aligned Japanese and English passages in the public script browser;
- an optional line-by-line comparison with the earlier mirror moon English;
- a source-bound public audit with 1,500 adjudicated findings and 23 work-wide dossiers.

The published edition is available at <https://mao-tls.github.io/tsukihime/>.

## Local development

Node.js 22.18 or newer is required.

1. Clone the repository with its submodule: `git clone --recursive https://github.com/MAO-TLs/tsukihime.git`
2. Install dependencies: `npm ci`
3. Start the local server: `npm start`
4. Open the address printed by Vite.

Run `npm run test:runtime` for the publication and engine checks. Run `npm run build` to produce the deployable site in `dist/`.

## Credits and provenance

Translation: MAO Translations. Browser engine: [Tsukiweb](https://github.com/requinDr/tsukiweb-public), with its upstream project and contributors credited here and in the browser edition. *Tsukihime* is a work by TYPE-MOON. This unofficial, noncommercial fan translation is not affiliated with or endorsed by TYPE-MOON.
