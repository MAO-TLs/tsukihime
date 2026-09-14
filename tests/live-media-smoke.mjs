import assert from "node:assert/strict"

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, headless: true})
try {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  await page.addInitScript(() => {
    window.__testMedia = []
    const NativeAudio = window.Audio
    window.Audio = class extends NativeAudio {
      constructor(...args) { super(...args); window.__testMedia.push(this) }
    }
  })
  await page.goto(process.env.TSUKI_TEST_URL || "http://127.0.0.1:5174/tsukihime/")
  await page.evaluate(async () => {
    sessionStorage.setItem("app_disclaimer_seen", "true")
    const {history} = await import("/tsukihime/src/engine/history.ts")
    const {displayMode, SCREEN} = await import("/tsukihime/src/app/utils/display.ts")
    history.loadSaveState({scenes: [{label: "s186", points: {cel: 7}}], pages: []})
    displayMode.screen = SCREEN.WINDOW
  })
  await page.waitForFunction(() => window.script?.text?.length > 0)
  await page.keyboard.press("Enter")
  await page.evaluate(async () => {
    window.audio.masterVolume = 0.1
    window.audio.trackVolume = 1
    await window.audio.playTrack("*3", true)
  })
  await page.waitForFunction(() => window.__testMedia.some(audio => !audio.paused && audio.currentTime > 3))
  const result = await page.evaluate(() => ({
    text: window.script.text,
    points: window.script.getPoints("cel"),
    audio: window.__testMedia.filter(audio => !audio.paused).map(audio => ({url: audio.src, time: audio.currentTime, ready: audio.readyState})),
  }))
  assert.equal(result.points, 7)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify(result))
  await page.screenshot({path: "/tmp/tsuki-upgrade-live-game.png"})
} finally {
  await browser.close()
}
