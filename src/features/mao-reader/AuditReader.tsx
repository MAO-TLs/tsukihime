import {useEffect, useState} from "react"
import {dedupeVisibleEvidence, type MaoAuditRepository} from "./data"
import {ReaderError, ReaderLoading} from "./ReaderStates"
import type {
	DossierCounterexample,
	DossierExample,
	MaoAuditManifest,
	MaoDossier,
	MaoReaderLocation,
} from "./types"
import {useAsyncResource} from "./useAsyncResource"

interface AuditReaderProps {
	manifest: MaoAuditManifest
	repository: MaoAuditRepository
	initialDossierId?: string
	onLocationChange?: (location: MaoReaderLocation) => void
	onOpenScriptRef?: (ref: string) => void
}

interface DossierGroupDefinition {
	id: string
	label: string
	dossierIds: string[]
}

interface DossierGroup extends DossierGroupDefinition {
	dossiers: MaoDossier[]
}

const DEFAULT_SUMMARY =
	"The audit evaluates mirror moon's English independently against the Japanese source. It was not used to create or revise the MAO translation. Every public finding is bounded to inspectable evidence; recurring-pattern dossiers do not turn a local error into a universal rule."

const DEFAULT_BOUNDARY =
	"Red findings are adjudicated source errors. Counterexamples record places where mirror moon handles the same kind of difficulty successfully and prevent the dossier claims from expanding beyond their evidence. Editorial scaffolding, model deliberation, and rejected candidates are not part of the public cards."

const DOSSIER_GROUPS: DossierGroupDefinition[] = [
	{
		id: "character-architecture",
		label: "Character architecture",
		dossierIds: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"],
	},
	{
		id: "relationship-and-revelation",
		label: "Relationship and reveal architecture",
		dossierIds: ["11", "12"],
	},
	{
		id: "metaphysics-bodies-and-action",
		label: "Metaphysics, bodies, and action",
		dossierIds: ["13", "14", "15", "16", "17", "18"],
	},
	{
		id: "voice-and-literary-form",
		label: "Voice and literary form",
		dossierIds: ["19", "20", "21"],
	},
	{
		id: "continuity-and-presentation",
		label: "Continuity and formal presentation",
		dossierIds: ["22", "23"],
	},
]

function dossierGroups(dossiers: MaoDossier[]): DossierGroup[] {
	const dossierById = new Map(dossiers.map(dossier => [dossier.id, dossier]))
	const groupedIds = new Set(DOSSIER_GROUPS.flatMap(group => group.dossierIds))
	const groups = DOSSIER_GROUPS.map(group => ({
		...group,
		dossiers: group.dossierIds.flatMap(id => {
			const dossier = dossierById.get(id)
			return dossier ? [dossier] : []
		}),
	})).filter(group => group.dossiers.length > 0)
	const ungrouped = dossiers
		.filter(dossier => !groupedIds.has(dossier.id))
		.sort((left, right) => left.id.localeCompare(right.id, undefined, {numeric: true}))
	if (ungrouped.length > 0) {
		groups.push({
			id: "additional-analysis",
			label: "Additional analysis",
			dossierIds: ungrouped.map(dossier => dossier.id),
			dossiers: ungrouped,
		})
	}
	return groups
}

function HighlightedText({text, highlight}: {text: string; highlight?: string}) {
	if (!highlight) return <>{text}</>
	const start = text.indexOf(highlight)
	if (start < 0) return <>{text}</>
	const end = start + highlight.length
	return <>{text.slice(0, start)}<mark className="mao-audit-inline-highlight">{text.slice(start, end)}</mark>{text.slice(end)}</>
}

function ExampleCard({
	example,
	onOpenScriptRef,
}: {
	example: DossierExample
	onOpenScriptRef?: (ref: string) => void
}) {
	return (
		<article className="mao-dossier-card mao-dossier-card--finding audit-example audit-example-finding">
			<div className="mao-dossier-card__meta audit-example-heading">
				<div>
					<span>Confirmed error</span>
					{example.category && <small>{example.category.replaceAll("_", " ")}</small>}
				</div>
				<code>{example.refs[0] ?? example.findingId}</code>
			</div>
			{dedupeVisibleEvidence(example.evidence).map(evidence => <div className="audit-example-visible-evidence" key={evidence.ref}>
				<p lang="ja"><HighlightedText text={evidence.japanese} highlight={evidence.japaneseHighlight} /></p>
				<p><HighlightedText text={evidence.mirrorMoon} highlight={evidence.mirrorMoonHighlight} /></p>
			</div>)}
			<small>{example.publicExplanation ?? example.title}</small>
			{onOpenScriptRef && example.refs[0] && (
				<button type="button" className="mao-text-link audit-example-link" onClick={() => onOpenScriptRef(example.refs[0])}>
					<b>Open in script context →</b>
				</button>
			)}
		</article>
	)
}

