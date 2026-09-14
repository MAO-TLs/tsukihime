import assert from "node:assert/strict"

// Run against npm start; see ENGINE_UPGRADE.md for prerequisites.
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const base = process.env.TSUKI_TEST_URL || "http://127.0.0.1:5174/tsukihime/"
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, headless: true})
try {
  const page = await browser.newPage()
  if (process.env.TSUKI_MEDIA_FIXTURES === "1") {
    // Deterministic transport fixtures for repeated UI runs. Live-media mode
    // remains the default and must be checked separately before publication.
    const wav = Buffer.alloc(44 + 16000)
    wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8)
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28)
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
    wav.write("data", 36); wav.writeUInt32LE(16000, 40)
    await page.route("https://*.holofield.fr/**", route => route.fulfill(
      route.request().url().endsWith(".webm")
        ? {contentType: "audio/wav", body: wav}
        : {contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#202938"/></svg>'}
    ))
    console.log("Using synthetic media transport fixtures; this does not verify the live media host.")
  }
  await page.addInitScript(() => {
    window.__testMedia = []
    const NativeAudio = window.Audio
    window.Audio = class extends NativeAudio {
      constructor(...args) { super(...args); window.__testMedia.push(this) }
    }
  })
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  page.on("console", message => { if (message.type() === "error") console.error(message.text()) })
  page.on("requestfailed", request => console.error("Request failed", request.url(), request.failure()))
  await page.goto(base)
  assert.equal(await page.evaluate(() => typeof window.script), "undefined")
  await page.evaluate(() => sessionStorage.setItem("app_disclaimer_seen", "true"))
  await page.goto(base + "play")
  await page.locator("#title-menu").waitFor()
  // Allow real media requests to settle; the external host throttles bursts.
  await page.waitForTimeout(4000)
  const imported = await page.evaluate(async () => {
    const {APP_VERSION} = await import("/tsukihime/src/app/utils/constants.ts")
    const {importGameDataFromJSON} = await import("/tsukihime/src/engine/settings.ts")
    const {savesManager} = await import("/tsukihime/src/engine/savestates.ts")
    // Pre-upgrade MAO saves already use points; upstream older saves use regard.
    const fixture = {version: "0.7.7", date: 1234, id: 42,
      scenes: [{label: "s183", points: {cel: 7, ark: 2}}], pages: []}
    await importGameDataFromJSON(fixture)
    const single = savesManager.get(42).scenes[0].points
    await importGameDataFromJSON({version: "0.7.7", settings: {}, saveStates: [fixture,
      {...fixture, id: 43, scenes: [{label: "s183", regard: {cel: 5}}]}]})
    return {version: APP_VERSION, single, legacy: savesManager.get(43).scenes[0].points}
  })
  assert.equal(imported.version, "1.1.0")
  assert.deepEqual(imported.single, {cel: 7, ark: 2})
  assert.deepEqual(imported.legacy, {cel: 5})
  await page.reload()
  await page.locator("#title-menu").waitFor()
  await page.waitForTimeout(4000)
  const persisted = await page.evaluate(async () => {
    const {savesManager} = await import("/tsukihime/src/engine/savestates.ts")
    const {history} = await import("/tsukihime/src/engine/history.ts")
    const {displayMode, SCREEN} = await import("/tsukihime/src/app/utils/display.ts")
    const save = savesManager.get(42)
    history.loadSaveState(save)
    displayMode.screen = SCREEN.WINDOW
    return save.scenes[0].points
  })
  assert.deepEqual(persisted, {cel: 7, ark: 2})
  console.log("Save imports and persistence passed", imported, persisted)
  await page.waitForFunction(() => document.body.innerText.includes("10th day"))
  for (let i = 0; i < 10 && !await page.evaluate(() => window.script?.text?.length > 10); i++) {
    await page.keyboard.press("Enter")
    await page.waitForTimeout(500)
  }
  await page.waitForFunction(() => window.script?.text?.length > 10).catch(async error => {
    await page.screenshot({path: "/tmp/tsuki-upgrade-failure.png"})
    console.log(await page.evaluate(() => ({text: document.body.innerText, errors: window.script?.text, label: window.script?.label})))
    throw error
  })
  assert.equal(await page.evaluate(() => window.script.getPoints("cel")), 7)
  const before = await page.evaluate(() => window.script.text)
  await page.keyboard.press("Enter")
  await page.keyboard.press("Enter")
  await page.waitForFunction(text => window.script?.text !== text, before)
  await page.screenshot({path: "/tmp/tsuki-upgrade-game.png"})
  const assets = await page.evaluate(async () => {
    const {assets} = await import("/tsukihime/src/translation/assets.ts")
    const {audio} = await import("/tsukihime/src/engine/audio.ts")
    const word = await assets.get("graph", "word/day_1")
    const graphic = await assets.get("graph", "bg/bg_40a")
    audio.masterVolume = 0.1
    audio.trackVolume = 1
    await audio.playTrack("*9")
    // Media nodes may be detached; runtime constructor verifies active adapter.
    return {word, graphic, audioType: audio.constructor.name, track: audio.track}
  })
  assert.equal(assets.word, null)
  assert.match(assets.graphic, /bg_40a/)
  assert.equal(assets.audioType, "DirectMediaGameAudioManager")
  assert.equal(assets.track, "*9")
  await page.waitForFunction(() => window.__testMedia.some(audio => !audio.paused && audio.currentTime > 0)).catch(async error => {
    console.log(await page.evaluate(() => window.__testMedia.map(audio => ({src: audio.src, error: audio.error?.message, code: audio.error?.code, state: audio.readyState}))))
    throw error
  })
  console.log("Playback and audio transport passed", assets)
  await page.keyboard.press("f")
  const chart = page.locator("#flowchart-progress svg.flowchart")
  await chart.waitFor({state: "visible"})
  const oldTransform = await chart.getAttribute("style")
  await chart.hover()
  await page.keyboard.down("Control")
  await page.mouse.wheel(0, -300)
  await page.keyboard.up("Control")
  await page.waitForFunction(old => document.querySelector("#flowchart-progress svg.flowchart")?.getAttribute("style") !== old, oldTransform)
  await page.setViewportSize({width: 390, height: 844})
  await page.screenshot({path: "/tmp/tsuki-upgrade-mobile-flowchart.png"})
  await page.goto(base + "config")
  await page.locator("#config").waitFor()
  await page.screenshot({path: "/tmp/tsuki-upgrade-config-before.png"})
  console.log("Config tabs", await page.locator("[role=tab]").allTextContents())
  await page.locator('[data-tab="controls"]').click()
  await page.waitForFunction(() => document.body.innerText.includes("Advance"))
  assert.ok(!(await page.locator("#config").innerText()).includes("[i]"))
  await page.screenshot({path: "/tmp/tsuki-upgrade-config.png"})
  await page.goto(base + "script?route=arcueid&script=script-016")
  await page.waitForFunction(() => document.body.innerText.includes("hospital"))
  assert.equal(await page.evaluate(() => typeof window.script), "undefined")
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({imported, persisted, assets, pageErrors: errors}))
} finally {
  await browser.close()
}
