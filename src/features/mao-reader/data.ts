import type {
	AuditEvidence,
	DossierCounterexample,
	DossierExample,
	MaoAuditManifest,
	MaoDossier,
	MaoDossierCollection,
	MaoDossierSubsection,
	MaoScriptDocument,
	MaoScriptLine,
	MaoScriptSummary,
	MaoSearchEntry,
	MaoSectionSummary,
	MirrorMoonError,
	RubySpan,
} from "./types"

type JsonRecord = Record<string, unknown>

export class MaoAuditDataError extends Error {
	readonly resource?: string

	constructor(message: string, resource?: string) {
		super(message)
		this.name = "MaoAuditDataError"
		this.resource = resource
	}
}

const isRecord = (value: unknown): value is JsonRecord =>
	typeof value === "object" && value !== null && !Array.isArray(value)

const asRecord = (value: unknown, label: string): JsonRecord => {
	if (!isRecord(value))
		throw new MaoAuditDataError(`${label} must be an object`)
	return value
}

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : []

const first = (record: JsonRecord, ...keys: string[]): unknown => {
	for (const key of keys) {
		if (record[key] !== undefined && record[key] !== null)
			return record[key]
	}
	return undefined
}

const text = (value: unknown, fallback = ""): string =>
	typeof value === "string" ? value : fallback

const requiredText = (value: unknown, label: string): string => {
	const result = text(value).trim()
	if (!result)
		throw new MaoAuditDataError(`${label} must be nonempty text`)
	return result
}

const integer = (value: unknown, fallback = 0): number =>
	typeof value === "number" && Number.isFinite(value)
		? Math.max(0, Math.trunc(value))
		: fallback

const textArray = (value: unknown): string[] =>
	asArray(value).filter((item): item is string => typeof item === "string")

const nestedCount = (raw: JsonRecord, ...keys: string[]): number | undefined => {
	const counts = isRecord(raw.counts) ? raw.counts : {}
	for (const key of keys) {
		const value = first(raw, key) ?? counts[key]
		if (typeof value === "number" && Number.isFinite(value))
			return Math.max(0, Math.trunc(value))
	}
	return undefined
}

const ROUTE_SECTION_LABELS: Record<string, string> = {
	system: "Choices & system text",
	ark: "Arcueid",
	cel: "Ciel",
	aki: "Akiha",
	his: "Hisui",
	koha: "Kohaku",
	others: "Other",
	shared: "Shared routes",
}

const ROUTE_SECTION_ORDER = ["system", "ark", "cel", "aki", "his", "koha", "others", "shared"]

const routeSectionId = (raw: JsonRecord, fallback = ""): string => {
	const explicit = text(first(raw, "sectionId", "section_id", "section", "route")).trim()
	if (explicit)
		return explicit
	const routes = textArray(raw.routes)
	if (routes.length === 1)
		return routes[0]
	if (routes.length > 1)
		return "shared"
	return fallback || "system"
}

const normalizeSection = (value: unknown, index: number): MaoSectionSummary => {
	const raw = asRecord(value, `manifest.sections[${index}]`)
	const id = requiredText(first(raw, "id", "section_id", "slug"), `section ${index}.id`)
	return {
		id,
		label: requiredText(first(raw, "label", "heading", "title", "name") ?? id, `section ${id}.label`),
		order: integer(first(raw, "order", "index"), index),
	}
}

const normalizeScriptSummary = (
	value: unknown,
	index: number,
	fallbackSectionId = "",
): MaoScriptSummary => {
	const raw = asRecord(value, `manifest.scripts[${index}]`)
	const id = requiredText(first(raw, "id", "script_id", "script"), `script ${index}.id`)
	const sectionId = routeSectionId(raw, fallbackSectionId)
	const label = text(first(raw, "label", "short_label", "display_id", "display_title"), id)
	return {
		id,
		sectionId,
		label,
		title: text(first(raw, "title", "heading", "name", "display_title"), label),
		lineCount: integer(first(raw, "lineCount", "line_count", "lines", "page_count")),
		order: integer(first(raw, "order", "index", "sort_index"), index),
		previousId: text(first(raw, "previousId", "previous_id", "previous")) || undefined,
		nextId: text(first(raw, "nextId", "next_id", "next")) || undefined,
	}
}

