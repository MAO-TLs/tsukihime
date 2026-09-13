import fs from "node:fs"
import path from "node:path"
import {createHash} from "node:crypto"

const root = path.resolve(import.meta.dirname, "..")
const restorations = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "command-tail-restorations.json"), "utf8"))
export function restoreCommandTails(text) {
    for (const {japanese, english} of restorations) {
        // Consume the complete ld arguments before separating the displayed tail.
        const lines = text.split("\n")
        text = lines.map(line => {
            if (!line.startsWith("ld ") || !line.endsWith(japanese)) return line
            return line.slice(0, -japanese.length) + "\n" + "`" + english
        }).join("\n")
    }
    const leaks = text.split("\n").filter(line =>
        /^ld\s/.test(line) && /[\u3040-\u30ff\u4e00-\u9fff]/.test(line.replace(/"[^"]*"/g, "").split(";")[0]))
    if (leaks.length) throw Error("Untranslated command-tail text: " + leaks.join("\n"))
    return text
}

function update(relative, transform) {
    const file = path.join(root, relative)
    const old = fs.readFileSync(file, "utf8")
    const next = transform(old)
    if (next !== old) fs.writeFileSync(file, next)
}

if (process.argv[1] === import.meta.filename) {
    update("public/static/en-mao/fullscript_en-mao.txt", text =>
        restoreCommandTails(text).replace("?” “You don’t remember.", "?”\n`“You don’t remember."))
    for (const {scene, japanese, english} of restorations) {
        update("public/static/en-mao/scenes/" + scene + ".txt", text => {
            const source = "`" + japanese.replace(/―――/g, "[line=3]")
            const target = "`" + english.replace(/―――/g, "[line=3]") + (scene === "s151" ? "" : "@")
            if (!text.includes(source) && !text.includes(target)) throw Error("Missing restoration anchor " + scene)
            return text.replace(source, target)
        })
    }
    update("public/static/en-mao/scenes/s020.txt", text =>
        text.replace("hospital?”@ “You don’t remember.", "hospital?”@\n`“You don’t remember."))
    for (const file of ["scripts/script-016.json", "search-index.json"]) {
        update("public/static/mao-audit/" + file, text => {
            const data = JSON.parse(text)
            const rows = data.lines ?? data.entries
            const row = rows.find(row => row.ref === "tsuki:mm-audit:03234")
            if (!row) throw Error("Missing reader anchor")
            for (const key of ["maoEnglish", "mao_english"]) {
                if (row[key]) row[key] = row[key].replace("hospital?” “You don’t remember.", "hospital?”\n“You don’t remember.")
            }
            if (row.mao_english_sha256) row.mao_english_sha256 = createHash("sha256").update(row.mao_english).digest("hex")
            return JSON.stringify(data) + (text.endsWith("\n") ? "\n" : "")
        })
    }
    update("public/static/mao-audit/manifest.json", text => {
        const data = JSON.parse(text)
        for (const artifact of [data.artifacts.searchIndex, ...data.artifacts.scripts]) {
            if (!["search-index.json", "scripts/script-016.json"].includes(artifact.path)) continue
            const bytes = fs.readFileSync(path.join(root, "public/static/mao-audit", artifact.path))
            artifact.byteCount = bytes.length
            artifact.sha256 = createHash("sha256").update(bytes).digest("hex")
        }
        return JSON.stringify(data, null, 2) + "\n"
    })
}
