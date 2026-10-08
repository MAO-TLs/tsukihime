import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import {after, before, test} from "node:test"
import {fileURLToPath} from "node:url"
import {createServer, type ViteDevServer} from "vite"

class FakeAudio {
	inGame = false
	played: string[] = []
	trackStops = 0
	waveStops = 0

	playTrack(track: string) {
		this.played.push(track)
	}

	stopTrack() {
		this.trackStops++
	}

	stopWave() {
		this.waveStops++
	}
}

const projectRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
)

let server: ViteDevServer
let SCREEN: Record<string, string>
let appLocationString: (
	location: {pathname: string; search?: string; hash?: string},
	baseUrl: string,
) => string
let normalizeAppPathname: (pathname: string, baseUrl: string) => string
let prepareSearchText: (...values: Array<string | undefined>) => {spaced: string; compact: string}
let normalizeSearchText: (value: string) => string
let matchesSearchText: (query: string, text: {spaced: string; compact: string}) => boolean
let syncAudioForScreen: (
	audio: FakeAudio,
	titleTrack: string,
	screen: string,
) => void

before(async () => {
	server = await createServer({
		root: projectRoot,
		appType: "custom",
		logLevel: "silent",
		server: {middlewareMode: true},
		ssr: {noExternal: ["@tsukiweb/common"]},
	})
	;({SCREEN} = await server.ssrLoadModule("/src/app/utils/display.ts"))
	;({appLocationString, normalizeAppPathname} = await server.ssrLoadModule(
		"/src/app/utils/route-location.ts",
	))
	;({syncAudioForScreen} = await server.ssrLoadModule(
		"/src/engine/audio-screen.ts",
	))
	;({prepareSearchText, normalizeSearchText, matchesSearchText} = await server.ssrLoadModule(
		"/src/features/mao-reader/search-text.ts",
	))
})

after(async () => {
	await server?.close()
})

test("reader locations compare equally with or without the GitHub Pages trailing slash", () => {
	assert.equal(normalizeAppPathname("/tsukihime/script/", "/tsukihime/"), "/script")
	assert.equal(normalizeAppPathname("/tsukihime/script", "/tsukihime/"), "/script")
	assert.equal(normalizeAppPathname("/tsukihime/audit/", "/tsukihime/"), "/audit")
	assert.equal(appLocationString({
		pathname: "/tsukihime/script/",
		search: "?route=arc&script=script-001",
		hash: "#line-1",
	}, "/tsukihime/"), "/script?route=arc&script=script-001#line-1")
})

test("reader animation keys stay stable across the first search URL replacement", async () => {
	for (const [before, after] of [
		["/script/", "/script?q=Arcueid"],
		["/audit/", "/audit?dossier=01"],
	]) {
		assert.equal(
			normalizeAppPathname(before.split('?')[0], "/tsukihime/"),
			normalizeAppPathname(after.split('?')[0], "/tsukihime/"),
		)
	}
	const routes = await fs.readFile(path.join(projectRoot, "src/app/components/AnimatedRoutes.tsx"), "utf8")
	assert.match(routes, /const pathname = normalizeAppPathname\(location\.split\('\?'\)\[0\], import\.meta\.env\.BASE_URL\)/)
	assert.match(routes, /const keyPresence = isExtra \? "extra" : pathname/)
})

test("search query echoes cannot requeue passage focus", async () => {
	const reader = await fs.readFile(path.join(projectRoot, "src/features/mao-reader/ScriptReader.tsx"), "utf8")
	const locationSync = reader.slice(
		reader.indexOf("if (previousInitialLocationKey.current === initialLocationKey)"),
		reader.indexOf("// URL updates echo the query"),
	)
	assert.match(locationSync, /setQuery\(initialQuery\)/)
	assert.doesNotMatch(locationSync, /setPendingRef/)
	assert.match(reader, /setPendingRef\(initialScope === "script" \? initialRef : undefined\)\s*\}, \[initialRef, initialScope, initialScriptId, initialSectionId\]\)/)
	// Actual passage navigation must still request scrolling/focus.
	assert.match(reader, /const \[pendingRef, setPendingRef\] = useState\(initialRef\)/)
	assert.match(reader, /setActiveRef\(ref\)\s*setPendingRef\(ref\)/)
	assert.match(reader, /target\.focus\(\{preventScroll: true\}\)/)
})

