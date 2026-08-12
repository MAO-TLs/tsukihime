import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {Route, Router} from 'wouter'

import {isExcludedPublicPath, isPrivateClosurePath} from '../tools/safe-public-assets.mjs'
import {SPA_DEEP_ENTRY_DIRECTORIES} from '../tools/spa-deep-entries.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const auditRoot = path.join(projectRoot, 'public/static/mao-audit')

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

async function loadJson(relativePath) {
	return JSON.parse(await fs.readFile(path.join(auditRoot, relativePath), 'utf8'))
}

async function listFiles(directory, base = directory) {
	const entries = await fs.readdir(directory, {withFileTypes: true})
	entries.sort((left, right) => left.name.localeCompare(right.name))
	const files = []
	for (const entry of entries) {
		const absolutePath = path.join(directory, entry.name)
		if (entry.isDirectory())
			files.push(...await listFiles(absolutePath, base))
		else if (entry.isFile())
			files.push(path.relative(base, absolutePath).split(path.sep).join('/'))
		else
			throw Error(`unsupported public audit entry: ${absolutePath}`)
	}
	return files
}

test('the public audit package has the frozen 62/14620/1500 contract', async () => {
	const manifest = await loadJson('manifest.json')
	const findings = await loadJson('findings.json')
	const searchIndex = await loadJson('search-index.json')

	assert.equal(manifest.translationVersion, 'v1.1.2')
	assert.equal(manifest.scriptCount, 62)
	assert.equal(manifest.scripts.length, 62)
	assert.equal(new Set(manifest.scripts.map(script => script.id)).size, 62)
	assert.equal(
		manifest.scripts.reduce((total, script) => total + script.lineCount, 0),
		14620,
	)
	assert.equal(manifest.lineCount, 14620)
	assert.equal(searchIndex.entryCount, 14620)
	assert.equal(searchIndex.entries.length, 14620)
	assert.equal(manifest.findingCount, 1500)
	assert.equal(findings.findingCount, 1500)
	assert.equal(Object.keys(findings.findingsById).length, 1500)
})

test('all manifest-bound public artifacts match their bytes and hashes', async () => {
	const manifest = await loadJson('manifest.json')
	const artifacts = [
		manifest.artifacts.dossiers,
		manifest.artifacts.findings,
		manifest.artifacts.searchIndex,
		...manifest.artifacts.scripts,
	]
	assert.equal(artifacts.length, 65)

	for (const artifact of artifacts) {
		assert.equal(path.isAbsolute(artifact.path), false, artifact.path)
		assert.equal(artifact.path.includes('..'), false, artifact.path)
		const bytes = await fs.readFile(path.join(auditRoot, artifact.path))
		assert.equal(bytes.length, artifact.byteCount, artifact.path)
		assert.equal(sha256(bytes), artifact.sha256, artifact.path)
	}
})

test('the L’Arc-en-Ciel correction is identical in the public script and search index', async () => {
	const [script, searchIndex] = await Promise.all([
		loadJson('scripts/script-012.json'),
		loadJson('search-index.json'),
	])
	const expected = '“For the last time, who’s this L’Arc-en-Ciel you keep talking about? What’s wrong with you, Tohno? Did your brain get fried while you were sick?”\nArihiko’s joke barely reaches me.'
	const scriptLine = script.lines.find(line => line.ref === 'tsuki:mm-audit:02368')
	const searchLine = searchIndex.entries.find(line => line.ref === 'tsuki:mm-audit:02368')

	assert.equal(scriptLine?.maoEnglish, expected)
	assert.equal(scriptLine?.mao_english, expected)
	assert.equal(scriptLine?.mao_english_sha256, sha256(expected))
	assert.equal(searchLine?.maoEnglish, expected)
	assert.doesNotMatch(JSON.stringify([scriptLine, searchLine]), /La-Rocque/)
})

test('the public dossier package contains exactly 23 final dossiers', async () => {
	const dossiers = await loadJson('dossiers.json')
	const expectedIds = Array.from({length: 23}, (_, index) => String(index + 1).padStart(2, '0'))

	assert.equal(dossiers.counts.dossiers, 23)
	assert.equal(dossiers.dossiers.length, 23)
	assert.deepEqual(dossiers.dossier_ids, expectedIds)
	assert.deepEqual(dossiers.dossiers.map(dossier => dossier.id), expectedIds)
	assert.equal(dossiers.counts.finding_memberships, 569)
	assert.equal(dossiers.counts.counterexample_memberships, 179)
})

