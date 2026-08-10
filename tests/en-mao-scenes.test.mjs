import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import {
	CommandToken,
	ConditionToken,
	ErrorToken,
	TextToken,
} from "../tsukiweb-common/tools/convert-scripts/parsers/utils.ts"
import {parseScript} from "../tsukiweb-common/tools/convert-scripts/parsers/nscriptr.ts"

const ROOT = new URL("..", import.meta.url).pathname
const JP_SCENES = path.join(ROOT, "public/static/jp/scenes")
const EN_SCENES = path.join(ROOT, "public/static/en-mao/scenes")
const LOGIC = path.join(ROOT, "public/static/logic.txt")
const EN_GAME = path.join(ROOT, "public/static/en-mao/game.json")
const GALLERY_DATA = path.join(ROOT, "src/features/gallery/utils/gallery-data.ts")
const SPRITESHEET_METADATA = path.join(ROOT, "src/assets/game/spritesheet_metadata.json")
const APP_CONSTANTS = path.join(ROOT, "src/app/utils/constants.ts")
const EXPECTED_DORMANT_LOGIC = ["f272", "skip415"]
const EXPECTED_CHOICE_OPTION_COUNT = 249
const EXPECTED_ASSET_COUNTS = {
	sceneImages: 572,
	wordImages: 2,
	trackIds: 9,
	waveIds: 14,
	galleryImages: 172,
	galleryThumbnails: 167,
	flowchartSheets: 4,
	characters: 5,
	remoteEndpoints: 1_548,
}
const ROUTE_ENDINGS = {
	ark_good: "s53a",
	ark_true: "s52a",
	ciel_good: "s308",
	ciel_true: "s310",
	akiha_good: "s384",
	akiha_true: "s385",
	hisui_good: "s413",
	hisui_true: "s412",
	kohaku_true: "s429",
}
const CLEARANCE_PROFILES = [
	{name: "fresh", cleared: 0, clearArk: 0, clearHis: 0},
	{name: "other-cleared", cleared: 1, clearArk: 0, clearHis: 0},
	{name: "ark-cleared", cleared: 1, clearArk: 1, clearHis: 0},
	{name: "hisui-cleared", cleared: 1, clearArk: 0, clearHis: 1},
	{name: "ark-and-hisui-cleared", cleared: 1, clearArk: 1, clearHis: 1},
]
const EXPECTED_ENDING_PROFILES = {
	s52a: CLEARANCE_PROFILES.map(profile => profile.name),
	s53a: ["ark-cleared", "ark-and-hisui-cleared"],
	s308: CLEARANCE_PROFILES.map(profile => profile.name),
	s310: CLEARANCE_PROFILES.map(profile => profile.name),
	s384: CLEARANCE_PROFILES.slice(1).map(profile => profile.name),
	s385: CLEARANCE_PROFILES.slice(1).map(profile => profile.name),
	s412: CLEARANCE_PROFILES.slice(1).map(profile => profile.name),
	s413: ["hisui-cleared", "ark-and-hisui-cleared"],
	s429: ["hisui-cleared", "ark-and-hisui-cleared"],
}

function sceneNames(directory) {
	return fs.readdirSync(directory)
		.filter(name => name.endsWith(".txt"))
		.sort()
}

function parseScene(directory, name) {
	return parseScript(fs.readFileSync(path.join(directory, name), "utf8"))
}

function normalizeSceneId(label) {
	return /^s\d+\w?$/.test(label)
		? `s${label.slice(1).padStart(3, "0")}`
		: label
}

function engineSignature(tokens) {
	return tokens
		.filter(token => !(token instanceof TextToken))
		.map(token => {
			assert.ok(!(token instanceof ErrorToken), "scene contains ErrorToken")
			if (token instanceof ConditionToken)
				return `condition:${token.not}:${token.condition}:${token.command}`
			return token.toString()
		})
}

function unquoteAsset(value) {
	const image = value.split("$", 1)[0]
	return image.startsWith('"') && image.endsWith('"')
		? image.slice(1, -1)
		: image
}