export function normalizeManifest(value: unknown): MaoAuditManifest {
	const raw = asRecord(value, "manifest")
	const rawSections = asArray(first(raw, "sections", "routes"))
	const declaredSections = rawSections.map(normalizeSection).sort((a, b) => a.order - b.order)
	const sectionScripts = rawSections.flatMap((sectionValue, sectionIndex) => {
		if (!isRecord(sectionValue))
			return []
		const sectionId = declaredSections.find(item => item.order === integer(first(sectionValue, "order", "index"), sectionIndex))?.id
			?? text(first(sectionValue, "id", "section_id", "slug"))
		return asArray(sectionValue.scripts).map((script, index) =>
			normalizeScriptSummary(script, index, sectionId))
	})
	const topLevelScripts = asArray(first(raw, "scripts", "script_index"))
		.map((script, index) => normalizeScriptSummary(script, index))
	const scripts = (topLevelScripts.length ? topLevelScripts : sectionScripts)
		.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
	const usedSectionIds = [...new Set(scripts.map(script => script.sectionId))]
	const sections = declaredSections.length ? declaredSections : usedSectionIds
		.sort((a, b) => {
			const aOrder = ROUTE_SECTION_ORDER.indexOf(a)
			const bOrder = ROUTE_SECTION_ORDER.indexOf(b)
			return (aOrder < 0 ? 999 : aOrder) - (bOrder < 0 ? 999 : bOrder) || a.localeCompare(b)
		})
		.map((id, order) => ({id, label: ROUTE_SECTION_LABELS[id] ?? id, order}))
	if (!sections.length || !scripts.length)
		throw new MaoAuditDataError("manifest must describe at least one section and script")

	const findingCount = nestedCount(raw, "findingCount", "finding_count", "public_findings", "confirmed_findings")
	if (findingCount === undefined)
		throw new MaoAuditDataError("manifest must provide the adjudicated finding count")

	const methodologyRaw = isRecord(raw.methodology) ? raw.methodology : undefined
	return {
		schemaVersion: text(first(raw, "schemaVersion", "schema_version", "schema")) || undefined,
		projectTitle: text(first(raw, "projectTitle", "project_title", "title"), "Tsukihime"),
		translationVersion: text(first(raw, "translationVersion", "translation_version", "version")) || undefined,
		findingCount,
		lineCount: nestedCount(raw, "lineCount", "line_count", "lines")
			?? scripts.reduce((sum, script) => sum + script.lineCount, 0),
		sectionCount: nestedCount(raw, "sectionCount", "section_count") ?? sections.length,
		scriptCount: nestedCount(raw, "scriptCount", "script_count") ?? scripts.length,
		sections,
		scripts,
		methodology: methodologyRaw ? {
			summary: text(methodologyRaw.summary) || undefined,
			boundary: text(methodologyRaw.boundary) || undefined,
			disputes: text(methodologyRaw.disputes) || undefined,
		} : undefined,
	}
}

const normalizeRuby = (value: unknown, textLength: number): RubySpan[] =>
	asArray(value)
		.map((item, index) => {
			if (!isRecord(item))
				return undefined
			const start = integer(first(item, "start", "from", "source_start"), -1)
			const end = integer(first(item, "end", "to", "source_end"), -1)
			const reading = text(first(item, "reading", "ruby", "rt")).trim()
			const base = text(item.base).trim() || undefined
			return start >= 0 && end > start && end <= textLength && reading
				? {start, end, reading, base, index}
				: undefined
		})
		.filter((item): item is {start: number; end: number; reading: string; base: string | undefined; index: number} => item !== undefined)
		.sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index)
		.reduce<RubySpan[]>((result, item) => {
			if (!result.length || item.start >= result[result.length - 1].end)
				result.push(item.base
					? {start: item.start, end: item.end, reading: item.reading, base: item.base}
					: {start: item.start, end: item.end, reading: item.reading})
			return result
		}, [])

const normalizeEvidence = (value: unknown, index: number): AuditEvidence => {
	const raw = asRecord(value, `evidence[${index}]`)
	return {
		ref: requiredText(first(raw, "ref", "reference"), `evidence ${index}.ref`),
		japanese: text(first(raw, "japanese", "source")),
		mirrorMoon: text(first(raw, "mirrorMoon", "mirror_moon", "translation")),
		japaneseHighlight: text(first(raw, "japaneseHighlight", "japanese_highlight", "japanese_excerpt")) || undefined,
		mirrorMoonHighlight: text(first(raw, "mirrorMoonHighlight", "mirror_moon_highlight")) || undefined,
		label: text(raw.label) || undefined,
		routes: textArray(raw.routes),
		titles: textArray(raw.titles),
	}
}

