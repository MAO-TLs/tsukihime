import { GameAudioManager } from "@tsukiweb/common/audio/AudioManager"
import type { Settings as CommonSettings } from "@tsukiweb/common/utils/settings"
import {
	DirectMediaAudioNode,
	type DirectMediaAudioNodeOptions,
	type DirectMediaEventTarget,
} from "./DirectMediaAudioNode"

export type DirectMediaGameAudioManagerOptions = DirectMediaAudioNodeOptions & {
	visibilityTarget?: DirectMediaEventTarget & {
		visibilityState?: string
	}
}

/**
 * Keeps UI synthesis on the pinned WebAudio manager but routes remote BGM and
 * waves through unconnected HTMLAudioElements so the media origin need not
 * grant CORS.
 */
export class DirectMediaGameAudioManager<
	S extends CommonSettings,
> extends GameAudioManager<S> {
	private readonly directIdToUrl: (id: string) => string
	private directTrackNode?: DirectMediaAudioNode
	private directWaveNode?: DirectMediaAudioNode
	private directTrackId: string | null = null
	private directWaveId: string | null = null
	private directWaveIsLooped = false
	private directTrackRevision = 0
	private directAutoMute = false
	private readonly visibilityTarget: DirectMediaGameAudioManagerOptions["visibilityTarget"]
	private readonly visibilityListener: EventListener

	constructor(
		settings: S,
		idToUrl: (id: string) => string,
		options: DirectMediaGameAudioManagerOptions = {},
	) {
		// The inherited nodes remain available for synthesized UI sounds only.
		super(settings, idToUrl, false)
		this.directIdToUrl = idToUrl
		this.visibilityTarget = options.visibilityTarget ?? document
		this.directTrackNode = new DirectMediaAudioNode(options)
		this.directWaveNode = new DirectMediaAudioNode(options)
		this.directTrackNode.setMasterGain(super.masterVolume)
		this.directWaveNode.setMasterGain(super.masterVolume)
		this.directTrackNode.setChannelGain(super.trackVolume)
		this.directWaveNode.setChannelGain(super.waveVolume)
		this.directAutoMute = super.autoMute
		this.visibilityListener = () => this.updateDirectMute()
		this.visibilityTarget.addEventListener(
			"visibilitychange",
			this.visibilityListener,
		)
		this.updateDirectMute()
	}

	private updateDirectMute() {
		const muted = (
			this.directAutoMute
			&& this.visibilityTarget?.visibilityState === "hidden"
		)
		this.directTrackNode?.setAutoMuted(muted)
		this.directWaveNode?.setAutoMuted(muted)
	}

	override get autoMute() {
		return super.autoMute
	}

	override set autoMute(value: boolean) {
		super.autoMute = value
		this.directAutoMute = value
		this.updateDirectMute()
	}

	override get masterVolume() {
		return super.masterVolume
	}

	override set masterVolume(value: number) {
		super.masterVolume = value
		this.directTrackNode?.setMasterGain(value)
		this.directWaveNode?.setMasterGain(value)
	}

	override get trackVolume() {
		return super.trackVolume
	}

	override set trackVolume(value: number) {
		super.trackVolume = value
		this.directTrackNode?.setChannelGain(value)
	}

	override get waveVolume() {
		return super.waveVolume
	}

	override set waveVolume(value: number) {
		super.waveVolume = value
		this.directWaveNode?.setChannelGain(value)
	}

	override get track() {
		return this.directTrackId
	}

	override set track(id: string | null) {
		if (id)
			void this.playTrack(id)
		else
			void this.stopTrack()
	}

	override get waveLoop() {
		return this.directWaveIsLooped ? this.directWaveId : null
	}

	override set waveLoop(id: string | null) {
		if (id)
			void this.playWave(id, true)
		else
			this.stopWave()
	}

	override set wave(id: string) {
		void this.playWave(id, false)
	}

	private async stopTrackNode() {
		if (!this.directTrackNode?.playing)
			return
		if (this.trackFadeout > 0)
			await this.directTrackNode.fadeTo(0, this.trackFadeout)
		this.directTrackNode.stop()
	}

	override async playTrack(id: string, forceRestart = false) {
		if (
			!forceRestart
			&& this.directTrackId === id
			&& this.directTrackNode?.playing
		)
			return
		const revision = ++this.directTrackRevision
		this.directTrackId = id
		await this.stopTrackNode()
		if (
			revision !== this.directTrackRevision
			|| this.directTrackId !== id
			|| this.trackVolume * this.masterVolume <= 0
		)
			return
		await this.directTrackNode?.play(this.directIdToUrl(id), true)
	}

	override async stopTrack() {
		this.directTrackId = null
		this.directTrackRevision++
		await this.stopTrackNode()
	}

	override async playWave(id: string, loop = false) {
		if (
			loop
			&& this.directWaveId === id
			&& this.directWaveIsLooped
			&& this.directWaveNode?.playing
		)
			return
		this.directWaveId = id
		this.directWaveIsLooped = loop
		this.directWaveNode?.stop()
		if (this.waveVolume * this.masterVolume <= 0)
			return
		const play = this.directWaveNode?.play(this.directIdToUrl(id), loop)
		if (play)
			await play
		// Replacement and stop operations synchronously retire this call's
		// element. A stale completion must not stop the newer element that now
		// belongs to the current revision.
	}

	override waitWaveEnd() {
		return this.directWaveNode?.waitStop() ?? Promise.resolve()
	}

	override stopWave(wait = false) {
		this.directWaveId = null
		this.directWaveIsLooped = false
		const stopped = this.directWaveNode?.waitStop() ?? Promise.resolve()
		this.directWaveNode?.stop()
		if (wait)
			return stopped
	}

	override clearBuffers(restartTrack = false) {
		super.clearBuffers(false)
		if (restartTrack && this.directTrackId)
			void this.playTrack(this.directTrackId, true)
	}
}