function CounterexampleCard({
	counterexample,
	onOpenScriptRef,
}: {
	counterexample: DossierCounterexample
	onOpenScriptRef?: (ref: string) => void
}) {
	return (
		<article className="mao-dossier-card mao-dossier-card--counterexample audit-example audit-example-counterexample">
			<div className="mao-dossier-card__meta audit-example-heading">
				<div>
					<span>Counterexample</span>
					{counterexample.limitsSubsection && <small>{counterexample.limitsSubsection}</small>}
				</div>
				<code>{counterexample.refs[0] ?? counterexample.counterexampleId}</code>
			</div>
			{dedupeVisibleEvidence(counterexample.evidence).map(evidence => <div className="audit-example-visible-evidence" key={evidence.ref}>
				<p lang="ja"><HighlightedText text={evidence.japanese} highlight={evidence.japaneseHighlight} /></p>
				<p><HighlightedText text={evidence.mirrorMoon} highlight={evidence.mirrorMoonHighlight} /></p>
			</div>)}
			<small>{counterexample.whyItWorks}</small>
			{onOpenScriptRef && counterexample.refs[0] && (
				<button type="button" className="mao-text-link audit-example-link" onClick={() => onOpenScriptRef(counterexample.refs[0])}>
					<b>Open in script context →</b>
				</button>
			)}
		</article>
	)
}

function DossierDisclosure({
	dossier,
	dossiers,
	open,
	onToggle,
	onSelect,
	onOpenScriptRef,
}: {
	dossier: MaoDossier
	dossiers: MaoDossier[]
	open: boolean
	onToggle: (open: boolean) => void
	onSelect: (id: string) => void
	onOpenScriptRef?: (ref: string) => void
}) {
	return (
		<details
			className="audit-dossier mao-audit-dossier"
			id={`dossier-${dossier.id}`}
			open={open}
			onToggle={event => onToggle(event.currentTarget.open)}
		>
			<summary>
				<div>
					<p className="audit-dossier-count">
						{dossier.examples.length} confirmed example{dossier.examples.length === 1 ? "" : "s"}
						{dossier.counterexamples.length > 0 && ` · ${dossier.counterexamples.length} counterexample${dossier.counterexamples.length === 1 ? "" : "s"}`}
					</p>
					<h3><span>{dossier.id}</span> {dossier.heading}</h3>
				</div>
				<span className="audit-dossier-toggle" aria-hidden>
					<span>Open dossier</span>
					<span>Close dossier</span>
				</span>
			</summary>
			<div className="audit-dossier-body">
				<button type="button" className="audit-permalink" onClick={() => onSelect(dossier.id)}>
					Permanent link to this dossier #
				</button>
				<p className="audit-dossier-claim">{dossier.claim}</p>
				<dl className="audit-dossier-definition">
					<div><dt>Limits</dt><dd>{dossier.notClaiming}</dd></div>
					<div><dt>Cumulative effect</dt><dd>{dossier.cumulativeEffect}</dd></div>
					{dossier.methodNote && <div><dt>Evidence note</dt><dd>{dossier.methodNote}</dd></div>}
				</dl>

				<div className="mao-dossier-cards audit-example-list">
					{dossier.examples.map(example => <ExampleCard key={example.findingId} example={example} onOpenScriptRef={onOpenScriptRef} />)}
					{dossier.counterexamples.map(counterexample => <CounterexampleCard key={counterexample.counterexampleId} counterexample={counterexample} onOpenScriptRef={onOpenScriptRef} />)}
				</div>

				{dossier.relatedDossierIds.length > 0 && (
					<nav className="mao-related-dossiers" aria-label="Related dossiers">
						<h3>Related dossiers</h3>
						<div>{dossier.relatedDossierIds.map(id => {
							const related = dossiers.find(item => item.id === id)
							return related && <button type="button" key={id} onClick={() => onSelect(id)}>{id} · {related.heading}</button>
						})}</div>
					</nav>
				)}
			</div>
		</details>
	)
}

