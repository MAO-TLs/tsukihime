import assert from "node:assert/strict"
// Run against npm start with Playwright installed, or set PLAYWRIGHT_MODULE.
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, headless:true})
try {
 const page = await browser.newPage()
 const errors = []
 page.on("pageerror", e => errors.push(e.message))
 await page.goto(process.env.TSUKI_TEST_URL || "http://127.0.0.1:5173/tsukihime/")
 const result = await page.evaluate(async () => {
  const {ScriptPlayer} = await import("/tsukihime/src/engine/ScriptPlayer.ts")
  const {History, history} = await import("/tsukihime/src/engine/history.ts")
  const h = new History({storageId:"issue-test"})
  h.loadSaveState({scenes:[{label:"s20"}],pages:[]})
  const player = new ScriptPlayer(h)
  player.setPoints("cel", 7)
  player.setPoints("ark", 2)
  const snapshot = player.blockContext()
  h.onBlockStart({...snapshot,label:"s21"})
  h.onPageStart({...ScriptPlayer.defaultPageContext(),label:"s21",page:0})
  h.setPage({type:"text",text:"Save test"})
  const save = JSON.parse(JSON.stringify(h.createSaveState()))
  const loaded = new History({storageId:"issue-test-reloaded"})
  loaded.loadSaveState(save)
  const resumed = new ScriptPlayer(loaded)
  const points = Object.fromEntries(resumed.points)
  loaded.onSceneLoad("s21")
  const rewound = new ScriptPlayer(loaded)
  history.loadSaveState(save)
  sessionStorage.setItem("app_disclaimer_seen", "true")
  const {displayMode, SCREEN} = await import("/tsukihime/src/app/utils/display.ts")
  displayMode.screen = SCREEN.WINDOW
  return {points,rewound:Object.fromEntries(rewound.points),snapshot:snapshot.points}
 })
 assert.equal(result.points.cel,7)
 assert.equal(result.points.ark,2)
 assert.equal(result.rewound.cel,7)
 console.log(JSON.stringify(result))
 await page.waitForFunction(() => window.script?.getPoints("cel") === 7)
 await page.keyboard.press("f")
 await page.locator("#flowchart-progress svg.flowchart").waitFor({state:"visible"})
 const chart = await page.locator("#flowchart-progress .flowchart-container").evaluate(el => ({
  isolation: getComputedStyle(el).isolation,
  color: getComputedStyle(el).getPropertyValue("--active-connection").trim(),
  width: el.getBoundingClientRect().width,
  scenes: el.querySelectorAll(".fc-scene").length
 }))
 assert.equal(chart.isolation, "isolate")
 assert.equal(chart.color, "#0d96e0")
 assert.ok(chart.width > 0 && chart.scenes > 100)
 console.log("Flowchart without Extras:", JSON.stringify(chart))
 await page.screenshot({path:"/tmp/tsuki-issues-flowchart.png"})
 assert.deepEqual(errors, [])
 console.log("Page errors:", errors)
} finally { await browser.close() }
