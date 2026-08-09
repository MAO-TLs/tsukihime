export type SearchScope = "script" | "all"
export type ReaderPage = "script" | "audit"

export interface MaoSectionSummary {
	id: string
	label: string
	order: number
}

export interface MaoScriptSummary {
	id: string
	sectionId: string
	label: string
	title: string
	lineCount: number
	order: number
	previousId?: string
	nextId?: string
}

export interface MaoMethodologyCopy {
	summary?: string
	boundary?: string
	disputes?: string
}

export interface MaoAuditManifest {
	schemaVersion?: string
	projectTitle: string
	translationVersion?: string
	findingCount: number
	lineCount: number
	sectionCount: number
	scriptCount: number
	sections: MaoSectionSummary[]
	scripts: MaoScriptSummary[]
	methodology?: MaoMethodologyCopy
}

export interface RubySpan {
	start: number
	end: number
	reading: string
	base?: string
}

export interface AuditEvidence {
	ref: string
	japanese: string
	mirrorMoon: string
	japaneseHighlight?: string
	mirrorMoonHighlight?: string
	label?: string
	routes: string[]
	titles: string[]
}

export interface MirrorMoonError {
	id: string
	title: string
	severity: string
	category?: string
	reason: string
	refs: string[]
	evidence: AuditEvidence[]
}

export interface MaoScriptLine {
	ref: string
	ordinal: number
	speakerJapanese?: string
	speakerEnglish?: string
	japanese: string
	maoEnglish: string
	mirrorMoon?: string
	ruby: RubySpan[]
	mirrorMoonErrors: MirrorMoonError[]
}

export interface MaoScriptDocument {
	id: string
	sectionId: string
	title: string
	label: string
	previousId?: string
	nextId?: string
	lines: MaoScriptLine[]
}

export interface MaoSearchEntry {
	scriptId: string
	sectionId: string
	scriptLabel: string
	ref: string
	ordinal: number
	speaker?: string
	japanese: string
	maoEnglish: string
	mirrorMoon?: string
}

export interface DossierExample {
	findingId: string
	title: string
	severity: string
	category?: string
	subsection: string
	refs: string[]
	evidence: AuditEvidence[]
	publicExplanation?: string
}

export interface DossierCounterexample {
	counterexampleId: string
	title: string
	limitsSubsection?: string
	refs: string[]
	evidence: AuditEvidence[]
	whyItWorks: string
}

export interface MaoDossierSubsection {
	id: string
	name: string
	purpose?: string
	boundedQuestion?: string
	findingIds: string[]
}

export interface MaoDossier {
	id: string
	slug: string
	heading: string
	claim: string
	notClaiming: string
	cumulativeEffect: string
	methodNote?: string
	subsections: MaoDossierSubsection[]
	examples: DossierExample[]
	counterexamples: DossierCounterexample[]
	relatedDossierIds: string[]
}

export interface MaoDossierCollection {
	dossiers: MaoDossier[]
	methodology?: MaoMethodologyCopy
}

export interface MaoReaderLocation {
	page: ReaderPage
	sectionId?: string
	scriptId?: string
	ref?: string
	dossierId?: string
	scope?: SearchScope
	query?: string
	filterSectionId?: string
	showMirrorMoon?: boolean
	showErrors?: boolean
}