function sceneAssetManifest(directory) {
	const images = new Set()
	const words = new Set()
	const tracks = new Set()
	const waves = new Set()

	for (const name of sceneNames(directory)) {
		for (let token of parseScene(directory, name)) {
			if (token instanceof ConditionToken) token = token.command
			if (!(token instanceof CommandToken)) continue

			let rawImage
			if (["bg", "phase"].includes(token.cmd)) rawImage = token.args[0]
			else if (token.cmd === "ld") rawImage = token.args[1]
			if (rawImage) {
				const image = unquoteAsset(rawImage)
				if (image.startsWith("word/")) words.add(image)
				else if (!image.startsWith("#")) {
					assert.match(image, /^(?:bg|event|tachi)\/[A-Za-z0-9_-]+$/, `${name}: unsafe image id ${image}`)
					images.add(image)
				}
			}

			if (token.cmd === "play") {
				const track = unquoteAsset(token.args[0] ?? "")
				assert.match(track, /^\*\d+$/, `${name}: unsupported track ${track}`)
				tracks.add(Number.parseInt(track.slice(1), 10).toString().padStart(2, "0"))
			}
			if (["wave", "waveloop"].includes(token.cmd)) {
				const wave = unquoteAsset(token.args[0] ?? "")
				assert.match(wave, /^se_\d+$/, `${name}: unsupported wave ${wave}`)
				waves.add(wave)
			}
		}
	}

	return {
		images: [...images].sort(),
		words: [...words].sort(),
		tracks: [...tracks].sort(),
		waves: [...waves].sort(),
	}
}

function logicBlocks(source) {
	const matches = [...source.matchAll(/^\*(\w+)\s*$/gm)]
	const orderedLabels = []
	const blocks = new Map()
	for (let index = 0; index < matches.length; index++) {
		const match = matches[index]
		const label = match[1]
		assert.equal(blocks.has(label), false, `duplicate logic label *${label}`)
		const start = match.index + match[0].length
		const end = matches[index + 1]?.index ?? source.length
		orderedLabels.push(label)
		blocks.set(label, source.slice(start, end).trim())
	}
	return {orderedLabels, blocks}
}

function cloneRuntimeState(state) {
	return {
		flags: new Set(state.flags),
		points: {...state.points},
	}
}

function readRuntimeVariable(name, state, profile) {
	if (name === "%cleared") return profile.cleared
	if (name === "%clear_ark") return profile.clearArk
	if (name === "%clear_his") return profile.clearHis
	const flag = /^%flg([1-9A-Z])$/.exec(name)
	if (flag) return state.flags.has(flag[1]) ? 1 : 0
	const regard = /^%regard_(ark|cel|aki|his|koha)$/.exec(name)
	if (regard) return state.points[regard[1]]
	throw new Error(`unsupported runtime variable ${name}`)
}

function conditionTokens(condition) {
	const operator = /\s*([=!<>&|]{1,2}|[()])\s*/g
	const tokens = []
	let match
	let lastIndex = 0
	while ((match = operator.exec(condition)) !== null) {
		if (match.index > lastIndex)
			tokens.push(condition.slice(lastIndex, match.index).trim())
		tokens.push(match[0].trim())
		lastIndex = operator.lastIndex
	}
	if (lastIndex < condition.length)
		tokens.push(condition.slice(lastIndex))
	return tokens
}

function tokenValue(token, state, profile) {
	if (token.startsWith("%")) return readRuntimeVariable(token, state, profile)
	const value = Number.parseInt(token, 10)
	assert.equal(Number.isNaN(value), false, `invalid condition value ${token}`)
	return value
}

// This deliberately mirrors tsukiweb-common/src/script/utils.tsx instead of
// delegating to JavaScript eval, including its left-to-right short-circuiting.
function evaluateRuntimeTokens(tokens, state, profile) {
	if (!tokens.length) return 0
	let token = tokens.shift()
	let lhs
	if (["!", "("].includes(token)) {
		if (token === "!")
			lhs = tokenValue(tokens.shift(), state, profile) ? 0 : 1
		else
			lhs = evaluateRuntimeTokens(tokens, state, profile)
	} else {
		lhs = tokenValue(token, state, profile)
	}
	while (tokens.length) {
		token = tokens.shift()
		if (token === "(") lhs = evaluateRuntimeTokens(tokens, state, profile)
		else if (token === ")") return lhs
		else if (token === "&&") {
			if (lhs === 0) return 0
		} else if (token === "||") {
			if (lhs !== 0) return 1
		} else if ([">", ">=", "<", "<=", "==", "!="].includes(token)) {
			const rhs = tokenValue(tokens.shift(), state, profile)
			if (token === ">") lhs = +(lhs > rhs)
			else if (token === ">=") lhs = +(lhs >= rhs)
			else if (token === "<") lhs = +(lhs < rhs)
			else if (token === "<=") lhs = +(lhs <= rhs)
			else if (token === "==") lhs = +(lhs === rhs)
			else lhs = +(lhs !== rhs)
		} else {
			lhs = tokenValue(token, state, profile)
		}
	}
	return lhs
}

