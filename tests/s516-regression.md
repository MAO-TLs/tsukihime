# s516 literal-bracket crash regression — 2026-09-22

- Base: e501d3996aecbd77a093ae816f2687cf4960dd49.
- Original s516 text reproduced `Unknown bbcode tag REDACTED` using the actual browser BBCode renderer.
- Replaced only the literal redaction marker's ASCII brackets with fullwidth brackets in the scene and its full-script source. Formatting commands remain unchanged.
- All 25 s516 text lines rendered successfully with the fix.
- Played s516 through the local browser game, past the affected line and through the return to Endings.
- s516 is the eleventh Endings-menu entry, not the fifth (s515), despite saying “lesson five” in its dialogue.
- Runtime tests: 59 passed, including a corpus-wide unsupported-BBCode guard. Production build passed.
- No remote publication performed by this test.
