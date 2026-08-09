import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin, type ResolvedConfig } from 'vite'
import { copyPublishablePublicTree } from './tools/safe-public-assets.mjs'
import { copySpaDeepEntries } from './tools/spa-deep-entries.mjs'

const DEFAULT_MEDIA_BASE = 'https://tsukidev.holofield.fr'

function safePublicAssets(): Plugin {
	let resolvedConfig: ResolvedConfig
	return {
		name: 'mao-safe-public-assets',
		apply: 'build',
		configResolved(config) {
			resolvedConfig = config
		},
		async closeBundle() {
			const source = path.resolve(resolvedConfig.root, 'public')
			const destination = path.resolve(
				resolvedConfig.root,
				resolvedConfig.build.outDir,
			)
			await copyPublishablePublicTree(source, destination)
			await copySpaDeepEntries(destination)
		},
	}
}

export default defineConfig(({command, mode}) => {
	const env = loadEnv(mode, process.cwd(), '')
	const serverUrl = (
		env.VITE_TSUKIWEB_MEDIA_BASE || DEFAULT_MEDIA_BASE
	).replace(/\/+$/, '')
	const mediaMode = env.VITE_TSUKIWEB_MEDIA_MODE || 'direct-audio'
	if (!['cors-webaudio', 'direct-audio'].includes(mediaMode))
		throw Error(`Unsupported VITE_TSUKIWEB_MEDIA_MODE ${mediaMode}`)
	const remotePaths = [
		'/res/flowchart-spritesheets',
		'/res/chars',
		'^/static/[^/]+/CD_everafter',
		'^/static/[^/]+/CD_original',
		'^/static/[^/]+/CD_tsukibako',
		'^/static/[^/]+/images',
		'^/static/[^/]+/images_thumb',
		'^/static/[^/]+/wave',
		'^/static/[^/]+/wave_pd',
	]
	const proxyRules: Record<string, {
		target: string
		changeOrigin: boolean
	}> = {}
	for (const remotePath of remotePaths) {
		proxyRules[remotePath] = {
			target: serverUrl,
			changeOrigin: true,
		}
	}

	return {
		base: '/tsukihime/',
		// Development needs the curated runtime assets at their real URLs. The
		// production build keeps Vite's blanket public copy disabled and uses the
		// fail-closed publication plugin below instead.
		publicDir: command === 'serve' ? 'public' : false,
		plugins: [
			react(),
			safePublicAssets(),
		],
		resolve: {
			tsconfigPaths: true,
		},
		build: {
			chunkSizeWarningLimit: 1000,
		},
		server: {
			proxy: mode === 'proxy' ? proxyRules : {},
		},
	}
})