function evaluateRuntimeCondition(condition, state, profile) {
	return evaluateRuntimeTokens(conditionTokens(condition), state, profile) !== 0
}

function writeRuntimeVariable(name, value, state) {
	const flag = /^%flg([1-9A-Z])$/.exec(name)
	if (flag) {
		if (value > 0) state.flags.add(flag[1])
		else state.flags.delete(flag[1])
		return
	}
	const regard = /^%regard_(ark|cel|aki|his|koha)$/.exec(name)
	if (regard) {
		state.points[regard[1]] = value
		return
	}
	throw new Error(`unsupported writable runtime variable ${name}`)
}

function runtimeStateKey(label, profile, state, liveVariables) {
	return [
		profile.name,
		label,
		[...state.flags]
			.filter(flag => liveVariables.has(`%flg${flag}`))
			.sort()
			.join(""),
		Object.entries(state.points)
			.filter(([name]) => liveVariables.has(`%regard_${name}`))
			.map(([name, value]) => `${name}:${value}`)
			.join(","),
	].join("|")
}

function runtimeLiveVariables(orderedLabels, blocks, sceneIds) {
	const adjacency = new Map()
	const directUses = new Map()
	for (const [index, label] of orderedLabels.entries()) {
		const body = blocks.get(label)
		const lines = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
		const targets = new Set([...body.matchAll(/\*(\w+)/g)].map(match => match[1]))
		const last = lines.at(-1) ?? ""
		if (!["goto", "select", "osiete"].some(command => last.startsWith(command)))
			targets.add(orderedLabels[index + 1] ?? "endofplay")
		adjacency.set(label, targets)
		directUses.set(
			label,
			new Set([...body.matchAll(/%[A-Za-z0-9_]+/g)].map(match => match[0])),
		)
	}
	for (const scene of sceneIds) {
		const match = /^s0*(\d+)(a?)$/.exec(scene)
		const runtimeLabel = match
			? `s${Number.parseInt(match[1], 10)}${match[2]}`
			: scene
		if (match)
			adjacency.set(runtimeLabel, new Set([`skip${Number.parseInt(match[1], 10)}${match[2]}`]))
		else if (scene === "openning")
			adjacency.set(scene, new Set(["s20"]))
		else
			adjacency.set(scene, new Set())
		directUses.set(runtimeLabel, new Set())
	}

	const live = new Map([...adjacency].map(([label]) => [label, new Set(directUses.get(label))]))
	let changed = true
	while (changed) {
		changed = false
		for (const [label, targets] of adjacency) {
			const values = live.get(label)
			for (const target of targets) {
				for (const variable of live.get(target) ?? []) {
					if (values.has(variable)) continue
					values.add(variable)
					changed = true
				}
			}
		}
	}
	return live
}