const normalizeError = (value: unknown, index: number): MirrorMoonError => {
	const raw = asRecord(value, `errors[${index}]`)
	const id = requiredText(first(raw, "id", "finding_id"), `error ${index}.id`)
	return {
		id,
		title: requiredText(first(raw, "title", "heading") ?? id, `error ${id}.title`),
		severity: text(raw.severity, "finding"),
		category: text(raw.category) || undefined,
		reason: requiredText(first(raw, "reason", "public_explanation", "explanation"), `error ${id}.reason`),
		refs: textArray(raw.refs),
		evidence: asArray(raw.evidence).map(normalizeEvidence),
	}
}

export const normalizeFindingLookup = (value: unknown): Map<string, MirrorMoonError> => {
	const raw = asRecord(value, "findings")
	const findings = asArray(first(raw, "findings", "public_findings"))
	return new Map(findings.map((finding, index) => {
		const normalized = normalizeError(finding, index)
		return [normalized.id, normalized]
	}))
}

const normalizeLine = (
	value: unknown,
	index: number,
	findingLookup: ReadonlyMap<string, MirrorMoonError>,
	annotationIds: string[] = [],
): MaoScriptLine => {
	const raw = asRecord(value, `script.lines[${index}]`)
	const ref = requiredText(first(raw, "ref", "reference", "id"), `line ${index}.ref`)
	const japanese = text(first(raw, "japanese", "source", "jp"))
	const embeddedErrors = asArray(first(raw, "mirrorMoonErrors", "mirror_moon_errors", "errors"))
		.filter(isRecord)
		.map(normalizeError)
	const errorIds = [...new Set([
		...annotationIds,
		...textArray(first(raw, "errorIds", "error_ids")),
	])]
	const linkedErrors = errorIds.map(id => findingLookup.get(id)).filter((error): error is MirrorMoonError => Boolean(error))
	return {
		ref,
		ordinal: integer(first(raw, "ordinal", "line", "line_number", "index"), index + 1),
		speakerJapanese: text(first(raw, "speakerJapanese", "speaker_japanese", "speaker_jp")) || undefined,
		speakerEnglish: text(first(raw, "speakerEnglish", "speaker_english", "speaker")) || undefined,
		japanese,
		maoEnglish: text(first(raw, "maoEnglish", "mao_english", "english", "mao")),
		mirrorMoon: text(first(raw, "mirrorMoon", "mirror_moon", "legacy_english")) || undefined,
		ruby: normalizeRuby(first(raw, "ruby", "ruby_spans"), japanese.length),
		mirrorMoonErrors: [...new Map([...embeddedErrors, ...linkedErrors].map(error => [error.id, error])).values()],
	}
}

export function normalizeScriptDocument(
	value: unknown,
	requestedId?: string,
	findingLookup: ReadonlyMap<string, MirrorMoonError> = new Map(),
): MaoScriptDocument {
	const raw = asRecord(value, "script")
	const id = requiredText(first(raw, "id", "script_id") ?? requestedId, "script.id")
	const annotations = isRecord(first(raw, "errorAnnotationsByRef", "error_annotations_by_ref"))
		? first(raw, "errorAnnotationsByRef", "error_annotations_by_ref") as JsonRecord
		: {}
	const lines = asArray(first(raw, "lines", "rows", "entries", "pages")).map((line, index) => {
		const lineRaw = isRecord(line) ? line : {}
		const ref = text(first(lineRaw, "ref", "reference", "id"))
		const annotationValues = asArray(annotations[ref])
		const annotationIds = annotationValues.flatMap(item => {
			if (typeof item === "string")
				return [item]
			if (isRecord(item))
				return [text(first(item, "id", "finding_id"))].filter(Boolean)
			return []
		})
		return normalizeLine(line, index, findingLookup, annotationIds)
	})
	if (!lines.length)
		throw new MaoAuditDataError(`script ${id} has no lines`)
	return {
		id,
		sectionId: routeSectionId(raw),
		title: text(first(raw, "title", "heading", "name", "display_title"), id),
		label: text(first(raw, "label", "display_id"), id),
		previousId: text(first(raw, "previousId", "previous_id", "previous")) || undefined,
		nextId: text(first(raw, "nextId", "next_id", "next")) || undefined,
		lines,
	}
}

