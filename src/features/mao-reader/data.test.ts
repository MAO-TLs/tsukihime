import assert from "node:assert/strict"
import test from "node:test"
// @ts-expect-error Node's strip-only TypeScript test runner requires the source extension.
const data = await import("./data.ts")
const {
	dedupeVisibleEvidence,
	normalizeDossiers,
	normalizeFindingLookup,
	normalizeManifest,
	normalizeSearchIndex,
	normalizeScriptDocument,
} = data

const evidence = {
	ref: "tsuki:mm-audit:00001",
	japanese: "月姫",
	mirror_moon: "Tsukihime",
	japanese_sha256: "source-hash",
	mirror_moon_sha256: "translation-hash",
}

test("visually identical repeated evidence renders once without changing the source package", () => {
	const visibleEvidence = {
		...evidence,
		mirrorMoon: evidence.mirror_moon,
		mirrorMoonHighlight: "But it is so boring, it is not even funny.",
		routes: [],
		titles: [],
	}
	const repeatedEvidence = {
		...visibleEvidence,
		ref: "tsuki:mm-audit:00002",
		mirrorMoon: `${visibleEvidence.mirrorMoon} A harmless punctuation variant.`,
	}
	const distinctEvidence = {
		...visibleEvidence,
		ref: "tsuki:mm-audit:00003",
		mirrorMoon: "Moon Princess",
		mirrorMoonHighlight: "Moon Princess",
	}
	assert.deepEqual(
		dedupeVisibleEvidence([visibleEvidence, repeatedEvidence, distinctEvidence]).map((item: {ref: string}) => item.ref),
		[visibleEvidence.ref, distinctEvidence.ref],
	)
})

test("manifest accepts nested section scripts and publishes the finding headline", () => {
	const manifest = normalizeManifest({
		title: "Tsukihime",
		counts: {public_findings: 1500, lines: 42000},
		sections: [{
			id: "near-side",
			label: "Near Side",
			scripts: [{id: "s01", label: "Day one", line_count: 12}],
		}],
	})
	assert.equal(manifest.findingCount, 1500)
	assert.equal(manifest.scripts[0].sectionId, "near-side")
	assert.equal(manifest.scripts[0].lineCount, 12)
})

test("packaged preview manifest derives route sections and positional search rows", () => {
	const manifest = normalizeManifest({
		schema: "tsukihime_script_browser_manifest_v1",
		counts: {public_findings: 1500, aligned_pages: 2, script_chunks: 2},
		scripts: [
			{script_id: "script-000", display_title: "Choices & system text", routes: [], page_count: 1, sort_index: 0},
			{script_id: "script-001", display_title: "4 / Black Beast II", routes: ["ark"], page_count: 1, sort_index: 1},
		],
	})
	assert.deepEqual(manifest.sections.map((section: {id: string}) => section.id), ["system", "ark"])
	assert.equal(manifest.scripts[1].title, "4 / Black Beast II")
	assert.equal(manifest.lineCount, 2)

	const rows = normalizeSearchIndex({
		fields: ["script_id", "page_index", "ordinal", "ref", "label", "japanese", "mao_english", "mirror_moon", "error_ids"],
		rows: [["script-001", 0, 104, "tsuki:mm-audit:00104", "s100", "日本語", "MAO", "mirror moon", []]],
	})
	assert.equal(rows[0].scriptId, "script-001")
	assert.equal(rows[0].ref, "tsuki:mm-audit:00104")
	assert.equal(rows[0].maoEnglish, "MAO")
})

test("script normalization retains exact refs, curated ruby, and nested errors", () => {
	const script = normalizeScriptDocument({
		id: "s01",
		section_id: "near-side",
		lines: [{
			ref: "tsuki:script:s01:1",
			japanese: "遠野志貴",
			mao_english: "Shiki Tohno",
			mirror_moon: "Tohno Shiki",
			ruby_spans: [{start: 0, end: 2, reading: "とおの"}],
			mirror_moon_errors: [{
				id: "mm-0001",
				title: "Name order changes",
				severity: "major",
				reason: "The public reason.",
				refs: ["tsuki:script:s01:1"],
				evidence: [evidence],
			}],
		}],
	})
	assert.equal(script.lines[0].ref, "tsuki:script:s01:1")
	assert.deepEqual(script.lines[0].ruby, [{start: 0, end: 2, reading: "とおの"}])
	assert.equal(script.lines[0].mirrorMoonErrors[0].id, "mm-0001")
})

test("packaged preview script joins separate public findings and source-indexed ruby", () => {
	const findings = normalizeFindingLookup({findings: [{
		id: "mm-0001",
		title: "A bounded error",
		severity: "material",
		category: "meaning",
		reason: "The public reason.",
		refs: [evidence.ref],
		evidence: [evidence],
	}]})
	const script = normalizeScriptDocument({
		script_id: "script-008",
		display_title: "Mystic Eyes",
		routes: ["ark"],
		error_annotations_by_ref: {[evidence.ref]: ["mm-0001"]},
		pages: [{
			ref: evidence.ref,
			ordinal: 1,
			japanese: "屍食鬼（グール）",
			mao_english: "ghoul",
			mirror_moon: "ghoul",
			error_ids: ["mm-0001"],
			ruby_spans: [{base: "屍食鬼", reading: "グール", source_start: 0, source_end: 8}],
		}],
	}, undefined, findings)
	assert.equal(script.sectionId, "ark")
	assert.deepEqual(script.lines[0].ruby, [{start: 0, end: 8, reading: "グール", base: "屍食鬼"}])
	assert.deepEqual(script.lines[0].mirrorMoonErrors.map((error: {id: string}) => error.id), ["mm-0001"])
})

test("public dossier objects keep reasons but exclude editorial scaffold fields", () => {
	const collection = normalizeDossiers({
		dossiers: [{
			id: "01",
			slug: "focalization",
			heading: "Focalization",
			claim: "A bounded claim.",
			not_claiming: "A bounded limit.",
			cumulative_effect: "A cumulative effect.",
			method_note: "Frozen evidence only.",
			subsections: [{
				name: "Named self",
				bounded_question: "Is the named self preserved?",
				finding_ids: ["mm-0001"],
			}],
			examples: [{
				finding_id: "mm-0001",
				title: "Named-self distance is lost",
				severity: "major",
				category: "focalization",
				subsection: "Named self",
				reason: "The public source-bound explanation.",
				representative_reason: "Internal scaffold that must not render.",
				direct_or_inferential: "direct",
				refs: [evidence.ref],
				evidence: [evidence],
			}],
			counterexamples: [{
				counterexample_id: "mm-counterexample-0001",
				title: "A successful line",
				reason: "The difficult feature survives.",
				claim_boundary: "Internal boundary scaffold.",
				refs: [evidence.ref],
				evidence: [evidence],
			}],
			related_dossier_ids: [],
		}],
	})
	const dossier = collection.dossiers[0]
	assert.equal(dossier.subsections[0].name, "Named self")
	assert.equal(dossier.methodNote, "Frozen evidence only.")
	assert.equal(dossier.examples[0].publicExplanation, "The public source-bound explanation.")
	assert.equal(dossier.counterexamples[0].whyItWorks, "The difficult feature survives.")
	assert.equal("representativeReason" in dossier.examples[0], false)
	assert.equal("claimBoundary" in dossier.counterexamples[0], false)
})