function stateAwareTraversal(source, sceneIds, choiceTexts) {
	const {orderedLabels, blocks} = logicBlocks(source)
	const liveVariables = runtimeLiveVariables(orderedLabels, blocks, sceneIds)
	const nextLogicLabel = new Map(
		orderedLabels.map((label, index) => [label, orderedLabels[index + 1] ?? "endofplay"]),
	)
	const reachedLabels = new Set()
	const reachedScenes = new Set()
	const reachedSelections = new Set()
	const selectableOptions = new Set()
	const deadSelections = []
	const endingProfiles = new Map(Object.values(ROUTE_ENDINGS).map(scene => [scene, new Set()]))
	const endingWitnesses = new Map()
	const endingProfileWitnesses = new Map(
		Object.values(ROUTE_ENDINGS).map(scene => [scene, new Map()]),
	)
	const visited = new Set()
	const parents = new Map()
	const queue = CLEARANCE_PROFILES.flatMap(profile => ["openning", "f20", "eclipse"].map(label => ({
		label,
		profile,
		parentKey: null,
		action: null,
		state: {
			flags: new Set(),
			points: {ark: 0, cel: 0, aki: 0, his: 0, koha: 0},
		},
	})))

	function targetTransition(target, state, profile, parentKey, action = null) {
		return {
			label: target.slice(1),
			state: cloneRuntimeState(state),
			profile,
			parentKey,
			action,
		}
	}

	function witnessFor(key) {
		const choices = []
		let cursor = key
		while (cursor !== null) {
			const entry = parents.get(cursor)
			assert.ok(entry, `missing witness predecessor for ${cursor}`)
			if (entry.action) choices.push(entry.action)
			cursor = entry.parentKey
		}
		return choices.reverse()
	}

	let queueIndex = 0
	while (queueIndex < queue.length) {
		const current = queue[queueIndex]
		queue[queueIndex++] = null
		if (["endofplay", "ending"].includes(current.label)) continue
		const key = runtimeStateKey(
			current.label,
			current.profile,
			current.state,
			liveVariables.get(current.label) ?? new Set(),
		)
		if (visited.has(key)) continue
		visited.add(key)
		parents.set(key, {parentKey: current.parentKey, action: current.action})

		const normalizedScene = normalizeSceneId(current.label)
		if (sceneIds.has(normalizedScene)) {
			reachedScenes.add(normalizedScene)
			endingProfiles.get(current.label)?.add(current.profile.name)
			if (endingProfiles.has(current.label)) {
				const witness = {
					profile: current.profile.name,
					choices: witnessFor(key),
				}
				if (!endingWitnesses.has(current.label))
					endingWitnesses.set(current.label, witness)
				if (!endingProfileWitnesses.get(current.label).has(current.profile.name))
					endingProfileWitnesses.get(current.label).set(current.profile.name, witness)
			}
			const match = /^s0*(\d+)(a?)$/.exec(normalizedScene)
			if (match) {
				queue.push({
					label: `skip${Number.parseInt(match[1], 10)}${match[2]}`,
					state: cloneRuntimeState(current.state),
					profile: current.profile,
					parentKey: key,
					action: null,
				})
			} else if (current.label === "openning") {
				queue.push({
					label: "s20",
					state: cloneRuntimeState(current.state),
					profile: current.profile,
					parentKey: key,
					action: null,
				})
			}
			continue
		}

		const body = blocks.get(current.label)
		assert.notEqual(body, undefined, `state traversal reached missing block *${current.label}`)
		reachedLabels.add(current.label)
		const lines = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
		const lastLine = lines.at(-1) ?? ""
		if (!(lastLine.startsWith("select") || lastLine.startsWith("goto")))
			lines.push(`goto *${nextLogicLabel.get(current.label)}`)
		const state = cloneRuntimeState(current.state)
		let terminated = false
		for (const line of lines) {
			const separator = line.search(/\s|$/)
			const command = line.slice(0, separator)
			const argument = line.slice(separator + 1)
			if (["inc", "dec"].includes(command)) {
				const oldValue = readRuntimeVariable(argument, state, current.profile)
				writeRuntimeVariable(argument, oldValue + (command === "inc" ? 1 : -1), state)
				continue
			}
			if (["mov", "add", "sub"].includes(command)) {
				const [name, rawValue] = argument.split(",")
				const value = rawValue.startsWith("%")
					? readRuntimeVariable(rawValue, state, current.profile)
					: Number.parseInt(rawValue, 10)
				assert.equal(Number.isNaN(value), false, `invalid mutation ${line}`)
				const oldValue = readRuntimeVariable(name, state, current.profile)
				writeRuntimeVariable(
					name,
					command === "mov" ? value : oldValue + (command === "add" ? value : -value),
					state,
				)
				continue
			}
			if (command === "if") {
				const match = /^\(([^)]*)\)\s+(.+)$/.exec(argument)
				assert.ok(match, `ill-formed conditional ${line}`)
				if (!evaluateRuntimeCondition(match[1], state, current.profile)) continue
				const nested = /^(goto|gosub)\s+(\*\w+)$/.exec(match[2])
				assert.ok(nested, `unsupported conditional instruction ${match[2]}`)
				queue.push(targetTransition(nested[2], state, current.profile, key))
				terminated = true
				break
			}
			if (["goto", "osiete"].includes(command)) {
				queue.push(targetTransition(argument, state, current.profile, key))
				terminated = true
				break
			}
			if (command === "gosub") {
				if (argument !== "*ending") {
					queue.push(targetTransition(argument, state, current.profile, key))
					terminated = true
					break
				}
				continue
			}
			if (command === "select") {
				reachedSelections.add(current.label)
				let enabled = 0
				for (const [index, item] of argument.split(",").entries()) {
					const match = /^(\([^\)]*\))?(\[[^\]]*\])?(\*\w+)$/.exec(item)
					assert.ok(match, `unable to parse selection ${item}`)
					const hide = match[1]?.slice(1, -1)
					const disable = match[2]?.slice(1, -1)
					if (hide && !evaluateRuntimeCondition(hide, state, current.profile)) continue
					if (disable && !evaluateRuntimeCondition(disable, state, current.profile)) continue
					enabled++
					selectableOptions.add(`${current.label}:${index}`)
					queue.push(targetTransition(
						match[3],
						state,
						current.profile,
						key,
						{
							choiceKey: current.label.replace(/^skip/, "f"),
							optionIndex: index,
							target: match[3].slice(1),
							text: choiceTexts[current.label.replace(/^skip/, "f")]?.[index] ?? null,
						},
					))
				}
				if (!enabled) deadSelections.push(`${current.profile.name}:*${current.label}`)
				terminated = true
				break
			}
			throw new Error(`unsupported logic command ${line}`)
		}
		assert.equal(terminated, true, `*${current.label} did not transfer control`)
	}

	return {
		reachedLabels,
		reachedScenes,
		reachedSelections,
		selectableOptions,
		deadSelections,
		endingProfiles,
		endingWitnesses,
		endingProfileWitnesses,
		stateCount: visited.size,
	}
}