test("cached search preserves case, width, whitespace, and engine-command handling", () => {
	const text = prepareSearchText("TSUKI:001", "Ａｒｃｕｅｉｄ", "月\n姫", "#ff0000\nThe!w1000 forest.\n#ffffff", undefined)
	for (const query of ["", "arcueid", "ＡＲＣＵＥＩＤ", "月姫", "月 姫", "the forest", "tsuki:001"])
		assert.equal(matchesSearchText(normalizeSearchText(query), text), true, query)
	for (const query of ["!w1000", "#ff0000", "does not exist"])
		assert.equal(matchesSearchText(normalizeSearchText(query), text), false, query)
	assert.equal(matchesSearchText("comparator", prepareSearchText("Japanese", "MAO English")), false)
	assert.equal(matchesSearchText("comparator", prepareSearchText("Japanese", "MAO English", "Comparator text")), true)
})

test("reader caches passage text separately from deferred-query filtering", async () => {
	const reader = await fs.readFile(path.join(projectRoot, "src/features/mao-reader/ScriptReader.tsx"), "utf8")
	assert.match(reader, /const globalSearchIndex = useMemo\([\s\S]*?\[globalResource, showMirrorMoon\]\)/)
	assert.match(reader, /const globalMatches = useMemo\([\s\S]*?\[globalSearchIndex, deferredQuery\]\)/)
	assert.match(reader, /const localLines = useMemo\([\s\S]*?\[localSearchIndex, deferredQuery\]\)/)
})

test("public pages stop all game media while game routes retain their intended audio", () => {
	for (const screen of [SCREEN.HOME, SCREEN.SCRIPT, SCREEN.AUDIT]) {
		const audio = new FakeAudio()
		syncAudioForScreen(audio, "title", screen)
		assert.equal(audio.inGame, false, screen)
		assert.equal(audio.trackStops, 1, screen)
		assert.equal(audio.waveStops, 1, screen)
		assert.deepEqual(audio.played, [], screen)
	}

	const titleAudio = new FakeAudio()
	syncAudioForScreen(titleAudio, "title", SCREEN.TITLE)
	assert.equal(titleAudio.inGame, false)
	assert.equal(titleAudio.waveStops, 1)
	assert.equal(titleAudio.trackStops, 0)
	assert.deepEqual(titleAudio.played, ["title"])

	const gameAudio = new FakeAudio()
	syncAudioForScreen(gameAudio, "title", SCREEN.WINDOW)
	assert.equal(gameAudio.inGame, true)
	assert.equal(gameAudio.waveStops, 0)
	assert.equal(gameAudio.trackStops, 0)
	assert.deepEqual(gameAudio.played, [])
})

test("the router lazy-loads game owners and the game manager tears down on unmount", async () => {
	const [routes, manager] = await Promise.all([
		fs.readFile(path.join(projectRoot, "src/app/components/AnimatedRoutes.tsx"), "utf8"),
		fs.readFile(path.join(projectRoot, "src/features/game/hooks/useScriptManager.ts"), "utf8"),
	])

	assert.match(routes, /const Window = lazy\(\(\) => import\("app\/screens\/Window"\)\)/)
	assert.match(routes, /const TitleMenuScreen = lazy\(\(\) => import\("app\/screens\/TitleMenuScreen"\)\)/)
	assert.match(routes, /appLocationString\(window\.location, import\.meta\.env\.BASE_URL\)/)
	assert.match(routes, /lastReplacement\.current === destination/)
	assert.match(manager, /script\.stop\(\)/)
	assert.match(manager, /actionsHandler\.onScriptChange\(null\)/)
	assert.match(manager, /audio\.stopWave\(\)/)
})
