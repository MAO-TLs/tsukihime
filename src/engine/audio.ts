import { assets, audioSePath, audioTrackPath } from "../translation/assets"
import { settings } from "./settings"
import { observe } from "@tsukiweb/common/utils/Observer"
import { asyncDelay } from "@tsukiweb/common/utils/timer"
import { createCommands } from "@tsukiweb/common/audio/utils"
import { GameAudioManager } from "@tsukiweb/common/audio/AudioManager"
import { waitLanguageLoad } from "translation/lang"
import { displayMode } from "app/utils/display"
import { DirectMediaGameAudioManager } from "./DirectMediaGameAudioManager"
import { originalMediaMode } from "translation/assets"
import { syncAudioForScreen } from "./audio-screen"

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

async function createAudioBuffer(url: string) {
  const result = await fetch(url)
  if (!result.ok)
    throw Error(`audio file ${url} not found: ${result.statusText}`)
  const data = await result.arrayBuffer()
  const buffer = await audio.context.decodeAudioData(data)
  return buffer
}

export const audio = originalMediaMode === "direct-audio"
  ? new DirectMediaGameAudioManager(settings, getUrl)
  : new GameAudioManager(settings, assets, "audio")
assets.setProvider("audio", (id)=> {
  if (id.startsWith('"') && id.endsWith('"'))
    id = id.substring(1, id.length-1)
  let audioUrl
  if (id.startsWith('*')) {
    const trackName = parseInt(id.substring(1)).toString().padStart(2, '0')
    audioUrl = audioTrackPath(trackName)
    if (originalMediaMode === "direct-audio" || audio.streamingEnabled) {
      // no need to preload streamed music.
      // Additionally, musics should not be loaded if game is muted.
      return { url: audioUrl, value: undefined }
    }
  } else if (id.startsWith('se_')) {
    audioUrl = audioSePath(id)
  } else if (id.startsWith('pd/se')) {
    audioUrl = audioSePath(id.substring(3), true)
  } else {
    return undefined
  }
  return {
    url: audioUrl,
    // Direct media plays through HTMLAudioElement without a CORS fetch.
    value: originalMediaMode === "direct-audio" ? undefined : createAudioBuffer(audioUrl)
  }
})

//__________________________________observers___________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

// update track source
observe(settings, 'trackSource', ()=> {
  assets.clear()
  if (audio.track)
    audio.playTrack(audio.track, true);
})

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
