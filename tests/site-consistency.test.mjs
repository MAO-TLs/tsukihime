import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldPushReaderContext } from '../src/app/utils/route-location.ts';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('reader uses the shared script-version label', () => {
  assert.ok(read("src/features/mao-reader/MaoReaderShell.tsx").includes("Script version ${translationVersion}"));
});

test('opening a corpus result creates history, while typing and URL echoes do not', () => {
  const search = '/script?scope=all&q=Arcueid&compare=mirror-moon';
  const context = '/script?route=arcueid-ciel&script=script-004&compare=mirror-moon#tsuki%3Amm-audit%3A00601';
  assert.equal(shouldPushReaderContext(search,context),true);
  assert.equal(shouldPushReaderContext(search,search+'&errors=mirror-moon'),false);
  assert.equal(shouldPushReaderContext(context,context),false);
  assert.equal(shouldPushReaderContext(context,search),false);
  assert.ok(read('src/app/components/AnimatedRoutes.tsx').includes('replace: !shouldPushReaderContext(current, destination)'));
  assert.ok(read('src/features/mao-reader/ScriptReader.tsx').includes('onOpen={item => { setQuery(""); setScope("script");'));
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