export function normalizeSearchIndex(value: unknown): MaoSearchEntry[] {
	const container = Array.isArray(value) ? undefined : asRecord(value, "search index")
	const rawEntries = Array.isArray(value)
		? value
		: asArray(first(container!, "entries", "rows", "results"))
	const fieldNames = container ? textArray(container.fields) : []
	return rawEntries.map((value, index) => {
		if (Array.isArray(value)) {
			if (!fieldNames.length)
				throw new MaoAuditDataError("positional search rows require a fields array")
			const positional = Object.fromEntries(fieldNames.map((field, fieldIndex) => [field, value[fieldIndex]]))
			return {
				scriptId: requiredText(positional.script_id, `search entry ${index}.scriptId`),
				sectionId: text(positional.section_id),
				scriptLabel: text(positional.label),
				ref: requiredText(positional.ref, `search entry ${index}.ref`),
				ordinal: integer(positional.ordinal, index + 1),
				speaker: text(positional.speaker) || undefined,
				japanese: text(positional.japanese),
				maoEnglish: text(positional.mao_english),
				mirrorMoon: text(positional.mirror_moon) || undefined,
			}
		}
		const raw = asRecord(value, `search index entry ${index}`)
		return {
			scriptId: requiredText(first(raw, "scriptId", "script_id", "script"), `search entry ${index}.scriptId`),
			sectionId: text(first(raw, "sectionId", "section_id", "section", "route")),
			scriptLabel: text(first(raw, "scriptLabel", "script_label", "label")),
			ref: requiredText(first(raw, "ref", "reference"), `search entry ${index}.ref`),
			ordinal: integer(first(raw, "ordinal", "line", "line_number"), index + 1),
			speaker: text(first(raw, "speaker", "speaker_english")) || undefined,
			japanese: text(first(raw, "japanese", "source", "jp")),
			maoEnglish: text(first(raw, "maoEnglish", "mao_english", "english", "mao")),
			mirrorMoon: text(first(raw, "mirrorMoon", "mirror_moon", "legacy_english")) || undefined,
		}
	})
}

const normalizeDossierExample = (value: unknown, index: number): DossierExample => {
	const raw = asRecord(value, `dossier example ${index}`)
	const findingId = requiredText(first(raw, "findingId", "finding_id", "id"), `dossier example ${index}.findingId`)
	return {
		findingId,
		title: requiredText(first(raw, "title", "heading") ?? findingId, `dossier example ${findingId}.title`),
		severity: text(raw.severity, "finding"),
		category: text(raw.category) || undefined,
		subsection: requiredText(first(raw, "subsection", "section"), `dossier example ${findingId}.subsection`),
		refs: textArray(raw.refs),
		evidence: asArray(raw.evidence).map(normalizeEvidence),
		// Deliberately exclude representative_reason and direct_or_inferential.
		publicExplanation: text(first(raw, "publicExplanation", "public_explanation", "reason")) || undefined,
	}
}

const normalizeCounterexample = (value: unknown, index: number): DossierCounterexample => {
	const raw = asRecord(value, `dossier counterexample ${index}`)
	const counterexampleId = requiredText(
		first(raw, "counterexampleId", "counterexample_id", "id"),
		`dossier counterexample ${index}.counterexampleId`,
	)
	return {
		counterexampleId,
		title: requiredText(first(raw, "title", "heading") ?? counterexampleId, `counterexample ${counterexampleId}.title`),
		limitsSubsection: text(first(raw, "limitsSubsection", "limits_subsection")) || undefined,
		refs: textArray(raw.refs),
		evidence: asArray(raw.evidence).map(normalizeEvidence),
		whyItWorks: requiredText(
			first(raw, "whyItWorks", "why_it_works_or_remains_open", "reason"),
			`counterexample ${counterexampleId}.whyItWorks`,
		),
		// claim_boundary remains intentionally unmaterialized in the UI type.
	}
}

const normalizeDossier = (value: unknown, index: number): MaoDossier => {
	const raw = asRecord(value, `dossier ${index}`)
	const id = requiredText(first(raw, "id", "dossier_id"), `dossier ${index}.id`)
	const normalizeSubsection = (value: unknown, subsectionIndex: number): MaoDossierSubsection => {
		if (typeof value === "string")
			return {id: `${id}-${subsectionIndex + 1}`, name: value, findingIds: []}
		const subsection = asRecord(value, `dossier ${id}.subsections[${subsectionIndex}]`)
		const name = requiredText(
			first(subsection, "name", "title", "heading"),
			`dossier ${id}.subsections[${subsectionIndex}].name`,
		)
		return {
			id: text(first(subsection, "id", "slug"), `${id}-${subsectionIndex + 1}`),
			name,
			purpose: text(subsection.purpose) || undefined,
			boundedQuestion: text(first(subsection, "boundedQuestion", "bounded_question")) || undefined,
			findingIds: textArray(first(subsection, "findingIds", "finding_ids", "example_finding_ids")),
		}
	}

	return {
		id,
		slug: text(raw.slug, id),
		heading: requiredText(first(raw, "heading", "title"), `dossier ${id}.heading`),
		claim: requiredText(raw.claim, `dossier ${id}.claim`),
		notClaiming: requiredText(first(raw, "notClaiming", "not_claiming"), `dossier ${id}.notClaiming`),
		cumulativeEffect: requiredText(first(raw, "cumulativeEffect", "cumulative_effect"), `dossier ${id}.cumulativeEffect`),
		methodNote: text(first(raw, "methodNote", "method_note")) || undefined,
		subsections: asArray(raw.subsections).map(normalizeSubsection),
		examples: asArray(raw.examples).map(normalizeDossierExample),
		counterexamples: asArray(raw.counterexamples).map(normalizeCounterexample),
		relatedDossierIds: textArray(first(raw, "relatedDossierIds", "related_dossier_ids")),
	}
}

