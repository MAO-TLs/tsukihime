import assert from "node:assert/strict"
import test from "node:test"
import {
	DirectMediaAudioNode,
	type DirectMediaClock,
	type DirectMediaElement,
	type DirectMediaEventTarget,
} from "../src/engine/DirectMediaAudioNode.ts"

class FakeEventTarget implements DirectMediaEventTarget {
	private listeners = new Map<string, Set<EventListener>>()

	addEventListener(type: string, listener: EventListener) {
		if (!this.listeners.has(type))
			this.listeners.set(type, new Set())
		this.listeners.get(type)!.add(listener)
	}

	removeEventListener(type: string, listener: EventListener) {
		this.listeners.get(type)?.delete(listener)
	}

	dispatch(type: string) {
		for (const listener of [...(this.listeners.get(type) ?? [])])
			listener(new Event(type))
	}

	count(type: string) {
		return this.listeners.get(type)?.size ?? 0
	}
}

class FakeAudio extends FakeEventTarget implements DirectMediaElement {
	crossOrigin = "untouched"
	loop = false
	muted = false
	paused = true
	preload = ""
	src = ""
	volume = 1
	playCalls = 0
	pauseCalls = 0
	loadCalls = 0
	playErrors: Array<{name: string}> = []
	playGate: Promise<void> | null = null

	async play() {
		this.playCalls++
		const error = this.playErrors.shift()
		if (error)
			throw error
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

class FakeClock implements DirectMediaClock {
	private time = 0
	private nextId = 1
	private timers = new Map<
		number,
		{at: number, callback: VoidFunction}
	>()

	now() {
		return this.time
	}

	setTimeout(callback: VoidFunction, delay: number) {
		const id = this.nextId++
		this.timers.set(id, {at: this.time + delay, callback})
		return id as unknown as ReturnType<typeof setTimeout>
	}

	clearTimeout(handle: ReturnType<typeof setTimeout>) {
		this.timers.delete(handle as unknown as number)
	}

	advance(milliseconds: number) {
		const target = this.time + milliseconds
		while (true) {
			const next = [...this.timers.entries()]
				.filter(([, timer]) => timer.at <= target)
				.sort((left, right) => left[1].at - right[1].at)[0]
			if (!next)
				break
			const [id, timer] = next
			this.timers.delete(id)
			this.time = timer.at
			timer.callback()
		}
		this.time = target
	}
}

function fixture() {
	const eventTarget = new FakeEventTarget()
	const clock = new FakeClock()
	const elements: FakeAudio[] = []
	const errors: unknown[] = []
	const node = new DirectMediaAudioNode({
		createAudio: () => {
			const element = new FakeAudio()
			elements.push(element)
			return element
		},
		eventTarget,
		clock,
		onError: error => errors.push(error),
	})
	return {node, eventTarget, clock, elements, errors}
}

test("plays cross-origin media without setting crossOrigin or WebAudio state", async () => {
	const {node, elements} = fixture()
	node.setMasterGain(0.5)
	node.setChannelGain(0.4)

	await node.play("https://media.invalid/track.webm", true)
	const element = elements[0]

	assert.equal(element.src, "https://media.invalid/track.webm")
	assert.equal(element.loop, true)
	assert.equal(element.crossOrigin, "untouched")
	assert.equal(element.volume, 0.2)
	assert.equal(node.playing, true)

	const stopped = node.waitStop()
	node.stop()
	await stopped
	assert.equal(node.playing, false)
	assert.equal(element.pauseCalls, 1)
	assert.equal(element.src, "")
	assert.equal(element.loadCalls, 1)
})

test("ended resolves waiters for one-shots but not looped media", async () => {
	const {node, elements} = fixture()
	await node.play("https://media.invalid/wave.webm")
	const ended = node.waitStop()
	elements[0].dispatch("ended")
	await ended
	assert.equal(node.playing, false)

	await node.play("https://media.invalid/loop.webm", true)
	elements[1].dispatch("ended")
	assert.equal(node.playing, true)
	node.stop()
})

test("autoplay rejection retries on the next enabling gesture", async () => {
	const {node, eventTarget, elements} = fixture()
	const element = new FakeAudio()
	element.playErrors.push({name: "NotAllowedError"})
	const retryNode = new DirectMediaAudioNode({
		createAudio: () => element,
		eventTarget,
		onError: error => {
			throw error
		},
	})

	await retryNode.play("https://media.invalid/track.webm", true)
	assert.equal(element.playCalls, 1)
	assert.equal(eventTarget.count("click"), 1)

	eventTarget.dispatch("click")
	await Promise.resolve()
	assert.equal(element.playCalls, 2)
	assert.equal(eventTarget.count("click"), 0)
	assert.equal(elements.length, 0)
	retryNode.stop()
})

test("master and channel gain, fade, and automatic mute stay live", async () => {
	const {node, clock, elements} = fixture()
	node.setMasterGain(0.8)
	node.setChannelGain(0.5)
	await node.play("https://media.invalid/track.webm", true)
	const element = elements[0]
	assert.equal(element.volume, 0.4)

	const faded = node.fadeTo(0, 32)
	clock.advance(16)
	assert.equal(element.volume, 0.2)
	clock.advance(16)
	await faded
	assert.equal(element.volume, 0)

	node.setAutoMuted(true)
	assert.equal(element.muted, true)
	node.setAutoMuted(false)
	assert.equal(element.muted, false)
	node.stop()
})

test("replacement resolves prior stop waiters and owns a fresh element", async () => {
	const {node, elements} = fixture()
	await node.play("https://media.invalid/first.webm")
	const firstStopped = node.waitStop()

	await node.play("https://media.invalid/second.webm")
	await firstStopped

	assert.equal(elements[0].pauseCalls, 1)
	assert.equal(elements[1].src, "https://media.invalid/second.webm")
	assert.equal(node.playing, true)
	node.stop()
})

test("a stale play completion cannot reclaim a replacement element", async () => {
	let releaseFirst!: VoidFunction
	const firstGate = new Promise<void>(resolve => {
		releaseFirst = resolve
	})

	const first = new FakeAudio()
	first.playGate = firstGate
	const second = new FakeAudio()
	let next = first
	const racedNode = new DirectMediaAudioNode({
		createAudio: () => {
			const element = next
			next = second
			return element
		},
		eventTarget: new FakeEventTarget(),
	})

	const racedFirst = racedNode.play("https://media.invalid/first.webm")
	await Promise.resolve()
	await racedNode.play("https://media.invalid/second.webm")
	releaseFirst()
	await racedFirst

	assert.equal(first.pauseCalls, 1)
	assert.equal(first.src, "")
	assert.equal(second.pauseCalls, 0)
	assert.equal(second.src, "https://media.invalid/second.webm")
	assert.equal(racedNode.url, "https://media.invalid/second.webm")

	racedNode.stop()
})

test("a new fade cancels and resolves the interrupted fade", async () => {
	const {node, clock, elements} = fixture()
	node.setMasterGain(0.8)
	node.setChannelGain(0.5)
	await node.play("https://media.invalid/track.webm", true)
	const element = elements[0]

	let interruptedResolved = false
	const interrupted = node.fadeTo(0, 64).then(() => {
		interruptedResolved = true
	})
	clock.advance(16)
	assert.ok(Math.abs(element.volume - 0.3) < Number.EPSILON)

	const replacement = node.fadeTo(1, 16)
	await interrupted
	assert.equal(interruptedResolved, true)
	clock.advance(16)
	await replacement
	assert.equal(element.volume, 0.4)
	node.stop()
})