export default function AuditReader({
	manifest,
	repository,
	initialDossierId,
	onLocationChange,
	onOpenScriptRef,
}: AuditReaderProps) {
	const [selectedId, setSelectedId] = useState(initialDossierId)
	const [openDossierIds, setOpenDossierIds] = useState(() => new Set(initialDossierId ? [initialDossierId] : []))
	const [openGroupIds, setOpenGroupIds] = useState(() => new Set([
		...DOSSIER_GROUPS.map(group => group.id),
		"additional-analysis",
	]))
	const resource = useAsyncResource(signal => repository.loadDossiers(signal), [repository])

	useEffect(() => {
		if (!initialDossierId) return
		setSelectedId(initialDossierId)
		setOpenDossierIds(current => new Set(current).add(initialDossierId))
	}, [initialDossierId])

	useEffect(() => {
		onLocationChange?.({page: "audit", dossierId: selectedId})
	}, [onLocationChange, selectedId])

	useEffect(() => {
		if (resource.status !== "ready" || !initialDossierId) return
		const group = dossierGroups(resource.data.dossiers)
			.find(item => item.dossiers.some(dossier => dossier.id === initialDossierId))
		if (group) setOpenGroupIds(current => new Set(current).add(group.id))
		const frame = requestAnimationFrame(() => {
			const target = document.getElementById(`dossier-${initialDossierId}`)
			target?.closest<HTMLDetailsElement>("details.audit-group")?.setAttribute("open", "")
			target?.scrollIntoView({block: "start"})
		})
		return () => cancelAnimationFrame(frame)
	}, [initialDossierId, resource.status])

	if (resource.status !== "ready")
		return resource.status === "error"
			? <div className="mao-reader-scroll"><ReaderError error={resource.error} /></div>
			: <div className="mao-reader-scroll"><ReaderLoading label="Opening the audit record…" /></div>

	const collection = resource.data
	const methodology = collection.methodology ?? manifest.methodology
	const groups = dossierGroups(collection.dossiers)
	const findingMembershipCount = collection.dossiers.reduce((total, dossier) => total + dossier.examples.length, 0)
	const counterexampleMembershipCount = collection.dossiers.reduce((total, dossier) => total + dossier.counterexamples.length, 0)
	const uniqueCounterexampleCount = new Set(collection.dossiers.flatMap(dossier => dossier.counterexamples.map(item => item.counterexampleId))).size
	const uniqueEvidenceRefCount = new Set(collection.dossiers.flatMap(dossier => [
		...dossier.examples.flatMap(example => example.evidence.map(evidence => evidence.ref)),
		...dossier.counterexamples.flatMap(counterexample => counterexample.evidence.map(evidence => evidence.ref)),
	])).size

	function selectDossier(id: string) {
		setOpenDossierIds(current => new Set(current).add(id))
		const group = groups.find(item => item.dossiers.some(dossier => dossier.id === id))
		if (group) setOpenGroupIds(current => new Set(current).add(group.id))
		setSelectedId(id)
		requestAnimationFrame(() => {
			const target = document.getElementById(`dossier-${id}`)
			target?.closest<HTMLDetailsElement>("details.audit-group")?.setAttribute("open", "")
			target?.scrollIntoView({behavior: "smooth", block: "start"})
		})
	}

	function toggleDossier(id: string, open: boolean) {
		setOpenDossierIds(current => {
			const next = new Set(current)
			if (open) next.add(id)
			else next.delete(id)
			return next
		})
		setSelectedId(current => open ? id : current === id ? undefined : current)
	}

	function toggleGroup(id: string, open: boolean) {
		setOpenGroupIds(current => {
			const next = new Set(current)
			if (open) next.add(id)
			else next.delete(id)
			return next
		})
	}

	return (
		<div className="mao-reader-scroll">
			<div className="mao-audit-shell audit-shell shell">
				<section className="mao-audit-summary audit-summary" aria-labelledby="mao-audit-summary-title">
					<div className="audit-summary-heading">
						<div>
							<p className="mao-reader-kicker eyebrow">Completed corpus review</p>
							<h2 id="mao-audit-summary-title">What the audit records</h2>
						</div>
						<p>{manifest.lineCount.toLocaleString()} passages reviewed across {manifest.scriptCount.toLocaleString()} scripts</p>
					</div>
					<div className="audit-stat-grid">
						<div><strong>{manifest.findingCount.toLocaleString()}</strong><span>Confirmed findings</span></div>
						<div><strong>{collection.dossiers.length.toLocaleString()}</strong><span>Work-wide dossiers</span></div>
						<div><strong>{uniqueCounterexampleCount.toLocaleString()}</strong><span>Unique counterexamples</span></div>
					</div>
					<div className="audit-method-note">
						<p>{methodology?.summary ?? DEFAULT_SUMMARY}</p>
						<p>{methodology?.boundary ?? DEFAULT_BOUNDARY}</p>
						{methodology?.disputes && <p>{methodology.disputes}</p>}
					</div>
				</section>

				<section className="mao-audit-dossiers audit-dossiers" aria-labelledby="mao-audit-dossiers-title">
					<header className="audit-dossiers-heading">
						<p className="mao-reader-kicker eyebrow">Work-wide dossiers</p>
						<h2 id="mao-audit-dossiers-title">Recurring failure patterns</h2>
						<p className="audit-dossiers-evidence-count">
							{collection.dossiers.length.toLocaleString()} dossiers · {findingMembershipCount.toLocaleString()} cited findings · {uniqueEvidenceRefCount.toLocaleString()} unique source passages · {counterexampleMembershipCount.toLocaleString()} counterexample citations
						</p>
					</header>

					<div className="audit-group-list">
						{groups.map(group => (
							<details
								className="audit-group mao-audit-group"
								key={group.id}
								open={openGroupIds.has(group.id)}
								onToggle={event => toggleGroup(group.id, event.currentTarget.open)}
							>
								<summary><span>{group.label}</span><small>{group.dossiers.length} dossier{group.dossiers.length === 1 ? "" : "s"}</small></summary>
								<div className="audit-dossier-list">
									{group.dossiers.map(dossier => (
										<DossierDisclosure
											key={dossier.id}
											dossier={dossier}
											dossiers={collection.dossiers}
											open={openDossierIds.has(dossier.id)}
											onToggle={open => toggleDossier(dossier.id, open)}
											onSelect={selectDossier}
											onOpenScriptRef={onOpenScriptRef}
										/>
									))}
								</div>
							</details>
						))}
					</div>
				</section>
			</div>
		</div>
	)
}