test("every en-mao scene parses with exact Japanese engine topology", () => {
	const jpNames = sceneNames(JP_SCENES)
	const enNames = sceneNames(EN_SCENES)

	assert.equal(enNames.length, 438)
	assert.deepEqual(enNames, jpNames)
	assert.equal(enNames.some(name => name.startsWith("pd_")), false)

	let englishTextTokens = 0
	for (const name of enNames) {
		const jpTokens = parseScene(JP_SCENES, name)
		const enTokens = parseScene(EN_SCENES, name)
		assert.deepEqual(
			engineSignature(enTokens),
			engineSignature(jpTokens),
			`${name}: English engine topology differs from Japanese`,
		)
		for (const token of enTokens) {
			if (token instanceof TextToken) {
				englishTextTokens++
				assert.equal(
					token.text.startsWith("`"),
					false,
					`${name}: ASCII text marker leaked into displayed text`,
				)
			}
		}
	}
	assert.ok(englishTextTokens > 20_000)
})

test("every runtime media reference has a closed, source-identical asset contract", () => {
	const japanese = sceneAssetManifest(JP_SCENES)
	const english = sceneAssetManifest(EN_SCENES)
	assert.deepEqual(english, japanese, "English and Japanese media dependencies differ")
	assert.equal(english.images.length, EXPECTED_ASSET_COUNTS.sceneImages)
	assert.equal(english.words.length, EXPECTED_ASSET_COUNTS.wordImages)
	assert.equal(english.tracks.length, EXPECTED_ASSET_COUNTS.trackIds)
	assert.equal(english.waves.length, EXPECTED_ASSET_COUNTS.waveIds)
	assert.deepEqual(english.words, ["word/end", "word/fin"])
	assert.deepEqual(english.tracks, ["01", "02", "03", "04", "05", "06", "07", "08", "09"])

	const gallerySource = fs.readFileSync(GALLERY_DATA, "utf8")
	const galleryEntries = [...gallerySource.matchAll(
		/^\s*"([^"]+)"\s*:\s*\{\s*group:\s*"(ark|cel|aki|his|koha)"([^}]*)\}/gm,
	)]
	const gallery = galleryEntries.map(match => match[1])
	const galleryWithoutThumbnails = new Set(
		galleryEntries
			.filter(match => /\bsource:\s*"half-moon"/.test(match[3]))
			.map(match => match[1]),
	)
	assert.equal(new Set(gallery).size, EXPECTED_ASSET_COUNTS.galleryImages)
	assert.equal(
		gallery.length - galleryWithoutThumbnails.size,
		EXPECTED_ASSET_COUNTS.galleryThumbnails,
	)
	assert.deepEqual(
		[...galleryWithoutThumbnails].sort(),
		[
			"half-moon/aki02",
			"half-moon/cmo_01",
			"half-moon/cmo_02",
			"half-moon/his01",
			"half-moon/his02",
		],
	)
	for (const image of galleryWithoutThumbnails) {
		const escaped = image.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		assert.match(
			gallerySource,
			new RegExp(`unlockIds: \\["${escaped}"\\]`),
			`${image} must remain an appended lightbox alternate`,
		)
	}
	const galleryScreen = fs.readFileSync(
		path.join(ROOT, "src/app/screens/GalleryScreen.tsx"),
		"utf8",
	)
	assert.match(galleryScreen, /filter\(image => !cg\.getImg\(image\)\.altOf\)/)
	assert.match(galleryScreen, /shownAlts = \[\.\.\.shownAlts, unlockId\]/)
	assert.match(galleryScreen, /const mainImage = shownAlts\[0\]/)
	for (const image of gallery)
		assert.match(image, /^(?:bg|event|half-moon)\/[A-Za-z0-9_-]+$/, `unsafe gallery image id ${image}`)

	const metadata = JSON.parse(fs.readFileSync(SPRITESHEET_METADATA, "utf8"))
	assert.equal(metadata.f.length, EXPECTED_ASSET_COUNTS.flowchartSheets)
	assert.equal(new Set(metadata.f).size, metadata.f.length)
	for (const sheet of metadata.f)
		assert.match(sheet, /^spritesheet_\d+$/)
	const sceneIds = new Set(sceneNames(EN_SCENES).map(name => name.slice(0, -4)))
	for (const scene of Object.keys(metadata.i))
		assert.ok(sceneIds.has(normalizeSceneId(scene)), `flowchart thumbnail references missing ${scene}`)

	const constants = fs.readFileSync(APP_CONSTANTS, "utf8")
	const chars = /^export const CHARS[^=]*=\s*\[([^\]]+)\]/m.exec(constants)?.[1]
		.match(/'([^']+)'/g)?.map(value => value.slice(1, -1)) ?? []
	assert.deepEqual(chars, ["ark", "cel", "aki", "his", "koha"])
	assert.equal(chars.length, EXPECTED_ASSET_COUNTS.characters)

	// AVIF is the preferred runtime format and WebP is the feature-detected
	// fallback.  Track-source selection makes all three soundtrack directories
	// live dependencies, while gallery thumbnails are separate resources.
	const endpoints = new Set()
	for (const image of english.images)
		for (const format of ["avif", "webp"])
			endpoints.add(`/static/jp/images/${image}.${format}`)
	for (const image of gallery) {
		for (const format of ["avif", "webp"])
			endpoints.add(`/static/jp/images/${image}.${format}`)
		if (!galleryWithoutThumbnails.has(image)) {
			for (const format of ["avif", "webp"])
				endpoints.add(`/static/jp/images_thumb/${image}.${format}`)
		}
	}
	for (const track of english.tracks)
		for (const source of ["CD_original", "CD_everafter", "CD_tsukibako"])
			endpoints.add(`/static/jp/${source}/track${track}.webm`)
	for (const wave of english.waves)
		endpoints.add(`/static/jp/wave/${wave}.webm`)
	for (const sheet of metadata.f)
		for (const format of ["avif", "webp"])
			endpoints.add(`/res/flowchart-spritesheets/${sheet}.${format}`)
	for (const char of chars)
		endpoints.add(`/res/chars/${char}.webp`)

	assert.equal(endpoints.size, EXPECTED_ASSET_COUNTS.remoteEndpoints)
	assert.equal([...endpoints].some(value => value.includes("..")), false)
})

