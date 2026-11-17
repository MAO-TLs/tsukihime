import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {repairColorControls} from '../tools/repair-color-controls.mjs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('promotes retained colors and removes their late projected duplicates', () => {
  const input = '`#ff0000The red haze\ntextcolor #ff0000\n` spread.@\n`#ffffff\n`Someone approached\ntextcolor #ffffff\n` openly.@';
  const expected = 'textcolor #ff0000\n`The red haze spread.@\ntextcolor #ffffff\n`Someone approached openly.@';
  assert.equal(repairColorControls(input, true), expected);
  assert.equal(repairColorControls(expected, true), expected);
  assert.equal(repairColorControls('bg #ff0000,notrans,0\n`A normal line.', true), 'bg #ff0000,notrans,0\n`A normal line.');
});

test('all shipped English scenes exclude literal color codes in prose', () => {
  const root = new URL('../public/static/en-mao/scenes/', import.meta.url);
  for (const file of fs.readdirSync(root).filter(x => x.endsWith('.txt'))) {
    const text = fs.readFileSync(new URL(file, root), 'utf8');
    assert.doesNotMatch(text, /^`.*#[\da-f]{6}/im, file);
    assert.doesNotMatch(text, /^`.*(?:<|\[|@)(?:ruby|rt|furigana)\b/im, file);
  }
  const scene = fs.readFileSync(new URL('s416.txt', root), 'utf8');
  assert.ok(scene.includes('textcolor #ff0000\n`The red haze spread.@\ntextcolor #ffffff\n`Someone approached openly,'));
});

test('whole reader corpus renders English without ruby annotations', () => {
  const root = new URL('../public/static/mao-audit/scripts/', import.meta.url);
  let fields = 0;
  for (const file of fs.readdirSync(root).filter(x => x.endsWith('.json'))) {
    const data = JSON.parse(fs.readFileSync(new URL(file, root), 'utf8'));
    for (const line of data.lines) for (const key of ['maoEnglish', 'mirrorMoon']) {
      if (!line[key]) continue;
      assert.doesNotMatch(line[key], /(?:<|\[|@)(?:ruby|rt|furigana)\b/i);
      const markup = renderToStaticMarkup(createElement('p', null, line[key]));
      assert.doesNotMatch(markup, /<(?:ruby|rt)\b/i);
      fields++;
    }
  }
  assert.ok(fields >= 14620);
});

test('early projected controls move forward without deleting source controls', () => {
  const input = '`I was\ntextcolor #ff0000\n` faster.@\n`#ff0000No.@ The red\ntextcolor #ffffff\n` hair was near.@\n`#ffffff\n`I ran.';
  assert.equal(repairColorControls(input, true), '`I was faster.@\ntextcolor #ff0000\n`No.@ The red hair was near.@\ntextcolor #ffffff\n`I ran.');
  assert.throws(() => repairColorControls('`#ff0000Unwitnessed', true), /Unwitnessed/);
});
