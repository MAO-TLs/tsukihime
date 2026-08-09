import { audioSePath, audioTrackPath } from "../translation/assets"
import { settings } from "./settings"
import { observe } from "@tsukiweb/common/utils/Observer"
import { asyncDelay } from "@tsukiweb/common/utils/timer"
import { createCommands } from "@tsukiweb/common/audio/utils"
import { waitLanguageLoad } from "translation/lang"
import { displayMode, SCREEN } from "app/utils/display";
import { GameAudioManager } from "@tsukiweb/common/audio/AudioManager";
import { DirectMediaGameAudioManager } from "./DirectMediaGameAudioManager";
import { originalMediaMode } from "translation/assets";

function getUrl(id: string): string {
  if (id.startsWith('"') && id.endsWith('"'))
    id = id.substring(1, id.length-1)
  if (id.startsWith('*')) {
    const trackName = parseInt(id.substring(1)).toString().padStart(2, '0')
    return audioTrackPath(trackName)
  }
  else if (id.includes('/')) {
    return id
  }
  return audioSePath(id)
}

export const audio = originalMediaMode === "direct-audio"
  ? new DirectMediaGameAudioManager(settings, getUrl)
  : new GameAudioManager(settings, getUrl)

//__________________________________observers___________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

// update track source
observe(settings, 'trackSource', audio.clearBuffers.bind(audio, true))

observe(displayMode, 'screen', (screen)=> {
  const inGame = (screen == SCREEN.WINDOW)
  audio.inGame = inGame
  if (!inGame) {
    audio.playTrack(settings.titleMusic)
  }
})

waitLanguageLoad().then(async ()=> {
  await asyncDelay(100)
  if (displayMode.screen != SCREEN.WINDOW) {
    audio.playTrack(settings.titleMusic)
  }
});

//___________________________________commands___________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

export const commands = {
  ...createCommands(audio),
}

//##############################################################################
//#                                   DEBUG                                    #
//##############################################################################

window.audio = audio
