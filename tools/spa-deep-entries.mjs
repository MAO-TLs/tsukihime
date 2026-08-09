import fs from 'node:fs/promises'
import path from 'node:path'

// Reader dossier navigation uses query parameters under /audit/.  Keep this
// list deliberately closed rather than deriving arbitrary route directories.
export const SPA_DEEP_ENTRY_DIRECTORIES = Object.freeze(['play', 'script', 'audit'])

export async function copySpaDeepEntries(outputDirectory) {
	const indexPath = path.join(outputDirectory, 'index.html')
	const indexBytes = await fs.readFile(indexPath)

	for (const directory of SPA_DEEP_ENTRY_DIRECTORIES) {
		const destinationDirectory = path.join(outputDirectory, directory)
		await fs.mkdir(destinationDirectory, {recursive: true})
		await fs.writeFile(
			path.join(destinationDirectory, 'index.html'),
			indexBytes,
		)
	}
}
