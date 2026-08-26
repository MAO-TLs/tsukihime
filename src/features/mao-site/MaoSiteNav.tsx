import {Link} from "wouter"
import {SCREEN} from "app/utils/display"
import "./mao-publication-template.css"
import "./mao-site.scss"

export type MaoSitePage = "release" | "play" | "script" | "audit" | "none"

interface MaoSiteNavProps {
	currentPage: MaoSitePage
}

export default function MaoSiteNav({currentPage}: MaoSiteNavProps) {
	return (
		<nav className="mao-site-nav mao-site-shell mao-template-nav mao-template-shell nav shell" aria-label="Primary navigation">
			<a className="mao-site-wordmark mao-template-wordmark wordmark" href="https://mao-tls.github.io/">
				MAO Translations
			</a>
			<div className="mao-site-nav-links mao-template-nav-links nav-links">
				<Link href={SCREEN.HOME} aria-current={currentPage === "release" ? "page" : undefined}>
					Release
				</Link>
				<Link href={SCREEN.TITLE} aria-current={currentPage === "play" ? "page" : undefined}>
					Play online
				</Link>
				<Link href={SCREEN.SCRIPT} aria-current={currentPage === "script" ? "page" : undefined}>
					Script
				</Link>
				<Link href={SCREEN.AUDIT} aria-current={currentPage === "audit" ? "page" : undefined}>
					Audit
				</Link>
				<a href="https://github.com/MAO-TLs/tsukihime">GitHub</a>
			</div>
		</nav>
	)
}
