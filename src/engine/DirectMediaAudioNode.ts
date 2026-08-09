const autoPlayEnablingEvents = [
	'auxclick', 'click', 'contextmenu',
	'dblclick', 'mousedown', 'mouseup',
	'keydown', 'keyup', 'touchend',
] as const

export interface DirectMediaElement {
	loop: boolean
	muted: boolean
	paused: boolean
	preload: string
	src: string
	volume: number
	play(): Promise<void>
	pause(): void
	load(): void
	addEventListener(type: string, listener: EventListener): void
	removeEventListener(type: string, listener: EventListener): void
}

export interface DirectMediaEventTarget {
	addEventListener(type: string, listener: EventListener): void
	removeEventListener(type: string, listener: EventListener): void
}

export interface DirectMediaClock {
	now(): number
	setTimeout(callback: VoidFunction, delay: number): ReturnType<typeof setTimeout>
	clearTimeout(handle: ReturnType<typeof setTimeout>): void
}

export type DirectMediaAudioNodeOptions = {
	createAudio?: () => DirectMediaElement
	eventTarget?: DirectMediaEventTarget
	clock?: DirectMediaClock
	onError?: (error: unknown) => void
}

const defaultClock: DirectMediaClock = {
	now: () => performance.now(),
	setTimeout: (callback, delay) => setTimeout(callback, delay),
	clearTimeout: handle => clearTimeout(handle),
}

function errorName(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("name" in error))
		return undefined
	return String(error.name)
}

/**
 * Cross-origin media backend that deliberately never attaches its
 * HTMLAudioElement to WebAudio and never sets crossOrigin. This permits direct
 * playback from a server without CORS while retaining Tsukiweb's control
 * surface in ordinary element state.
 */
export class DirectMediaAudioNode {
	private readonly createAudio: () => DirectMediaElement
	private readonly eventTarget: DirectMediaEventTarget
	private readonly clock: DirectMediaClock
	private readonly onError: (error: unknown) => void
	private element: DirectMediaElement | null = null
	private generation = 0
	private masterGain = 1
	private channelGain = 1
	private fadeMultiplier = 1
	private autoMuted = false
	private stopWaiters = new Set<VoidFunction>()
	private fadeTimer: ReturnType<typeof setTimeout> | null = null
	private fadeResolver: VoidFunction | null = null
	private autoplayRetry: EventListener | null = null
	private endedListener: EventListener | null = null
	private errorListener: EventListener | null = null

	constructor(options: DirectMediaAudioNodeOptions = {}) {
		this.createAudio = options.createAudio ?? (() => new Audio())
		this.eventTarget = options.eventTarget ?? document
		this.clock = options.clock ?? defaultClock
		this.onError = options.onError ?? (error => console.error(error))
	}

	get playing() {
		return this.element !== null
	}

	get url() {
		return this.element?.src ?? null
	}

	setMasterGain(value: number) {
		this.masterGain = value
		this.updateElementVolume()
	}

	setChannelGain(value: number) {
		this.channelGain = value
		this.updateElementVolume()
	}

	setAutoMuted(value: boolean) {
		this.autoMuted = value
		if (this.element)
			this.element.muted = value
	}

	private updateElementVolume() {
		if (!this.element)
			return
		this.element.volume = Math.min(
			1,
			Math.max(
				0,
				this.masterGain * this.channelGain * this.fadeMultiplier,
			),
		)
	}

	private clearAutoplayRetry() {
		if (!this.autoplayRetry)
			return
		for (const event of autoPlayEnablingEvents)
			this.eventTarget.removeEventListener(event, this.autoplayRetry)
		this.autoplayRetry = null
	}

	private registerAutoplayRetry(
		element: DirectMediaElement,
		generation: number,
	) {
		this.clearAutoplayRetry()
		const retry: EventListener = () => {
			this.clearAutoplayRetry()
			if (this.element !== element || this.generation !== generation)
				return
			this.attemptPlay(element, generation).catch(this.onError)
		}
		this.autoplayRetry = retry
		for (const event of autoPlayEnablingEvents)
			this.eventTarget.addEventListener(event, retry)
	}

	private async attemptPlay(
		element: DirectMediaElement,
		generation: number,
	): Promise<void> {
		try {
			await element.play()
		} catch (error) {
			if (this.element !== element || this.generation !== generation)
				return
			switch (errorName(error)) {
				case "AbortError":
					return
				case "NotAllowedError":
					this.registerAutoplayRetry(element, generation)
					return
				default:
					this.stop()
					throw error
			}
		}
	}

	private detachElementListeners(element: DirectMediaElement) {
		if (this.endedListener)
			element.removeEventListener("ended", this.endedListener)
		if (this.errorListener) {
			element.removeEventListener("error", this.errorListener)
			element.removeEventListener("abort", this.errorListener)
		}
		this.endedListener = null
		this.errorListener = null
	}

	async play(url: string, loop = false): Promise<void> {
		this.stop()
		const generation = ++this.generation
		const element = this.createAudio()
		this.element = element
		this.fadeMultiplier = 1
		element.preload = "auto"
		element.loop = loop
		element.muted = this.autoMuted
		element.src = url
		this.updateElementVolume()

		this.endedListener = () => {
			if (
				this.element === element
				&& this.generation === generation
				&& !element.loop
			)
				this.stop()
		}
		this.errorListener = () => {
			if (this.element === element && this.generation === generation) {
				try {
					this.onError(Error(`remote audio failed: ${url}`))
				} finally {
					this.stop()
				}
			}
		}
		element.addEventListener("ended", this.endedListener)
		element.addEventListener("error", this.errorListener)
		element.addEventListener("abort", this.errorListener)
		await this.attemptPlay(element, generation)
	}

	waitStop(): Promise<void> {
		if (!this.element)
			return Promise.resolve()
		return new Promise(resolve => this.stopWaiters.add(resolve))
	}

	private cancelFade() {
		if (this.fadeTimer !== null) {
			this.clock.clearTimeout(this.fadeTimer)
			this.fadeTimer = null
		}
		const resolve = this.fadeResolver
		this.fadeResolver = null
		resolve?.()
	}

	async fadeTo(multiplier: number, durationMs: number): Promise<void> {
		this.cancelFade()
		const target = Math.min(1, Math.max(0, multiplier))
		if (!this.element || durationMs <= 0) {
			this.fadeMultiplier = target
			this.updateElementVolume()
			return
		}
		const startValue = this.fadeMultiplier
		const startTime = this.clock.now()
		await new Promise<void>(resolve => {
			this.fadeResolver = resolve
			const step = () => {
				const progress = Math.min(
					1,
					Math.max(0, (this.clock.now() - startTime) / durationMs),
				)
				this.fadeMultiplier = (
					startValue + (target - startValue) * progress
				)
				this.updateElementVolume()
				if (progress >= 1) {
					this.fadeTimer = null
					this.fadeResolver = null
					resolve()
					return
				}
				this.fadeTimer = this.clock.setTimeout(
					step,
					Math.min(16, durationMs * (1 - progress)),
				)
			}
			step()
		})
	}

	stop() {
		const element = this.element
		if (!element)
			return
		this.element = null
		this.generation++
		this.cancelFade()
		this.clearAutoplayRetry()
		this.detachElementListeners(element)
		element.pause()
		element.src = ""
		element.load()
		const waiters = [...this.stopWaiters]
		this.stopWaiters.clear()
		for (const resolve of waiters)
			resolve()
	}
}
