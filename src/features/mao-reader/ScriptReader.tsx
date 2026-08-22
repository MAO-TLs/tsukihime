import {
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import type {MaoAuditRepository} from "./data"
import {stripInlineWaitCommands} from "./display-text"
import HighlightedText, {
	positionInteractiveHighlights,
	type InteractiveHighlight,
} from "./HighlightedText"
import {ReaderError, ReaderLoading} from "./ReaderStates"
import type {
	MaoAuditManifest,
	MaoReaderLocation,
	MaoScriptLine,
	MaoScriptSummary,
	MaoSearchEntry,
	MirrorMoonError,
	SearchScope,
} from "./types"
import {useAsyncResource} from "./useAsyncResource"

const GLOBAL_RESULT_BATCH = 100

interface ScriptReaderProps {
	manifest: MaoAuditManifest
	repository: MaoAuditRepository
	initialSectionId?: string
	initialScriptId?: string
	initialRef?: string
	initialScope?: SearchScope
	initialQuery?: string
	initialFilterSectionId?: string
	initialShowMirrorMoon?: boolean
	initialShowErrors?: boolean
	onLocationChange?: (location: MaoReaderLocation) => void
}

const normalizeSearchText = (value: string): string => value
	.normalize("NFKC")
	.toLocaleLowerCase()
	.replace(/\s+/gu, " ")
	.trim()

const compactSearchText = (value: string): string => value.replace(/\s+/gu, "")

const searchable = (...values: Array<string | undefined>): string =>
	normalizeSearchText(values.filter(Boolean).join("\n"))

const matches = (query: string, ...values: Array<string | undefined>): boolean =>
	!query || searchable(...values).includes(query) || compactSearchText(searchable(...values)).includes(compactSearchText(query))

function scriptNeighbors(
	manifest: MaoAuditManifest,
	script: MaoScriptSummary,
): {previous?: MaoScriptSummary; next?: MaoScriptSummary} {
	const ordered = [...manifest.scripts].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
	const index = ordered.findIndex(item => item.id === script.id)
	return {
		previous: script.previousId
			? ordered.find(item => item.id === script.previousId)
			: ordered[index - 1],
		next: script.nextId
			? ordered.find(item => item.id === script.nextId)
			: ordered[index + 1],
	}
}

const errorCategoryLabel = (value?: string): string =>
	(value || "editorial finding")
		.split("_")
		.filter(Boolean)
		.map(word => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
		.join(" ")

function LineError({error, lineRef, relatedDossiers = [], onClose}: {
	error: MirrorMoonError
	lineRef: string
	relatedDossiers?: Array<{id: string; label: string}>
	onClose: () => void
}) {
	const evidence = error.evidence.filter(item => item.ref === lineRef)
	const displayedEvidence = evidence.length > 0 ? evidence : error.evidence
	return (
		<aside className="todokanai-error-note" aria-labelledby={`error-${error.id}`}>
			<header>
				<div>
					{error.category && <span className="todokanai-error-category">{errorCategoryLabel(error.category)}</span>}
					<span className="todokanai-error-severity">{error.severity}</span>
				</div>
				<button type="button" onClick={onClose} aria-label="Close audit note">Close</button>
			</header>
			<code id={`error-${error.id}`}>{lineRef}</code>
			{displayedEvidence.length > 0 && (
				<>
					{displayedEvidence.map((item, index) => (
						<div key={`${item.ref}-${index}`}>
							<div className="todokanai-error-evidence" lang="ja">
								<span>Japanese</span>
								<p><HighlightedText text={item.japanese} highlights={[item.japaneseHighlight ?? ""]} tone="japanese" /></p>
							</div>
							<div className="todokanai-error-evidence">
								<span>mirror moon</span>
								<p><HighlightedText text={item.mirrorMoon} highlights={[item.mirrorMoonHighlight ?? ""]} tone="mirror" /></p>
							</div>
						</div>
					))}
				</>
			)}
			<p className="todokanai-error-explanation"><strong>{error.title}</strong><br />{error.reason}</p>
			<div className="todokanai-error-actions">
				<a href={`#${encodeURIComponent(lineRef)}`}>Open this line in context →</a>
				{relatedDossiers.map(dossier => <a key={dossier.id} href={`${import.meta.env.BASE_URL}audit/?dossier=${encodeURIComponent(dossier.id)}`}>{dossier.label} <span aria-hidden>→</span></a>)}
			</div>
		</aside>
	)
}

function ScriptLine({
	line,
	showMirrorMoon,
	showErrors,
	isTarget,
	activeErrorKey,
	dossiersByFinding,
	onTarget,
	onToggleError,
}: {
	line: MaoScriptLine
	showMirrorMoon: boolean
	showErrors: boolean
	isTarget: boolean
	activeErrorKey?: string
	dossiersByFinding: Map<string, Array<{id: string; label: string}>>
	onTarget: (ref: string) => void
	onToggleError: (errorKey: string) => void
}) {
	const errorKey = (errorId: string) => `${line.ref}::${errorId}`
	const hasError = line.mirrorMoonErrors.length > 0
	const lineEvidence = line.mirrorMoonErrors.flatMap(error =>
		error.evidence.filter(evidence => evidence.ref === line.ref))
	const japaneseHighlights = showErrors
		? lineEvidence.map(evidence => evidence.japaneseHighlight ?? "")
		: []
	const mirrorMoonAnnotations: InteractiveHighlight[] = showErrors
		? line.mirrorMoonErrors.flatMap(error => error.evidence
			.filter(evidence => evidence.ref === line.ref && Boolean(evidence.mirrorMoonHighlight))
			.map(evidence => ({
				id: errorKey(error.id),
				text: evidence.mirrorMoonHighlight ?? "",
				label: errorCategoryLabel(error.category),
				description: error.reason,
				active: activeErrorKey === errorKey(error.id),
			})))
		: []
	const positionedErrorKeys = new Set(
		line.mirrorMoon
			? positionInteractiveHighlights(line.mirrorMoon, mirrorMoonAnnotations).map(range => range.highlight.id)
			: [],
	)
	const unpositionedErrors = showErrors
		? line.mirrorMoonErrors.filter(error => !positionedErrorKeys.has(errorKey(error.id)))
		: []
	const activeError = line.mirrorMoonErrors.find(error => activeErrorKey === errorKey(error.id))
	return (
		<article
			id={line.ref}
			data-line-ref={line.ref}
			tabIndex={-1}
			className={`script-line${showMirrorMoon ? " script-line-comparison" : ""}${hasError && showErrors ? " script-line-error" : ""}${isTarget ? " script-line-target" : ""}`}
		>
			<a className="line-ref" href={`#${encodeURIComponent(line.ref)}`} aria-label={`Line ${line.ordinal}`} onClick={() => onTarget(line.ref)}>
				{line.ordinal}
			</a>
			<div className="line-cell line-ja" lang="ja">
				<div className="line-cell-heading">
					<span className="speaker speaker-ja" lang="ja">{line.speakerJapanese}</span>
					{showMirrorMoon && <span className="edition-label" lang="en">Japanese</span>}
				</div>
				<p lang="ja">
					<HighlightedText text={line.japanese} highlights={japaneseHighlights} rubySpans={line.ruby} tone="japanese" />
				</p>
			</div>
			<div className="line-cell line-en">
				<div className="line-cell-heading">
					<span className="speaker">{line.speakerEnglish}</span>
					{showMirrorMoon && <span className="edition-label">MAO English</span>}
				</div>
				<p>{stripInlineWaitCommands(line.maoEnglish)}</p>
			</div>
			{showMirrorMoon && (
				<div className="line-cell line-en line-todokanai">
					<div className="line-cell-heading">
						<span className="speaker">{line.speakerEnglish}</span>
						<span className="edition-label">mirror moon</span>
					</div>
					<p>
						{line.mirrorMoon
							? <HighlightedText
								text={line.mirrorMoon}
								interactiveHighlights={mirrorMoonAnnotations}
								onToggleHighlight={onToggleError}
								tone="mirror"
							/>
							: <span className="mao-unavailable">Not aligned</span>}
					</p>
					{unpositionedErrors.length > 0 && (
						<div className="todokanai-error-fallbacks">
							{unpositionedErrors.map(error => (
								<button
									type="button"
									key={error.id}
									aria-expanded={activeErrorKey === errorKey(error.id)}
									onClick={() => onToggleError(errorKey(error.id))}
								>
									View {errorCategoryLabel(error.category).toLowerCase()} note
								</button>
							))}
						</div>
					)}
					{showErrors && activeError && (
						<LineError error={activeError} lineRef={line.ref} relatedDossiers={dossiersByFinding.get(activeError.id)} onClose={() => onToggleError(errorKey(activeError.id))} />
					)}
				</div>
			)}
		</article>
	)
}

function GlobalResult({
	entry,
	script,
	sectionLabel,
	showMirrorMoon,
	onOpen,
}: {
	entry: MaoSearchEntry
	script?: MaoScriptSummary
	sectionLabel?: string
	showMirrorMoon: boolean
	onOpen: (entry: MaoSearchEntry) => void
}) {
	return (
		<article className={`concordance-hit${showMirrorMoon ? " concordance-hit-comparison" : ""}`}>
			<header className="concordance-hit-link">
				<span>{sectionLabel ?? entry.sectionId} · {script?.title ?? (entry.scriptLabel || entry.scriptId)}</span>
				<code>{entry.ref}</code>
				<button type="button" onClick={() => onOpen(entry)}><strong>Open in script →</strong></button>
			</header>
			<div className="concordance-hit-grid">
				<section className="line-cell line-ja" lang="ja"><span className="edition-label">Japanese</span><p>{stripInlineWaitCommands(entry.japanese)}</p></section>
				<section className="line-cell line-en"><span className="edition-label">MAO English</span><p>{stripInlineWaitCommands(entry.maoEnglish)}</p></section>
				{showMirrorMoon && <section className="line-cell line-en line-todokanai"><span className="edition-label">mirror moon</span><p>{entry.mirrorMoon ? stripInlineWaitCommands(entry.mirrorMoon) : <span className="comparison-missing">Not aligned</span>}</p></section>}
			</div>
		</article>
	)
}

export default function ScriptReader({
	manifest,
	repository,
	initialSectionId,
	initialScriptId,
	initialRef,
	initialScope = "script",
	initialQuery = "",
	initialFilterSectionId,
	initialShowMirrorMoon = false,
	initialShowErrors = false,
	onLocationChange,
}: ScriptReaderProps) {
	const firstScript = manifest.scripts.find(script => script.id === initialScriptId && (!initialSectionId || script.sectionId === initialSectionId))
		?? manifest.scripts.find(script => script.sectionId === initialSectionId)
		?? manifest.scripts[0]
	const [sectionId, setSectionId] = useState(firstScript.sectionId)
	const [scriptId, setScriptId] = useState(firstScript.id)
	const [query, setQuery] = useState(initialQuery)
	const [scope, setScope] = useState<SearchScope>(initialScope)
	const [filterSectionId, setFilterSectionId] = useState(initialFilterSectionId ?? "all")
	const [showMirrorMoon, setShowMirrorMoon] = useState(initialShowMirrorMoon || initialShowErrors)
	const [showErrors, setShowErrors] = useState(initialShowErrors)
	const [activeErrorKey, setActiveErrorKey] = useState<string>()
	const [pendingRef, setPendingRef] = useState(initialRef)
	const [activeRef, setActiveRef] = useState(initialRef)
	const [globalResultLimit, setGlobalResultLimit] = useState(GLOBAL_RESULT_BATCH)
	const scrollRoot = useRef<HTMLDivElement>(null)
	const deferredQuery = useDeferredValue(normalizeSearchText(query))
	const initialLocationKey = JSON.stringify([
		initialSectionId,
		initialScriptId,
		initialRef,
		initialScope,
		initialQuery,
		initialFilterSectionId,
		initialShowMirrorMoon,
		initialShowErrors,
	])
	const previousInitialLocationKey = useRef(initialLocationKey)

	const scriptsInSection = useMemo(() => manifest.scripts
		.filter(script => script.sectionId === sectionId)
		.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)), [manifest, sectionId])
	const summary = manifest.scripts.find(script => script.id === scriptId) ?? firstScript
	const neighbors = scriptNeighbors(manifest, summary)
	const scriptResource = useAsyncResource(
		signal => repository.loadScript(scriptId, signal),
		[repository, scriptId],
	)
	const globalResource = useAsyncResource(
		signal => repository.loadSearchIndex(signal),
		[repository],
		scope === "all" && Boolean(deferredQuery),
	)
	const dossierResource = useAsyncResource(
		signal => repository.loadDossiers(signal),
		[repository],
		showErrors,
	)
	const dossiersByFinding = useMemo(() => {
		const result = new Map<string, Array<{id: string; label: string}>>()
		if (dossierResource.status !== "ready")
			return result
		for (const dossier of dossierResource.data.dossiers) {
			for (const example of dossier.examples) {
				const memberships = result.get(example.findingId) ?? []
				if (!memberships.some(item => item.id === dossier.id))
					memberships.push({id: dossier.id, label: dossier.heading})
				result.set(example.findingId, memberships)
			}
		}
		return result
	}, [dossierResource])

	useEffect(() => {
		onLocationChange?.({
			page: "script",
			sectionId,
			scriptId,
			ref: activeRef,
			scope,
			query,
			filterSectionId: scope === "all" && filterSectionId !== "all" ? filterSectionId : undefined,
			showMirrorMoon,
			showErrors: showMirrorMoon && showErrors,
		})
	}, [activeRef, filterSectionId, onLocationChange, query, scope, scriptId, sectionId, showErrors, showMirrorMoon])

	useEffect(() => {
		if (previousInitialLocationKey.current === initialLocationKey)
			return
		previousInitialLocationKey.current = initialLocationKey
		const requested = manifest.scripts.find(script => script.id === initialScriptId && (!initialSectionId || script.sectionId === initialSectionId))
			?? manifest.scripts.find(script => script.sectionId === initialSectionId)
		if (requested) {
			setScriptId(requested.id)
			setSectionId(requested.sectionId)
		}
		setScope(initialScope)
		setQuery(initialQuery)
		setFilterSectionId(initialFilterSectionId ?? "all")
		setShowMirrorMoon(initialShowMirrorMoon || initialShowErrors)
		setShowErrors(initialShowErrors)
		setActiveErrorKey(undefined)
		setActiveRef(initialRef)
		setPendingRef(initialRef)
	}, [initialFilterSectionId, initialLocationKey, initialQuery, initialRef, initialScope, initialScriptId, initialSectionId, initialShowErrors, initialShowMirrorMoon, manifest])

	useEffect(() => {
		setGlobalResultLimit(GLOBAL_RESULT_BATCH)
	}, [deferredQuery, filterSectionId, showMirrorMoon])

	useEffect(() => {
		if (!activeErrorKey)
			return
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape")
				setActiveErrorKey(undefined)
		}
		window.addEventListener("keydown", closeOnEscape)
		return () => window.removeEventListener("keydown", closeOnEscape)
	}, [activeErrorKey])

	useEffect(() => {
		if (scriptResource.status !== "ready" || !pendingRef)
			return
		const target = document.getElementById(pendingRef)
		if (!target)
			return
		target.scrollIntoView({block: "start"})
		if (target instanceof HTMLElement)
			target.focus({preventScroll: true})
		setPendingRef(undefined)
	}, [pendingRef, scriptResource])

	const selectScript = (nextId: string, ref?: string) => {
		const next = manifest.scripts.find(script => script.id === nextId)
		if (!next)
			return
		setSectionId(next.sectionId)
		setScriptId(next.id)
		setActiveErrorKey(undefined)
		setActiveRef(ref)
		setPendingRef(ref)
		scrollRoot.current?.closest(".mao-reader-shell")?.scrollTo({top: 0, behavior: "auto"})
	}

	const localLines = scriptResource.status === "ready"
		? scriptResource.data.lines.filter(line => matches(
			deferredQuery,
			line.ref,
			line.speakerEnglish,
			line.speakerJapanese,
			line.japanese,
			line.maoEnglish,
			showMirrorMoon ? line.mirrorMoon : undefined,
		))
		: []
	const globalMatches = globalResource.status === "ready"
		? globalResource.data.filter(entry => matches(
			deferredQuery,
			entry.ref,
			entry.speaker,
			entry.japanese,
			entry.maoEnglish,
			showMirrorMoon ? entry.mirrorMoon : undefined,
		))
		: []
	const sectionCounts = useMemo(() => {
		const counts = new Map<string, number>()
		for (const entry of globalMatches)
			counts.set(entry.sectionId, (counts.get(entry.sectionId) ?? 0) + 1)
		return counts
	}, [globalMatches])
	const filteredGlobalMatches = filterSectionId === "all"
		? globalMatches
		: globalMatches.filter(entry => entry.sectionId === filterSectionId)

	const mirrorAvailable = scriptResource.status === "ready"
		? scriptResource.data.lines.filter(line => line.mirrorMoon !== undefined).length
		: 0
	const errorCount = scriptResource.status === "ready"
		? scriptResource.data.lines.reduce((sum, line) => sum + line.mirrorMoonErrors.length, 0)
		: 0
	const resultStatus = scope === "all"
		? deferredQuery
			? `${filteredGlobalMatches.length.toLocaleString()} matching line${filteredGlobalMatches.length === 1 ? "" : "s"}`
			: `${manifest.lineCount.toLocaleString()} lines across ${manifest.scriptCount.toLocaleString()} scripts`
		: `${localLines.length.toLocaleString()} lines`

	return (
		<section className="mao-reader-content reader-shell shell compact" ref={scrollRoot}>
			<div className="reader-controls" id="reader-controls" aria-label="Script controls">
				<div className="control">
					<label htmlFor="mao-section">Section</label>
					<select id="mao-section" value={sectionId} disabled={scope === "all"} onChange={event => {
						const nextSection = event.target.value
						const nextScript = manifest.scripts
							.filter(script => script.sectionId === nextSection)
							.sort((a, b) => a.order - b.order)[0]
						setSectionId(nextSection)
						if (nextScript)
							selectScript(nextScript.id)
					}}>
						{manifest.sections.map(section => <option key={section.id} value={section.id}>{section.label}</option>)}
					</select>
				</div>

				<div className="control">
					<label htmlFor="mao-script">Script</label>
					<div className="script-picker">
						<button type="button" disabled={scope === "all" || !neighbors.previous} onClick={() => neighbors.previous && selectScript(neighbors.previous.id)} aria-label="Previous script">←</button>
						<select id="mao-script" value={scriptId} disabled={scope === "all"} onChange={event => selectScript(event.target.value)}>
							{scriptsInSection.map(script => (
								<option key={script.id} value={script.id}>{script.label} · {script.lineCount.toLocaleString()} lines</option>
							))}
						</select>
						<button type="button" disabled={scope === "all" || !neighbors.next} onClick={() => neighbors.next && selectScript(neighbors.next.id)} aria-label="Next script">→</button>
					</div>
				</div>

				<fieldset className="search-scope">
					<legend>Search scope</legend>
					<div className="scope-options">
						<label>
							<input type="radio" name="search-scope" value="script" checked={scope === "script"} onChange={() => { setScope("script"); setGlobalResultLimit(GLOBAL_RESULT_BATCH) }} />
							<span>This script</span>
						</label>
						<label>
							<input type="radio" name="search-scope" value="all" checked={scope === "all"} onChange={() => { setScope("all"); setGlobalResultLimit(GLOBAL_RESULT_BATCH) }} />
							<span>All scripts</span>
						</label>
					</div>
				</fieldset>

				<div className="control">
					<label htmlFor="mao-search">Search {scope === "all" ? `all ${manifest.lineCount.toLocaleString()} lines` : "this script"}</label>
					<input
						id="mao-search"
						type="search"
						value={query}
						onChange={event => setQuery(event.target.value)}
						placeholder="English, 日本語, speaker, or exact ref"
						aria-describedby="search-status"
					/>
				</div>

				<div className="result-count" id="search-status" role="status" aria-live="polite" aria-atomic="true">{resultStatus}</div>

				<label className="comparison-toggle">
						<input type="checkbox" checked={showMirrorMoon} onChange={event => {
							setShowMirrorMoon(event.target.checked)
							if (!event.target.checked) {
								setShowErrors(false)
								setActiveErrorKey(undefined)
							}
						}} />
						<span>Display mirror moon for comparison</span>
						<small>{mirrorAvailable.toLocaleString()} of {summary.lineCount.toLocaleString()} lines available in this script</small>
					</label>
					{showMirrorMoon && <div className="comparison-errors-row">
						<label className="comparison-toggle comparison-toggle-errors">
							<input type="checkbox" checked={showErrors} onChange={event => {
								setShowErrors(event.target.checked)
								setActiveErrorKey(undefined)
							}} />
							<span>Display mirror moon errors</span>
						</label>
						<small className="comparison-errors-status" aria-live="polite">{errorCount.toLocaleString()} adjudicated errors in this script</small>
					</div>}
			</div>

			{scope === "all" ? (
				<section className="concordance" aria-live="polite">
					<div className="script-meta concordance-meta">
						<div><p className="eyebrow">All {manifest.scriptCount} scripts</p><h2>Corpus concordance</h2></div>
						{globalResource.status === "ready" && deferredQuery && <p>{filteredGlobalMatches.length.toLocaleString()} matching lines</p>}
					</div>
					{!deferredQuery && <div className="concordance-prompt"><p className="eyebrow">Full-corpus search</p><h2>Search all {manifest.lineCount.toLocaleString()} lines</h2><p>Enter a Japanese or English phrase, speaker name, script number, or exact reference to search the complete corpus.</p></div>}
					{globalResource.status === "loading" && <ReaderLoading label="Searching the complete corpus…" />}
					{globalResource.status === "error" && <ReaderError error={globalResource.error} />}
					{globalResource.status === "ready" && deferredQuery && (
						<>
							<nav className="concordance-route-filter" aria-label="Filter concordance results by section">
								<button type="button" className={filterSectionId === "all" ? "is-active" : ""} aria-pressed={filterSectionId === "all"} disabled={globalMatches.length === 0} onClick={() => { setFilterSectionId("all"); setGlobalResultLimit(GLOBAL_RESULT_BATCH) }}>
									All sections <span>{globalMatches.length.toLocaleString()}</span>
								</button>
								{manifest.sections.map(section => {
									const count = sectionCounts.get(section.id) ?? 0
									return <button type="button" className={filterSectionId === section.id ? "is-active" : ""} key={section.id} aria-pressed={filterSectionId === section.id} disabled={count === 0} onClick={() => { setFilterSectionId(section.id); setGlobalResultLimit(GLOBAL_RESULT_BATCH) }}>
										{section.label} <span>{count.toLocaleString()}</span>
									</button>
								})}
							</nav>
							<div className="concordance-results" id="concordance-results">{filteredGlobalMatches.slice(0, globalResultLimit).map(entry => (
								<GlobalResult
									key={`${entry.scriptId}-${entry.ref}`}
									entry={entry}
									script={manifest.scripts.find(script => script.id === entry.scriptId)}
									sectionLabel={manifest.sections.find(section => section.id === entry.sectionId)?.label}
									showMirrorMoon={showMirrorMoon}
									onOpen={item => { setScope("script"); selectScript(item.scriptId, item.ref) }}
								/>
							))}</div>
							{filteredGlobalMatches.length > globalResultLimit && <button className="concordance-more" type="button" onClick={() => setGlobalResultLimit(limit => limit + GLOBAL_RESULT_BATCH)}>Show next <span>{Math.min(GLOBAL_RESULT_BATCH, filteredGlobalMatches.length - globalResultLimit).toLocaleString()} lines</span></button>}
							{!filteredGlobalMatches.length && <p className="mao-empty">No lines match this query in the selected section.</p>}
						</>
					)}
				</section>
			) : (
				<>
					<div className="script-meta">
						<h2>{summary.title}</h2>
						<p>{summary.lineCount.toLocaleString()} source lines</p>
					</div>
					{scriptResource.status === "loading" && <ReaderLoading label="Opening the script…" />}
					{scriptResource.status === "error" && <ReaderError error={scriptResource.error} />}
					{scriptResource.status === "ready" && localLines.length > 0 && <div className="script-lines" id="script-results">{localLines.map(line => (
						<ScriptLine
							key={line.ref}
							line={line}
							showMirrorMoon={showMirrorMoon}
							showErrors={showErrors}
							isTarget={activeRef === line.ref}
							activeErrorKey={activeErrorKey}
							dossiersByFinding={dossiersByFinding}
							onTarget={ref => setActiveRef(ref)}
							onToggleError={errorKey => setActiveErrorKey(current => current === errorKey ? undefined : errorKey)}
						/>
					))}</div>}
					{scriptResource.status === "ready" && !localLines.length && <p className="mao-empty">No lines in this script match the query.</p>}
					<a className="back-to-controls" href="#reader-controls">Back to controls ↑</a>
				</>
			)}
		</section>
	)
}