test("lower-case continuation prose remains text, never a command", () => {
	const tokens = parseScene(EN_SCENES, "s104.txt")
	assert.ok(
		tokens.some(
			token => token instanceof TextToken && token.text === "simple,",
		),
	)
	assert.equal(
		tokens.some(
			token => token instanceof CommandToken && token.cmd === "simple",
		),
		false,
	)
})

test("runtime logic has complete branch and scene reachability", () => {
	const sceneIds = new Set(sceneNames(EN_SCENES).map(name => name.slice(0, -4)))
	const source = fs.readFileSync(LOGIC, "utf8")
	const matches = [...source.matchAll(/^\*(\w+)\s*$/gm)]
	assert.equal(matches.length, 883)

	const labels = new Set()
	const blocks = new Map()
	for (let index = 0; index < matches.length; index++) {
		const match = matches[index]
		const label = match[1]
		assert.equal(labels.has(label), false, `duplicate logic label *${label}`)
		labels.add(label)
		const start = match.index + match[0].length
		const end = matches[index + 1]?.index ?? source.length
		blocks.set(label, source.slice(start, end).trim())
	}

	const terminalLabels = new Set(["endofplay", "ending"])
	const adjacency = new Map()
	const referencedScenes = new Set(["openning", "eclipse"])
	const orderedLabels = [...labels]
	for (let index = 0; index < orderedLabels.length; index++) {
		const label = orderedLabels[index]
		const body = blocks.get(label)
		const targets = [...body.matchAll(/\*(\w+)/g)].map(match => match[1])
		const edges = new Set()
		for (const target of targets) {
			const normalizedTarget = normalizeSceneId(target)
			edges.add(normalizedTarget)
			if (sceneIds.has(normalizedTarget))
				referencedScenes.add(normalizedTarget)
			assert.ok(
				labels.has(target) || sceneIds.has(normalizedTarget) || terminalLabels.has(target),
				`*${label} references missing target *${target}`,
			)
		}
		const lines = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
		const last = lines.at(-1) ?? ""
		if (!["goto", "select", "osiete"].some(command => last.startsWith(command))) {
			const fallthrough = orderedLabels[index + 1] ?? "endofplay"
			edges.add(fallthrough)
		}
		adjacency.set(label, edges)
	}

	for (const scene of sceneIds) {
		const match = /^s0*(\d+)(a?)$/.exec(scene)
		if (match) {
			const continuation = `skip${match[1]}${match[2]}`
			assert.ok(labels.has(continuation), `${scene} has no *${continuation}`)
			adjacency.set(scene, new Set([continuation]))
		} else if (scene === "openning") {
			adjacency.set(scene, new Set(["s020"]))
		} else {
			adjacency.set(scene, new Set())
		}
	}

	assert.deepEqual(
		[...sceneIds].filter(scene => !referencedScenes.has(scene)),
		[],
		"generated scenes exist without a logic or external-entry reference",
	)

	const reachable = new Set()
	const queue = ["openning", "f20", "eclipse"]
	while (queue.length) {
		const current = queue.shift()
		if (reachable.has(current) || terminalLabels.has(current))
			continue
		reachable.add(current)
		for (const next of adjacency.get(current) ?? [])
			queue.push(next)
	}
	assert.deepEqual(
		[...labels].filter(label => !reachable.has(label)).sort(),
		EXPECTED_DORMANT_LOGIC,
		"logic contains an unexpected unreachable block",
	)
	// These are exact source-authored dead stubs, not missing runtime routes:
	// f272 is targeted only by a commented-out choice and has no s272 scene;
	// f415/s415 are explicitly removed as inaccessible, leaving skip415 dormant.
	assert.equal(blocks.get("f272"), "goto *f273")
	assert.equal(blocks.get("skip415"), "goto *f361")
	assert.deepEqual(
		[...sceneIds].filter(scene => !reachable.has(scene)),
		[],
		"generated scenes are unreachable from runtime entrypoints",
	)
})

