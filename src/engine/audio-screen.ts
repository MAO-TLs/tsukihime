import {isGameScreen, SCREEN} from "../app/utils/display"

export type ScreenAudioManager = {
	inGame: boolean
	playTrack(track: string): unknown
	stopTrack(): unknown
	stopWave(): unknown
}

/** Keep game media alive only on game-owned routes. */
export function syncAudioForScreen(
	audio: ScreenAudioManager,
	titleTrack: string,
	screen: SCREEN,
): void {
	const inGame = screen === SCREEN.WINDOW
	audio.inGame = inGame
	if (inGame)
		return

	audio.stopWave()
	if (isGameScreen(screen))
		void audio.playTrack(titleTrack)
	else
		void audio.stopTrack()
}