export function normalizeDossiers(value: unknown): MaoDossierCollection {
	const raw = asRecord(value, "dossiers")
	const dossiers = asArray(raw.dossiers).map(normalizeDossier)
	if (!dossiers.length)
		throw new MaoAuditDataError("dossiers.json has no dossiers")
	const methodologyRaw = isRecord(raw.methodology) ? raw.methodology : undefined
	return {
		dossiers,
		methodology: methodologyRaw ? {
			summary: text(methodologyRaw.summary) || undefined,
			boundary: text(methodologyRaw.boundary) || undefined,
			disputes: text(methodologyRaw.disputes) || undefined,
		} : undefined,
	}
}

const withTrailingSlash = (value: string): string => `${value.replace(/\/+$/, "")}/`

export function maoAuditBaseUrl(baseUrl = import.meta.env.BASE_URL): string {
	return `${withTrailingSlash(baseUrl)}static/mao-audit/`
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
	let response: Response
	try {
		response = await fetch(url, {signal, headers: {Accept: "application/json"}})
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError")
			throw error
		throw new MaoAuditDataError(`Could not load ${url}`, url)
	}
	if (!response.ok)
		throw new MaoAuditDataError(`Could not load ${url} (${response.status})`, url)
	try {
		return await response.json()
	} catch {
		throw new MaoAuditDataError(`${url} did not contain valid JSON`, url)
	}
}

export class MaoAuditRepository {
	readonly baseUrl: string
	private readonly cache = new Map<string, Promise<unknown>>()
	private findingLookup?: Promise<Map<string, MirrorMoonError>>

	constructor(baseUrl = maoAuditBaseUrl()) {
		this.baseUrl = withTrailingSlash(baseUrl)
	}

	private resource(path: string): string {
		return new URL(path, new URL(this.baseUrl, window.location.href)).toString()
	}

	private async load<T>(
		path: string,
		normalize: (value: unknown) => T,
		signal?: AbortSignal,
	): Promise<T> {
		const url = this.resource(path)
		if (signal)
			return normalize(await fetchJson(url, signal))
		let request = this.cache.get(url)
		if (!request) {
			request = fetchJson(url)
			this.cache.set(url, request)
			request.catch(() => this.cache.delete(url))
		}
		return normalize(await request)
	}

	loadManifest(signal?: AbortSignal): Promise<MaoAuditManifest> {
		return this.load("manifest.json", normalizeManifest, signal)
	}

	private loadFindingLookup(): Promise<Map<string, MirrorMoonError>> {
		if (!this.findingLookup)
			this.findingLookup = this.load("findings.json", normalizeFindingLookup)
				.catch(error => {
					this.findingLookup = undefined
					throw error
				})
		return this.findingLookup
	}

	async loadScript(id: string, signal?: AbortSignal): Promise<MaoScriptDocument> {
		const safeId = encodeURIComponent(id)
		const raw = await this.load(`scripts/${safeId}.json`, value => value, signal)
		const record = asRecord(raw, `script ${id}`)
		const annotations = isRecord(first(record, "errorAnnotationsByRef", "error_annotations_by_ref"))
			? first(record, "errorAnnotationsByRef", "error_annotations_by_ref") as JsonRecord
			: {}
		const requiresLookup = Object.values(annotations).some(items =>
			asArray(items).some(item => typeof item === "string"))
		const lookup = requiresLookup ? await this.loadFindingLookup() : new Map<string, MirrorMoonError>()
		return normalizeScriptDocument(raw, id, lookup)
	}

	loadSearchIndex(signal?: AbortSignal): Promise<MaoSearchEntry[]> {
		return this.load("search-index.json", normalizeSearchIndex, signal)
	}

	loadDossiers(signal?: AbortSignal): Promise<MaoDossierCollection> {
		return this.load("dossiers.json", normalizeDossiers, signal)
	}
}