test("runtime conditions admit every scene, choice, and route ending", () => {
	const sceneIds = new Set(sceneNames(EN_SCENES).map(name => name.slice(0, -4)))
	const source = fs.readFileSync(LOGIC, "utf8")
	const englishChoices = JSON.parse(fs.readFileSync(EN_GAME, "utf8")).choices
	const {orderedLabels, blocks} = logicBlocks(source)
	const result = stateAwareTraversal(source, sceneIds, englishChoices)

	assert.deepEqual(result.deadSelections, [], "a reachable selection has no enabled option")
	assert.deepEqual(
		[...sceneIds].filter(scene => !result.reachedScenes.has(scene)),
		[],
		"a generated scene is structurally linked but infeasible under runtime state",
	)
	assert.deepEqual(
		orderedLabels.filter(
			label => !EXPECTED_DORMANT_LOGIC.includes(label) && !result.reachedLabels.has(label),
		),
		[],
		"a non-dormant logic block is infeasible under runtime state",
	)

	const allSelectionOptions = new Set()
	const allSelectionLabels = new Set()
	for (const [label, body] of blocks) {
		const selections = [...body.matchAll(/^select\s+(.+)$/gm)]
		for (const selection of selections) {
			allSelectionLabels.add(label)
			for (const [index] of selection[1].split(",").entries())
				allSelectionOptions.add(`${label}:${index}`)
		}
	}
	assert.equal(allSelectionLabels.size, 106)
	assert.equal(allSelectionOptions.size, EXPECTED_CHOICE_OPTION_COUNT)
	assert.deepEqual(
		[...allSelectionLabels].filter(label => !result.reachedSelections.has(label)),
		[],
		"a runtime selection site is infeasible",
	)
	assert.deepEqual(
		[...allSelectionOptions].filter(option => !result.selectableOptions.has(option)),
		[],
		"a displayed runtime option can never become selectable",
	)

	for (const [name, scene] of Object.entries(ROUTE_ENDINGS)) {
		assert.ok(
			result.endingProfiles.get(scene)?.size,
			`${name} (${scene}) is unreachable under all valid clearance profiles`,
		)
		assert.deepEqual(
			[...result.endingProfiles.get(scene)].sort(),
			[...EXPECTED_ENDING_PROFILES[scene]].sort(),
			`${name} (${scene}) clearance gating changed`,
		)
		const witness = result.endingWitnesses.get(scene)
		assert.ok(witness, `${name} (${scene}) lacks a selectable-choice witness`)
		assert.ok(
			EXPECTED_ENDING_PROFILES[scene].includes(witness.profile),
			`${name} witness uses an invalid clearance profile`,
		)
		assert.ok(witness.choices.length > 5, `${name} witness is implausibly short`)
		for (const choice of witness.choices) {
			assert.ok(Object.hasOwn(englishChoices, choice.choiceKey))
			assert.equal(
				choice.text,
				englishChoices[choice.choiceKey][choice.optionIndex],
			)
			assert.ok(choice.text.trim())
			assert.match(choice.target, /^\w+$/)
		}

		const profileWitnesses = result.endingProfileWitnesses.get(scene)
		assert.ok(profileWitnesses, `${name} (${scene}) lacks profile witnesses`)
		assert.deepEqual(
			[...profileWitnesses.keys()].sort(),
			[...EXPECTED_ENDING_PROFILES[scene]].sort(),
			`${name} (${scene}) lacks a witness for a valid clearance profile`,
		)
		for (const profile of EXPECTED_ENDING_PROFILES[scene]) {
			const profileWitness = profileWitnesses.get(profile)
			assert.equal(profileWitness.profile, profile)
			assert.ok(profileWitness.choices.length > 5)
			for (const choice of profileWitness.choices) {
				assert.equal(
					choice.text,
					englishChoices[choice.choiceKey][choice.optionIndex],
				)
			}
		}
	}
	assert.ok(result.stateCount > 1_000)
	assert.ok(result.stateCount < 1_000_000)
})

