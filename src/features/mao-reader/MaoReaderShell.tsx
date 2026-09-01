import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import AuditReader from "./AuditReader"
import {MaoAuditRepository, maoAuditBaseUrl} from "./data"
import {ReaderError, ReaderLoading} from "./ReaderStates"
import ScriptReader from "./ScriptReader"
import type {MaoReaderLocation, ReaderPage, SearchScope} from "./types"
import {useAsyncResource} from "./useAsyncResource"
import MaoSiteFooter from "features/mao-site/MaoSiteFooter"
import MaoSiteNav from "features/mao-site/MaoSiteNav"
import "./mao-reader.scss"
import "./mao-reader-template.css"

export interface MaoReaderShellProps {
	baseUrl?: string
	repository?: MaoAuditRepository
	initialPage?: ReaderPage
	initialSectionId?: string
	initialScriptId?: string
	initialRef?: string
	initialScope?: SearchScope
	initialQuery?: string
	initialFilterSectionId?: string
	initialShowMirrorMoon?: boolean
	initialShowErrors?: boolean
	initialDossierId?: string
	onLocationChange?: (location: MaoReaderLocation) => void
	onOpenScriptRef?: (ref: string) => void
}

export default function MaoReaderShell({
	baseUrl,
	repository: suppliedRepository,
	initialPage = "script",
	initialSectionId,
	initialScriptId,
	initialRef,
	initialScope = "script",
	initialQuery = "",
	initialFilterSectionId,
	initialShowMirrorMoon = false,
	initialShowErrors = false,
	initialDossierId,
	onLocationChange,
	onOpenScriptRef,
}: MaoReaderShellProps) {
	const [page, setPage] = useState<ReaderPage>(initialPage)
	const [retryKey, setRetryKey] = useState(0)
	const [scriptLocation, setScriptLocation] = useState<MaoReaderLocation>({
		page: "script",
		sectionId: initialSectionId,
		scriptId: initialScriptId,
		ref: initialRef,
		scope: initialScope,
		query: initialQuery,
		filterSectionId: initialFilterSectionId,
		showMirrorMoon: initialShowMirrorMoon || initialShowErrors,
		showErrors: initialShowErrors,
	})
	const [dossierId, setDossierId] = useState(initialDossierId)
	const repository = useMemo(
		() => suppliedRepository ?? new MaoAuditRepository(baseUrl ?? maoAuditBaseUrl()),
		[baseUrl, suppliedRepository],
	)
	const manifest = useAsyncResource(
		signal => repository.loadManifest(signal),
		[repository, retryKey],
	)
	const readyManifest = manifest.status === "ready" ? manifest.data : undefined
	const translationVersion = readyManifest?.translationVersion ?? "v1.2.1"
	const initialScriptLocationKey = JSON.stringify([
		initialSectionId,
		initialScriptId,
		initialRef,
		initialScope,
		initialQuery,
		initialFilterSectionId,
		initialShowMirrorMoon,
		initialShowErrors,
	])
	const previousInitialScriptLocationKey = useRef(initialScriptLocationKey)

	useEffect(() => {
		if (previousInitialScriptLocationKey.current === initialScriptLocationKey)
			return
		previousInitialScriptLocationKey.current = initialScriptLocationKey
		setScriptLocation({
			page: "script",
			sectionId: initialSectionId,
			scriptId: initialScriptId,
			ref: initialRef,
			scope: initialScope,
			query: initialQuery,
			filterSectionId: initialFilterSectionId,
			showMirrorMoon: initialShowMirrorMoon || initialShowErrors,
			showErrors: initialShowErrors,
		})
	}, [initialFilterSectionId, initialQuery, initialRef, initialScope, initialScriptId, initialScriptLocationKey, initialSectionId, initialShowErrors, initialShowMirrorMoon])

	useEffect(() => {
		setPage(initialPage)
	}, [initialPage])

	useEffect(() => {
		setDossierId(initialDossierId)
	}, [initialDossierId])

	useEffect(() => {
		const previousTitle = document.title
		const previousValues = new Map<Element, string | null>()
		const title = page === "audit" ? "mirror moon audit — Tsukihime | MAO Translations" : "Tsukihime script browser | MAO Translations"
		const description = page === "audit"
			? "Browse the source-audited record of mirror moon translation errors, grouped work-wide dossiers, and exact Japanese evidence."
			: "Read and search the complete Tsukihime script beside the Japanese source, MAO English, and optional mirror moon comparison."
		const canonical = new URL(`${import.meta.env.BASE_URL}${page === "audit" ? "audit/" : "script/"}`, window.location.origin).href
		document.title = title
		const ensureMeta = (selector: string, attributes: Record<string, string>) => {
			let element = document.head.querySelector<HTMLMetaElement>(selector)
			if (!element) {
				element = document.createElement("meta")
				element.dataset.maoReaderMetadata = "true"
				document.head.appendChild(element)
			}
			if (!previousValues.has(element))
				previousValues.set(element, element.getAttribute("content"))
			for (const [name, value] of Object.entries(attributes))
				element.setAttribute(name, value)
		}
		ensureMeta('meta[name="description"]', {name: "description", content: description})
		ensureMeta('meta[property="og:title"]', {property: "og:title", content: title})
		ensureMeta('meta[property="og:description"]', {property: "og:description", content: description})
		ensureMeta('meta[property="og:url"]', {property: "og:url", content: canonical})
		ensureMeta('meta[name="twitter:title"]', {name: "twitter:title", content: title})
		ensureMeta('meta[name="twitter:description"]', {name: "twitter:description", content: description})
		let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
		if (!link) {
			link = document.createElement("link")
			link.rel = "canonical"
			link.dataset.maoReaderMetadata = "true"
			document.head.appendChild(link)
		}
		previousValues.set(link, link.getAttribute("href"))
		link.href = canonical
		return () => {
			document.title = previousTitle
			for (const [element, value] of previousValues) {
				if (element.getAttribute("data-mao-reader-metadata") === "true")
					element.remove()
				else if (element instanceof HTMLLinkElement)
					element.setAttribute("href", value ?? "")
				else
					element.setAttribute("content", value ?? "")
			}
		}
	}, [page])
	const reportLocation = useCallback((location: MaoReaderLocation) => {
		if (location.page === "script")
			setScriptLocation(location)
		else
			setDossierId(location.dossierId)
		onLocationChange?.(location)
	}, [onLocationChange])
	const openScriptRef = async (ref: string) => {
		const searchIndex = await repository.loadSearchIndex()
		const entry = searchIndex.find(item => item.ref === ref)
		const location: MaoReaderLocation = {
			page: "script",
			sectionId: entry?.sectionId,
			scriptId: entry?.scriptId,
			ref,
			scope: "script",
			query: "",
			showMirrorMoon: true,
			showErrors: true,
		}
		setScriptLocation(location)
		setPage("script")
		onOpenScriptRef?.(ref)
		onLocationChange?.(location)
	}

	return (
		<div className="mao-reader-shell reader-page" data-mao-reader-page={page} role="document">
			<header className="mao-reader-header reader-header">
				<MaoSiteNav currentPage={page} />
				<div className="mao-reader-intro reader-intro shell">
					<p className="mao-reader-intro__eyebrow eyebrow">{page === "audit" ? "Source-only editorial audit" : `Script Version ${translationVersion}`}</p>
					<h1>{page === "audit" ? "mirror moon audit" : "Script browser"}</h1>
					<p>{page === "audit"
						? "Every published finding was checked against the Japanese and its scene context. Borderline calls were withheld, and counterexamples are recorded wherever they set a useful limit on a work-wide claim."
						: `Search all 14,620 aligned passages or read any of the 62 scripts beside the ${translationVersion} MAO English translation. The earlier mirror moon English and its adjudicated source errors can be displayed for comparison.`}</p>
				</div>
			</header>

			<main id="mao-reader-top" className="mao-reader-main">
				{manifest.status === "loading" || manifest.status === "idle" ? (
					<ReaderLoading />
				) : manifest.status === "error" ? (
					<ReaderError error={manifest.error} onRetry={() => setRetryKey(value => value + 1)} />
				) : readyManifest && page === "script" ? (
					<ScriptReader
						manifest={readyManifest}
						repository={repository}
						initialSectionId={scriptLocation.sectionId}
						initialScriptId={scriptLocation.scriptId}
						initialRef={scriptLocation.ref}
						initialScope={scriptLocation.scope}
						initialQuery={scriptLocation.query}
						initialFilterSectionId={scriptLocation.filterSectionId}
						initialShowMirrorMoon={scriptLocation.showMirrorMoon}
						initialShowErrors={scriptLocation.showErrors}
						onLocationChange={reportLocation}
					/>
				) : readyManifest ? (
					<AuditReader
						manifest={readyManifest}
						repository={repository}
						initialDossierId={dossierId}
						onLocationChange={reportLocation}
						onOpenScriptRef={openScriptRef}
					/>
				) : null}
			</main>
			<MaoSiteFooter />
		</div>
	)
}
