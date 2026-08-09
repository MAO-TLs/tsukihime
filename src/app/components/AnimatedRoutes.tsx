import { Switch, Route, Redirect, useLocation } from "wouter";
import { AnimatePresence, LazyMotion, domAnimation } from 'motion/react';
import '@tsukiweb/common/styles/main.scss'
import '../styles/App.scss'
import '@tsukiweb/common/graphics/styles/graphics.scss'
import ExtraLayout from "features/title-menu/components/ExtraLayout";
import { useCallback, useEffect, useState } from "react";
import { Particles } from "@tsukiweb/common/ui-core";
import ConfigScreen from "app/screens/ConfigScreen";
import DisclaimerScreen from "app/screens/DisclaimerScreen";
import EndingsScreen from "app/screens/EndingsScreen";
import FlowchartScreen from "app/screens/FlowchartScreen";
import GalleryScreen from "app/screens/GalleryScreen";
import LoadScreen from "app/screens/LoadScreen";
import SceneReplayScreen from "app/screens/SceneReplayScreen";
import TitleMenuScreen from "app/screens/TitleMenuScreen";
import Window from "app/screens/Window";
import { SCREEN } from "app/utils/display";
import {MaoReaderShell} from "features/mao-reader";
import type {MaoReaderLocation, ReaderPage} from "features/mao-reader/types";
import TsukihimeReleasePage from "features/mao-site/TsukihimeReleasePage";

const readerHash = (): string | undefined => {
	const hash = window.location.hash.slice(1)
	if (!hash)
		return undefined
	try {
		return decodeURIComponent(hash)
	} catch {
		return hash
	}
}

const MaoReaderRoute = ({page}: {page: ReaderPage}) => {
	const [location, navigate] = useLocation()
	const [, setHistoryRevision] = useState(0)
	useEffect(() => {
		const refresh = () => setHistoryRevision(value => value + 1)
		window.addEventListener("popstate", refresh)
		window.addEventListener("hashchange", refresh)
		return () => {
			window.removeEventListener("popstate", refresh)
			window.removeEventListener("hashchange", refresh)
		}
	}, [])
	void location
	const query = new URLSearchParams(window.location.search)
	const errorsEnabled = query.get("errors") === "mirror-moon"
	const comparisonEnabled = errorsEnabled || query.get("compare") === "mirror-moon"
	const updateLocation = useCallback((next: MaoReaderLocation) => {
		const params = new URLSearchParams()
		if (next.page === "audit" && next.dossierId) {
			params.set("dossier", next.dossierId)
		} else if (next.page === "script") {
			if (next.scope === "all") {
				params.set("scope", "all")
				if (next.filterSectionId)
					params.set("section", next.filterSectionId)
			} else {
				if (next.sectionId)
					params.set("route", next.sectionId)
				if (next.scriptId)
					params.set("script", next.scriptId)
			}
			if (next.query)
				params.set("q", next.query)
			if (next.showMirrorMoon || next.showErrors)
				params.set("compare", "mirror-moon")
			if (next.showErrors)
				params.set("errors", "mirror-moon")
		}
		const base = next.page === "audit" ? SCREEN.AUDIT : SCREEN.SCRIPT
		const search = params.size ? `?${params.toString()}` : ""
		const hash = next.page === "script" && next.scope !== "all" && next.ref ? `#${encodeURIComponent(next.ref)}` : ""
		const destination = `${base}${search}${hash}`
		const current = `${window.location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ""), "") || "/"}${window.location.search}${window.location.hash}`
		if (current !== destination)
			navigate(destination, {replace: true})
	}, [navigate])

	return (
		<MaoReaderShell
			initialPage={page}
			initialSectionId={query.get("route") ?? undefined}
			initialScriptId={query.get("script") ?? undefined}
			initialRef={page === "script" ? readerHash() : undefined}
			initialScope={query.get("scope") === "all" ? "all" : "script"}
			initialQuery={query.get("q") ?? ""}
			initialFilterSectionId={query.get("section") ?? undefined}
			initialShowMirrorMoon={comparisonEnabled}
			initialShowErrors={errorsEnabled}
			initialDossierId={query.get("dossier") ?? undefined}
			onLocationChange={updateLocation}
		/>
	)
}

const AnimatedRoutes = () => {
	const [location] = useLocation()
	const pathname = location.split('?')[0]
	
	// Show the original game disclaimer on first entry to the browser edition.
	const [showDisclaimer, setShowDisclaimer] = useState(() => {
		const disclaimerSeen = sessionStorage.getItem('app_disclaimer_seen')
		return pathname === SCREEN.TITLE && !disclaimerSeen
	})

	useEffect(() => {
		if (pathname === SCREEN.TITLE && !sessionStorage.getItem('app_disclaimer_seen'))
			setShowDisclaimer(true)
	}, [pathname])

	useEffect(() => {
		if (showDisclaimer) {
			document.documentElement.dataset.preloading = 'disclaimer'
			return
		}

		delete document.documentElement.dataset.preloading
	}, [showDisclaimer])

	const markDisclaimerAsSeen = useCallback(() => {
		sessionStorage.setItem('app_disclaimer_seen', 'true')
		setShowDisclaimer(false)
	}, [])

	const isExtra = [SCREEN.GALLERY, SCREEN.ENDINGS, SCREEN.SCENES].some(path =>
		pathname.startsWith(path)
	)
	const keyPresence = isExtra ? "extra" : pathname
	const showParticles = ![SCREEN.HOME, SCREEN.WINDOW, SCREEN.SCRIPT, SCREEN.AUDIT].includes(pathname as SCREEN)
	const titleKey = showDisclaimer ? "title-behind-disclaimer" : "title"

	return (
		<LazyMotion features={domAnimation} strict>
			{showParticles && <Particles />}
			<AnimatePresence mode="wait">
				<Switch location={pathname} key={keyPresence}>
					<Route path={SCREEN.HOME}>
						<TsukihimeReleasePage />
					</Route>
					<Route path={SCREEN.TITLE}>
						<TitleMenuScreen key={titleKey} />
					</Route>
					<Route path={SCREEN.LOAD}>
						<LoadScreen />
					</Route>
					<Route path={SCREEN.CONFIG}>
						<ConfigScreen />
					</Route>

					<Route path={SCREEN.GALLERY}>
						<ExtraLayout><GalleryScreen /></ExtraLayout>
					</Route>
					<Route path={SCREEN.ENDINGS}>
						<ExtraLayout><EndingsScreen /></ExtraLayout>
					</Route>
					<Route path={`${SCREEN.SCENES}/:sceneId`}>
						<ExtraLayout><SceneReplayScreen /></ExtraLayout>
					</Route>
					<Route path={SCREEN.SCENES}>
						<ExtraLayout><FlowchartScreen /></ExtraLayout>
					</Route>
					<Route path={SCREEN.WINDOW}>
						<Window />
					</Route>
					<Route path={SCREEN.SCRIPT}>
						<MaoReaderRoute page="script" />
					</Route>
					<Route path={SCREEN.AUDIT}>
						<MaoReaderRoute page="audit" />
					</Route>

					<Route>
						<Redirect to="/" />
					</Route>
				</Switch>
			</AnimatePresence>
			<AnimatePresence>
				{showDisclaimer && <DisclaimerScreen onAccept={markDisclaimerAsSeen} />}
			</AnimatePresence>
		</LazyMotion>
	)
}

export default AnimatedRoutes
