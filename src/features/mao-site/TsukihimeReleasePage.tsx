import moonClouds from "@assets/images/tsukihime-moon-clouds.webp"
import {Link} from "wouter"
import {APP_INFO} from "app/utils/constants"
import {SCREEN} from "app/utils/display"
import {useScreenAutoNavigate} from "app/hooks"
import MaoDocumentMetadata from "./MaoDocumentMetadata"
import MaoSiteFooter from "./MaoSiteFooter"
import MaoSiteNav from "./MaoSiteNav"

export default function TsukihimeReleasePage() {
	useScreenAutoNavigate(SCREEN.HOME)

	return (
		<div className="tsuki-release-page">
			<MaoDocumentMetadata
				title="Tsukihime — MAO Translations"
				description="Play MAO Translations' complete English browser edition of Tsukihime, read its bilingual script, and inspect the source-only mirror moon audit."
				canonicalPath={import.meta.env.BASE_URL}
			/>
			<main>
				<section className="tsuki-release-hero">
					<img className="tsuki-release-backdrop" src={moonClouds} alt="" aria-hidden="true" />
					<MaoSiteNav currentPage="release" />

					<div className="tsuki-release-hero-grid mao-site-shell mao-template-shell">
						<div className="tsuki-release-hero-copy">
							<p className="mao-site-eyebrow">An English translation by MAO</p>
							<h1>TSUKIHIME</h1>
							<p className="tsuki-release-dek">
								A complete English browser edition of <em>Tsukihime</em> (2000)—translated from the Japanese for accuracy, character voice, and natural literary English.
							</p>
							<div className="tsuki-release-actions">
								<Link className="mao-site-button mao-template-button mao-site-button-primary" href={SCREEN.TITLE}>
									Play online <span aria-hidden="true">→</span>
								</Link>
								<Link className="mao-site-button mao-template-button mao-site-button-secondary" href={SCREEN.SCRIPT}>
									Read the script <span aria-hidden="true">→</span>
								</Link>
							</div>
							<p className="tsuki-release-compatibility">
								No download required · Original music, art, and game presentation · Modern desktop browser recommended
							</p>
						</div>
						<div aria-hidden="true" />
					</div>
				</section>

				<section className="tsuki-release-strip" aria-label="Release information">
					<div className="mao-site-shell mao-template-shell tsuki-release-grid">
						<div><span>Version</span><strong>v1.0.0</strong></div>
						<div><span>Script coverage</span><strong>5 routes + prologue + epilogue</strong></div>
						<div><span>Lines</span><strong>14,620</strong></div>
						<div><span>Status</span><strong>Complete</strong></div>
					</div>
				</section>

				<section className="mao-site-section mao-site-shell mao-template-shell">
					<div className="mao-site-section-heading">
						<p className="mao-site-eyebrow">Read and inspect</p>
						<h2>The complete work, online</h2>
						<p>
							Play the visual novel in the browser, read every Japanese and English passage side by side, or inspect the source-bound audit of the inherited mirror moon translation.
						</p>
					</div>
					<div className="tsuki-release-card-grid">
						<Link className="tsuki-release-card" href={SCREEN.TITLE}>
							<span>Play</span><div><h3>Play online</h3><p>Full Tsukiweb presentation</p></div>
						</Link>
						<Link className="tsuki-release-card" href={SCREEN.SCRIPT}>
							<span>Script</span><div><h3>Japanese / English</h3><p>14,620 aligned passages</p></div>
						</Link>
						<Link className="tsuki-release-card" href={SCREEN.SCRIPT}>
							<span>Compare</span><div><h3>mirror moon comparison</h3><p>Line-by-line display controls</p></div>
						</Link>
						<Link className="tsuki-release-card" href={SCREEN.AUDIT}>
							<span>Audit</span><div><h3>Translation audit</h3><p>23 work-wide dossiers</p></div>
						</Link>
					</div>
					<Link className="mao-site-text-link" href={SCREEN.SCRIPT}>
						Open the script browser <span aria-hidden="true">→</span>
					</Link>
				</section>

				<section className="tsuki-play-section">
					<div className="mao-site-section mao-site-shell mao-template-shell">
						<div className="tsuki-play-heading">
							<div className="mao-site-section-heading">
								<p className="mao-site-eyebrow">Play online</p>
								<h2>Read <em>Tsukihime</em> in your browser</h2>
							</div>
							<p>
								The complete browser edition opens directly into Tsukiweb, with the original visual-novel interface, artwork, music, sound effects, choices, saves, and flowchart. There is no patch to install.
							</p>
						</div>
						<Link className="tsuki-play-link" href={SCREEN.TITLE}>
							<span aria-hidden="true">Web</span>
							<div><h3>Open the browser edition</h3><p>Start from the title screen and keep your progress in this browser.</p></div>
							<strong>Play online <span aria-hidden="true">→</span></strong>
						</Link>
						<aside className="tsuki-play-note">
							<strong>About the web edition</strong>
							<p>Built on the open-source Tsukiweb engine. The MAO English script is independent of the legacy mirror moon translation; mirror moon appears only as an optional comparison and in the public audit.</p>
						</aside>
					</div>
				</section>

				<section className="mao-site-section mao-site-shell mao-template-shell tsuki-credits-section">
					<div className="mao-site-section-heading">
						<p className="mao-site-eyebrow">Credits</p>
						<h2>MAO Translations</h2>
					</div>
					<dl>
						<div><dt>Project Lead</dt><dd>MAO</dd></div>
						<div><dt>Translator</dt><dd>GPT-5.6 Sol</dd></div>
						<div><dt>Special Thanks</dt><dd>gambs</dd></div>
						<div><dt>Browser Engine</dt><dd><a href={APP_INFO.GITHUB_URL}>Tsukiweb</a></dd></div>
					</dl>
				</section>
			</main>

			<MaoSiteFooter />
		</div>
	)
}
