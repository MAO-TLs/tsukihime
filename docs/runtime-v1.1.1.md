# Runtime hotfix 1.1.1

The translation remains script version v2.0.0.

- Repair 138 exposed color markers across 11 scenes. Retained source markers now anchor the matching color commands, with command order and prose preserved.
- Compile search queries once and reuse normalized passages. Avoid rerendering unchanged script rows while typing. Whole-word English matching and Japanese search behavior are unchanged.
- Bump the runtime asset version so scene requests do not reuse the earlier cached files.

Verified by the full runtime regression suite, production build, whole-corpus English typography checks, and browser search/focus checks. The scan benchmark is not a guarantee of end-to-end performance on every device. No full game playthrough was performed.