test('the curated mao-audit directory contains no raw or private closure paths', async () => {
	const files = await listFiles(auditRoot)
	assert.equal(files.length, 66)
	assert.deepEqual(
		files.filter(file => !/^scripts\/script-\d{3}\.json$/.test(file)).sort(),
		['dossiers.json', 'findings.json', 'manifest.json', 'search-index.json'],
	)

	for (const file of files) {
		const publicPath = `static/mao-audit/${file}`
		assert.equal(isExcludedPublicPath(publicPath), false, publicPath)
		assert.equal(isPrivateClosurePath(publicPath), false, publicPath)
		assert.doesNotMatch(file, /(?:^|\/)(?:en-mm|inputs|ledgers?|authority)(?:\/|$)/i)
		assert.doesNotMatch(file, /(?:\.jsonl|freeze(?:[_-]manifest)?\.json)$/i)
	}
})

test('GitHub Pages deep entries match the play and reader routes with the project base', () => {
	assert.deepEqual(SPA_DEEP_ENTRY_DIRECTORIES, ['play', 'script', 'audit'])

	for (const [entry, route] of [
		['/tsukihime/play/', '/play'],
		['/tsukihime/script/', '/script'],
		['/tsukihime/audit/', '/audit'],
	]) {
		const markup = renderToStaticMarkup(
			React.createElement(
				Router,
				{base: '/tsukihime', ssrPath: entry},
				React.createElement(Route, {path: route}, 'reader-route-match'),
			),
		)
		assert.equal(markup, 'reader-route-match', entry)
	}
})

test('release, script, and audit share one compact mobile header geometry', async () => {
	const [siteStyles, readerStyles, navigation] = await Promise.all([
		fs.readFile(path.join(projectRoot, 'src/features/mao-site/mao-site.scss'), 'utf8'),
		fs.readFile(path.join(projectRoot, 'src/features/mao-reader/mao-reader-template.css'), 'utf8'),
		fs.readFile(path.join(projectRoot, 'src/features/mao-site/MaoSiteNav.tsx'), 'utf8'),
	])

	assert.match(siteStyles, /@media \(max-width: 480px\)[\s\S]*?\.mao-site-wordmark \{ max-width: 72px; line-height: 1\.15; \}[\s\S]*?\.mao-site-nav-links \{ gap: 11px; font-size: 11px; \}/)
	assert.match(readerStyles, /@media \(max-width: 480px\)[\s\S]*?\.reader-page \.wordmark \{ max-width: 72px; line-height: 1\.15; \}[\s\S]*?\.reader-page \.nav-links \{ gap: 11px; font-size: 11px; \}/)
	assert.match(readerStyles, /\.reader-page \{[\s\S]*?color-scheme: light;/)
	assert.match(readerStyles, /\.reader-page \.audit-dossier-toggle \{[^}]*font-family: var\(--mono\);[^}]*font-size: 9px;[^}]*text-transform: uppercase;/)
	assert.match(readerStyles, /\.reader-page \.audit-permalink \{[\s\S]*?font-family: var\(--mono\);[\s\S]*?font-size: 9px;[\s\S]*?text-transform: uppercase;/)
	assert.match(navigation, /href="https:\/\/github\.com\/MAO-TLs\/tsukihime">GitHub<\/a>/)
})

