import assert from "node:assert/strict"
import {after, before, test} from "node:test"
import {createServer} from "vite"

class FakeAudioParam {
	value = 1

	setValueAtTime(value) {
		this.value = value
	}

	linearRampToValueAtTime(value) {
		this.value = value
	}

	exponentialRampToValueAtTime(value) {
		this.value = value
	}

	cancelScheduledValues() {}
}

class FakeGainNode {
	constructor(context, options = {}) {
		this.context = context
		this.gain = new FakeAudioParam()
		this.gain.value = options.gain ?? 1
	}

	connect() {}
	disconnect() {}
}

class FakeAudioContext {
	constructor() {
		this.currentTime = 0
		this.destination = {}
		this.state = "running"
	}

	createGain() {
		return new FakeGainNode(this)
	}

	async resume() {
		this.state = "running"
	}

	async suspend() {
		this.state = "suspended"
	}
}

class FakeEventTarget {
	listeners = new Map()
	visibilityState = "visible"

	addEventListener(type, listener) {
		if (!this.listeners.has(type))
			this.listeners.set(type, new Set())
		this.listeners.get(type).add(listener)
	}

	removeEventListener(type, listener) {
		this.listeners.get(type)?.delete(listener)
	}
}

class FakeAudio extends FakeEventTarget {
	loop = false
	muted = false
	paused = true
	preload = ""
	src = ""
	volume = 1
	pauseCalls = 0
	loadCalls = 0
	playGate = null

	async play() {
		if (this.playGate)
			await this.playGate
		this.paused = false
	}

	pause() {
		this.pauseCalls++
		this.paused = true
	}

	load() {
		this.loadCalls++
	}
}

globalThis.AudioContext = FakeAudioContext
globalThis.GainNode = FakeGainNode
globalThis.addEventListener = () => {}
globalThis.removeEventListener = () => {}
globalThis.document = new FakeEventTarget()

let server
let DirectMediaGameAudioManager

before(async () => {
	server = await createServer({
		root: new URL("..", import.meta.url).pathname,
		appType: "custom",
		logLevel: "silent",
		server: {middlewareMode: true},
		ssr: {noExternal: ["@tsukiweb/common"]},
	})
	;({DirectMediaGameAudioManager} = await server.ssrLoadModule(
		"/src/engine/DirectMediaGameAudioManager.ts",
	))
})

after(async () => {
	await server?.close()
})

function makeSettings(master = 10) {
	return {
		volume: {
			master,
			track: 8,
			se: 8,
			titleTrack: 8,
			systemSE: 6,
		},
		autoMute: false,
	}
}

function fixture(master = 10) {
	const elements = []
	const eventTarget = new FakeEventTarget()
	const manager = new DirectMediaGameAudioManager(
		makeSettings(master),
		id => `https://media.invalid/${id}.webm`,
		{
			createAudio: () => {
				const element = new FakeAudio()
				elements.push(element)
				return element
			},
			eventTarget,
			visibilityTarget: eventTarget,
		},
	)
	return {manager, elements}
}

async function settle() {
	await Promise.resolve()
	await Promise.resolve()
}

test("tracks and looped waves queued at zero volume restart when audible", async () => {
	const {manager, elements} = fixture(0)
	await manager.playTrack("track")
	await manager.playWave("one-shot", false)
	assert.equal(elements.length, 0)

	manager.masterVolume = 1
	await settle()

	assert.equal(elements.length, 1)
	assert.equal(elements[0].src, "https://media.invalid/track.webm")
	assert.equal(elements[0].loop, true)
	assert.equal(
		elements.some(element => element.src.endsWith("/one-shot.webm")),
		false,
	)

	manager.masterVolume = 0
	await manager.playWave("loop", true)
	manager.masterVolume = 1
	await settle()

	assert.equal(elements.length, 2)
	assert.equal(elements[1].src, "https://media.invalid/loop.webm")
	assert.equal(elements[1].loop, true)
	await manager.stopTrack()
	manager.stopWave()
})

test("stopWave captures waiters before stopping and resolves both callers", async () => {
	const {manager, elements} = fixture()
	await manager.playWave("wave")
	const priorWaiter = manager.waitWaveEnd()
	const stopped = manager.stopWave(true)

	assert.ok(stopped instanceof Promise)
	await Promise.all([priorWaiter, stopped])
	assert.equal(elements[0].pauseCalls, 1)
	assert.equal(elements[0].src, "")
})

test("a stale wave play completion cannot stop its replacement", async () => {
	const elements = []
	const eventTarget = new FakeEventTarget()
	let releaseFirst
	const firstGate = new Promise(resolve => {
		releaseFirst = resolve
	})
	const manager = new DirectMediaGameAudioManager(
		makeSettings(),
		id => `https://media.invalid/${id}.webm`,
		{
			createAudio: () => {
				const element = new FakeAudio()
				if (elements.length === 0)
					element.playGate = firstGate
				elements.push(element)
				return element
			},
			eventTarget,
			visibilityTarget: eventTarget,
		},
	)

	const firstPlay = manager.playWave("first")
	await settle()
	await manager.playWave("second")
	releaseFirst()
	await firstPlay

	assert.equal(elements[0].pauseCalls, 1)
	assert.equal(elements[0].src, "")
	assert.equal(elements[1].pauseCalls, 0)
	assert.equal(elements[1].src, "https://media.invalid/second.webm")
	manager.stopWave()
})
