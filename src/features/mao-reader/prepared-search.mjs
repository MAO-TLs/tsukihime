import {normalizeReaderSearch} from './reader-search.mjs';

const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const word = /[\p{L}\p{M}\p{N}_]/u;
const isWord = c => Boolean(c) && word.test(c) && !japanese.test(c);

// Compile query-dependent work once. Passage normalization belongs to the
// index construction, never to a per-keystroke full-corpus scan.
export function compileSearch(query) {
  const needle = normalizeReaderSearch(query);
  if (!needle) return () => true;
  const chars = Array.from(needle);
  const left = isWord(chars[0]), right = isWord(chars.at(-1));
  const compact = japanese.test(needle) ? needle.replace(/\s/gu, '') : null;
  function contains(text, term) {
    for (let start = text.indexOf(term); start >= 0; start = text.indexOf(term, start + 1)) {
      const end = start + term.length;
      const before = start ? String.fromCodePoint(text.codePointAt(start - (/[\uDC00-\uDFFF]/u.test(text[start - 1]) ? 2 : 1))) : '';
      const after = end < text.length ? String.fromCodePoint(text.codePointAt(end)) : '';
      if ((!left || !isWord(before)) && (!right || !isWord(after))) return true;
    }
    return false;
  }
  return text => contains(text.spaced, needle) || Boolean(compact && contains(text.compact, compact));
}