test('release, script, and audit restore normal document text selection', async () => {
	const [gameStyles, siteStyles, readerStyles] = await Promise.all([
		fs.readFile(path.join(projectRoot, 'tsukiweb-common/src/styles/main.scss'), 'utf8'),
		fs.readFile(path.join(projectRoot, 'src/features/mao-site/mao-site.scss'), 'utf8'),
		fs.readFile(path.join(projectRoot, 'src/features/mao-reader/mao-reader.scss'), 'utf8'),
	])

	// The visual-novel shell deliberately suppresses selection. Public document
	// hosts must take ownership back instead of inheriting that game behavior.
	assert.match(gameStyles, /html, body \{[\s\S]*?user-select: none;/)
	assert.match(siteStyles, /\.tsuki-release-page \{[\s\S]*?-webkit-user-select: text;[\s\S]*?user-select: text;/)
	assert.match(readerStyles, /\.mao-reader-shell \{[\s\S]*?-webkit-user-select: text;[\s\S]*?user-select: text;/)
})

test('Tsukihime keeps WHITE ALBUM 2 publication typography through the app reset', async () => {
	const [siteStyles, readerHostStyles, auditReader, readerStates] = await Promise.all([
		fs.readFile(path.join(projectRoot, 'src/features/mao-site/mao-site.scss'), 'utf8'),
		fs.readFile(path.join(projectRoot, 'src/features/mao-reader/mao-reader.scss'), 'utf8'),
		fs.readFile(path.join(projectRoot, 'src/features/mao-reader/AuditReader.tsx'), 'utf8'),
		fs.readFile(path.join(projectRoot, 'src/features/mao-reader/ReaderStates.tsx'), 'utf8'),
	])

	assert.match(siteStyles, /\.mao-site-nav-links \{[\s\S]*?a \{ padding-block: 8px; font-weight: 600; \}/)
	assert.match(siteStyles, /\.tsuki-release-page \.mao-site-eyebrow \{ margin: 0 0 18px; \}/)
	assert.match(readerHostStyles, /\.mao-reader-shell \{[\s\S]*?color-scheme: only light;[\s\S]*?font-synthesis: initial;[\s\S]*?-webkit-font-smoothing: auto;[\s\S]*?-moz-osx-font-smoothing: auto;/)
	assert.match(auditReader, /className="mao-reader-kicker eyebrow">Completed corpus review<\/p>/)
	assert.match(auditReader, /className="mao-reader-kicker eyebrow">Work-wide dossiers<\/p>/)
	assert.match(readerStates, /className="mao-reader-kicker eyebrow">Data unavailable<\/p>/)
})

test('the release hero inherits the canonical WHITE ALBUM 2 title rhythm', async () => {
	const siteStyles = await fs.readFile(
		path.join(projectRoot, 'src/features/mao-site/mao-site.scss'),
		'utf8',
	)

	assert.match(siteStyles, /\.tsuki-release-hero h1 \{[\s\S]*?font-size: clamp\(76px, 9\.2vw, 138px\);[\s\S]*?letter-spacing: -\.07em;[\s\S]*?line-height: \.76;/)
})

test('the play menu exit returns to the Tsukihime release page', async () => {
	const [source, defaultStrings, maoStrings] = await Promise.all([
		fs.readFile(path.join(projectRoot, 'src/app/screens/TitleMenuScreen.tsx'), 'utf8'),
		fs.readFile(path.join(projectRoot, 'src/assets/lang/default.json'), 'utf8').then(JSON.parse),
		fs.readFile(path.join(projectRoot, 'public/static/en-mao/lang.json'), 'utf8').then(JSON.parse),
	])

	assert.match(source, /onClick=\{\(\) => window\.location\.assign\(import\.meta\.env\.BASE_URL\)\}/)
	assert.match(source, /\{strings\.title\.exit\}/)
	assert.equal(defaultStrings.title.exit, 'Exit')
	assert.equal(maoStrings.title.exit, 'Exit')
})

test('release, script, and audit routes do not own the game audio runtime', async () => {
	const [routes, releasePage, audioSource, audioScreen] = await Promise.all([
		fs.readFile(path.join(projectRoot, 'src/app/components/AnimatedRoutes.tsx'), 'utf8'),
		fs.readFile(path.join(projectRoot, 'src/features/mao-site/TsukihimeReleasePage.tsx'), 'utf8'),
		fs.readFile(path.join(projectRoot, 'src/engine/audio.ts'), 'utf8'),
		fs.readFile(path.join(projectRoot, 'src/engine/audio-screen.ts'), 'utf8'),
	])

	assert.match(releasePage, /useScreenAutoNavigate\(SCREEN\.HOME\)/)
	assert.doesNotMatch(routes, /useScreenAutoNavigate\(page/)
	assert.match(routes, /const TitleMenuScreen = lazy\(\(\) => import\("app\/screens\/TitleMenuScreen"\)\)/)
	assert.match(routes, /const Window = lazy\(\(\) => import\("app\/screens\/Window"\)\)/)
	assert.match(routes, /const routeScreen = screenForPathname\(pathname\)/)
	assert.match(audioSource, /import \{ syncAudioForScreen \} from "\.\/audio-screen"/)
	assert.match(audioScreen, /audio\.stopWave\(\)[\s\S]*?isGameScreen\(screen\)[\s\S]*?audio\.playTrack\(titleTrack\)[\s\S]*?audio\.stopTrack\(\)/)
	assert.match(audioSource, /waitLanguageLoad\(\)[\s\S]*?syncAudioForScreen\(audio, settings\.titleMusic, displayMode\.screen\)/)
})

test('reader hides inline waits at the display boundary and preserves source timing data', async () => {
	const [scriptReader, highlightedText, displayText, packagedScript] = await Promise.all([
		fs.readFile(path.join(projectRoot, 'src/features/mao-reader/ScriptReader.tsx'), 'utf8'),
		fs.readFile(path.join(projectRoot, 'src/features/mao-reader/HighlightedText.tsx'), 'utf8'),
		fs.readFile(path.join(projectRoot, 'src/features/mao-reader/display-text.ts'), 'utf8'),
		fs.readFile(path.join(projectRoot, 'public/static/mao-audit/scripts/script-004.json'), 'utf8'),
	])

	assert.match(displayText, /text\.replace\(INLINE_WAIT_COMMAND, ""\)/)
	assert.match(scriptReader, /stripInlineWaitCommands\(line\.maoEnglish\)/)
	assert.match(highlightedText, /stripInlineWaitCommands\(text\.slice\(rangeStart, rangeEnd\)\)/)
	assert.match(packagedScript, /そのまま――――!w1000/)
})

test('reader query and hash navigation remain URL-addressable without dynamic dossier paths', async () => {
	const source = await fs.readFile(
		path.join(projectRoot, 'src/app/components/AnimatedRoutes.tsx'),
		'utf8',
	)

	assert.match(source, /new URLSearchParams\(window\.location\.search\)/)
	assert.match(source, /initialScriptId=\{query\.get\("script"\) \?\? undefined\}/)
	assert.match(source, /initialSectionId=\{query\.get\("route"\) \?\? undefined\}/)
	assert.match(source, /initialScope=\{query\.get\("scope"\) === "all" \? "all" : "script"\}/)
	assert.match(source, /initialQuery=\{query\.get\("q"\) \?\? ""\}/)
	assert.match(source, /initialFilterSectionId=\{query\.get\("section"\) \?\? undefined\}/)
	assert.match(source, /query\.get\("compare"\) === "mirror-moon"/)
	assert.match(source, /query\.get\("errors"\) === "mirror-moon"/)
	assert.match(source, /initialDossierId=\{query\.get\("dossier"\) \?\? undefined\}/)
	assert.match(source, /initialRef=\{page === "script" \? readerHash\(\) : undefined\}/)
	assert.match(source, /params\.set\("script", next\.scriptId\)/)
	assert.match(source, /params\.set\("route", next\.sectionId\)/)
	assert.match(source, /params\.set\("scope", "all"\)/)
	assert.match(source, /params\.set\("section", next\.filterSectionId\)/)
	assert.match(source, /params\.set\("compare", "mirror-moon"\)/)
	assert.match(source, /params\.set\("errors", "mirror-moon"\)/)
	assert.match(source, /params\.set\("dossier", next\.dossierId\)/)
	assert.match(source, /encodeURIComponent\(next\.ref\)/)
	assert.match(source, /decodeURIComponent\(hash\)/)

	const scriptUrl = new URL(
		'/tsukihime/script/?script=script-007#tsuki%3Amm-audit%3A04624',
		'https://mao-tls.github.io',
	)
	assert.equal(scriptUrl.pathname, '/tsukihime/script/')
	assert.equal(scriptUrl.searchParams.get('script'), 'script-007')
	assert.equal(decodeURIComponent(scriptUrl.hash.slice(1)), 'tsuki:mm-audit:04624')

	const concordanceUrl = new URL(
		'/tsukihime/script/?scope=all&q=%E5%90%B8%E8%A1%80%E9%AC%BC&section=ark&compare=mirror-moon&errors=mirror-moon',
		'https://mao-tls.github.io',
	)
	assert.equal(concordanceUrl.searchParams.get('scope'), 'all')
	assert.equal(concordanceUrl.searchParams.get('q'), '吸血鬼')
	assert.equal(concordanceUrl.searchParams.get('section'), 'ark')
	assert.equal(concordanceUrl.searchParams.get('compare'), 'mirror-moon')
	assert.equal(concordanceUrl.searchParams.get('errors'), 'mirror-moon')

	const auditUrl = new URL(
		'/tsukihime/audit/?dossier=09',
		'https://mao-tls.github.io',
	)
	assert.equal(auditUrl.pathname, '/tsukihime/audit/')
	assert.equal(auditUrl.searchParams.get('dossier'), '09')
	assert.equal(auditUrl.hash, '')
	assert.equal(auditUrl.pathname.includes('/dossier/'), false)
})
