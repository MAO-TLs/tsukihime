export enum SCREEN {
  HOME = "/",
  TITLE = "/play",
  WINDOW = "/window",
  CONFIG = "/config",
  LOAD = "/load",
  GALLERY = "/gallery",
  ENDINGS = "/endings",
  SCENES = "/scenes",
  SCRIPT = "/script",
  AUDIT = "/audit",
  PLUS_DISC = "/plus-disc",
}

const GAME_SCREEN_SET = new Set<SCREEN>([
  SCREEN.TITLE,
  SCREEN.WINDOW,
  SCREEN.CONFIG,
  SCREEN.LOAD,
  SCREEN.GALLERY,
  SCREEN.ENDINGS,
  SCREEN.SCENES,
  SCREEN.PLUS_DISC,
])

export function isGameScreen(screen: SCREEN): boolean {
  return GAME_SCREEN_SET.has(screen)
}

export function screenForPathname(pathname: string): SCREEN {
  const normalized = `/${pathname.split(/[?#]/u, 1)[0]
    .replace(/^\/+|\/+$/gu, "")}`
  if (normalized === SCREEN.SCENES || normalized.startsWith(`${SCREEN.SCENES}/`))
    return SCREEN.SCENES
  return (Object.values(SCREEN) as string[]).includes(normalized)
    ? normalized as SCREEN
    : SCREEN.HOME
}

export const displayMode: {
  screen: SCREEN
  bgAlignment: 'top' | 'center' | 'bottom'
  bgMoveTime: number
  replaceNavigation: boolean
  navigationState?: unknown
} = {
  screen: SCREEN.TITLE,
  bgAlignment: 'center',
  bgMoveTime: 0,
  replaceNavigation: false,
  navigationState: undefined,
}

//##############################################################################
//#                                   DEBUG                                    #
//##############################################################################

if (typeof window !== "undefined")
  window.displayMode = displayMode
