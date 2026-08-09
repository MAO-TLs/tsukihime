import fs from 'node:fs/promises'
import path from 'node:path'

const MEDIA_DIRECTORIES = new Set([
	'CD_everafter',
	'CD_original',
	'CD_tsukibako',
	'images',
	'images_thumb',
	'wave',
	'wave_pd',
])
const PRIVATE_DIRECTORY_NAMES = new Set([
	'assemblies',
	'authority',
	'canonical_ledgers',
	'inputs',
	'ledgers',
	'private_closure',
	'research_closure',
	'source_indexes',
])

function pathParts(relativePath) {
	return relativePath.split('/').filter(Boolean)
}

export function isExcludedPublicPath(relativePath) {
	const parts = pathParts(relativePath)
	if (parts.length === 0)
		return false
	if (parts[0] === 'res')
		return true
	if (parts[0] === 'static' && parts[1] === 'en-mm')
		return true
	if (
		parts[0] === 'static'
		&& parts.length >= 2
		&& !['jp', 'en-mao', 'mao-audit'].includes(parts[1])
		&& !['languages.json', 'logic.txt'].includes(parts[1])
	)
		return true
	if (
		parts[0] === 'static'
		&& parts[1] === 'jp'
		&& parts[2] === 'scenes'
	)
		return true
	if (
		parts[0] === 'static'
		&& parts.length >= 3
		&& MEDIA_DIRECTORIES.has(parts[2])
	)
		return true
	const filename = parts.at(-1) ?? ''
	return (
		/^fullscript_[^/]+\.txt$/i.test(filename)
		|| /\.ks$/i.test(filename)
		|| /^pd_[^/]+\.txt$/i.test(filename)
	)
}

export function isPrivateClosurePath(relativePath) {
	const parts = pathParts(relativePath)
	const filename = parts.at(-1) ?? ''
	return (
		parts.some(part => PRIVATE_DIRECTORY_NAMES.has(part))
		|| /\.jsonl$/i.test(filename)
		|| /\.(?:parquet|sqlite3?)$/i.test(filename)
		|| /(?:^|[_-])freeze(?:[_-]manifest)?\.json$/i.test(filename)
		|| /(?:^|[_-])ledgers?(?:[_-].*)?\.json$/i.test(filename)
	)
}

export async function copyPublishablePublicTree(
	source,
	destination,
	relativePath = '',
) {
	// Check the quarantine before lstat/readdir so comparator content is never
	// traversed or read by a production build.
	if (isExcludedPublicPath(relativePath))
		return
	if (isPrivateClosurePath(relativePath))
		throw Error(`private translation closure under public/: ${relativePath}`)

	const stat = await fs.lstat(source)
	if (stat.isSymbolicLink())
		throw Error(`public asset symlinks are not allowed: ${relativePath}`)
	if (stat.isDirectory()) {
		await fs.mkdir(destination, {recursive: true})
		const entries = await fs.readdir(source, {withFileTypes: true})
		entries.sort((left, right) => left.name.localeCompare(right.name))
		for (const entry of entries) {
			const childRelative = relativePath
				? `${relativePath}/${entry.name}`
				: entry.name
			await copyPublishablePublicTree(
				path.join(source, entry.name),
				path.join(destination, entry.name),
				childRelative,
			)
		}
		return
	}
	if (!stat.isFile())
		throw Error(`unsupported public asset type: ${relativePath}`)
	await fs.mkdir(path.dirname(destination), {recursive: true})
	await fs.copyFile(source, destination)
}
