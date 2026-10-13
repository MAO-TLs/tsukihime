import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('reader uses the shared script-version label', () => {
  assert.ok(read("src/features/mao-reader/MaoReaderShell.tsx").includes("Script version ${translationVersion}"));
});

test('GitHub navigation opens this title repository', () => {
  for (const file of ["src/features/mao-site/MaoSiteNav.tsx"]) {
    const text = read(file);
    assert.ok(text.includes('href="https://github.com/MAO-TLs/tsukihime">GitHub</a>'), file);
    assert.ok(!text.includes('href="https://github.com/MAO-TLs">GitHub</a>'), file);
  }
});

test('browser edition does not advertise a patch installation', () => {
  const home = read("src/features/mao-site/TsukihimeReleasePage.tsx");
  assert.ok(home.includes('No download required'));
  assert.ok(!home.includes('Installation instructions'));
});

