import { audioSePath, audioTrackPath } from "../translation/assets"
import { settings } from "./settings"
import { observe } from "@tsukiweb/common/utils/Observer"
import { asyncDelay } from "@tsukiweb/common/utils/timer"
import { createCommands } from "@tsukiweb/common/audio/utils"
import { waitLanguageLoad } from "translation/lang"
import { displayMode } from "app/utils/display";
import { GameAudioManager } from "@tsukiweb/common/audio/AudioManager";
import { DirectMediaGameAudioManager } from "./DirectMediaGameAudioManager";
import { originalMediaMode } from "translation/assets";
import { syncAudioForScreen } from "./audio-screen";

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

observe(displayMode, 'screen', (screen)=>
  syncAudioForScreen(audio, settings.titleMusic, screen))

waitLanguageLoad().then(async ()=> {
  await asyncDelay(100)
  syncAudioForScreen(audio, settings.titleMusic, displayMode.screen)
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
