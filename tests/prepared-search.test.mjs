import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileSearch} from '../src/features/mao-reader/prepared-search.mjs';
import {matchesReaderText, normalizeReaderSearch} from '../src/features/mao-reader/reader-search.mjs';

test('compiled matcher preserves the shared whole-word and Japanese contract', () => {
  for (const text of ['adorable Dora', 'Dora-chan', 'Ｄｏｒａ', 'Doraé', '😀 Dora', '彼\n女を見た', 'The red\n door.', 'oﬃce', 'cafe\u0301']) {
    const spaced = normalizeReaderSearch(text);
    const indexed = {spaced, compact: spaced.replace(/\s/gu, '')};
    for (const query of ['dora', 'DORA', '彼女', 'red door', 'red', 'office', 'café', '😀', '', '['])
      assert.equal(compileSearch(query)(indexed), matchesReaderText(text, query), JSON.stringify({text, query}));
  }
});

test('full-corpus result parity and scan timing', () => {
  const {entries} = JSON.parse(fs.readFileSync(new URL('../public/static/mao-audit/search-index.json', import.meta.url), 'utf8'));
  const index = entries.map(e => {
    const spaced = normalizeReaderSearch([e.ref, e.speaker, e.japanese, e.maoEnglish].filter(Boolean).join('\n'));
    return {spaced, compact: spaced.replace(/\s/gu, '')};
  });
  let oldMs = 0, newMs = 0;
  for (const query of ['a', 'the', 'shiki', 'red haze', 'アルクェイド', '彼女', 'notfoundxyz']) {
    let start = performance.now();
    const old = index.map(t => matchesReaderText(t.spaced, query));
    oldMs += performance.now() - start;
    const match = compileSearch(query);
    start = performance.now();
    const next = index.map(match);
    newMs += performance.now() - start;
    assert.deepEqual(next, old, query);
  }
  console.log(JSON.stringify({passages: entries.length, queries: 7, previousScanMs: oldMs, preparedScanMs: newMs}));
});
