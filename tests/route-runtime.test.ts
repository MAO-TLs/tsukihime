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