test("every runtime selection has one complete English choice table", () => {
	const choices = JSON.parse(fs.readFileSync(EN_GAME, "utf8")).choices
	const source = fs.readFileSync(LOGIC, "utf8")
	const matches = [...source.matchAll(/^\*(\w+)\s*$/gm)]
	const found = new Map()

	for (let index = 0; index < matches.length; index++) {
		const match = matches[index]
		const label = match[1]
		const start = match.index + match[0].length
		const end = matches[index + 1]?.index ?? source.length
		const body = source.slice(start, end).trim()
		const selections = [...body.matchAll(/^select\s+(.+)$/gm)]
		assert.ok(selections.length <= 1, `*${label} has multiple select commands`)
		if (!selections.length)
			continue

		const choiceKey = label.replace(/^skip/, "f")
		const targetCount = [...selections[0][1].matchAll(/\*(\w+)/g)].length
		assert.equal(found.has(choiceKey), false, `duplicate choice table ${choiceKey}`)
		assert.ok(Object.hasOwn(choices, choiceKey), `missing English choices for *${label}`)
		assert.equal(
			choices[choiceKey].length,
			targetCount,
			`${choiceKey} choice count differs from runtime target count`,
		)
		for (const choice of choices[choiceKey])
			assert.ok(typeof choice === "string" && choice.trim(), `${choiceKey} has an empty choice`)
		found.set(choiceKey, targetCount)
	}

	assert.equal(found.size, 106)
	assert.deepEqual(
		Object.keys(choices).filter(choiceKey => !found.has(choiceKey)),
		[],
		"English game data contains an orphan choice table",
	)
})

test("inline waits remain commands and retain the v1.1 heartbeat cadence", () => {
	const sceneFiles = fs.readdirSync(EN_SCENES).filter(name => name.endsWith(".txt"))
	const corpus = sceneFiles
		.map(name => fs.readFileSync(path.join(EN_SCENES, name), "utf8"))
		.join("\n")
	assert.doesNotMatch(corpus, /!@w\d+/)

	const heartbeat = fs.readFileSync(path.join(EN_SCENES, "s422.txt"), "utf8")
	assert.match(
		heartbeat,
		/`Thump\n`Thump!w1000[\s\S]*`Thump\n`Thump!w1000[\s\S]*`Thump\n`Thump!w750[\s\S]*`Thump!w750[\s\S]*`Thump!w500[\s\S]*`Thump!w500[\s\S]*`Thump!w250[\s\S]*`Thump!w250[\s\S]*`Thump!w250/,
	)
})

test("opening contains exactly the centered continuations reserved at runtime", () => {
	const opening = fs.readFileSync(path.join(EN_SCENES, "openning.txt"), "utf8")
	const centeredContinuations = opening
		.split("\n")
		.filter(line => line.startsWith("`[center]") && line.includes("@"))
	assert.equal(centeredContinuations.length, 20)
	assert.equal(
		centeredContinuations.reduce(
			(total, line) => total + [...line.matchAll(/@/g)].length,
			0,
		),
		20,
	)
})
