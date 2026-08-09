import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
	copyPublishablePublicTree,
	isExcludedPublicPath,
	isPrivateClosurePath,
} from '../tools/safe-public-assets.mjs'
import {
	copySpaDeepEntries,
	SPA_DEEP_ENTRY_DIRECTORIES,
} from '../tools/spa-deep-entries.mjs'

async function withTemporaryDirectory(callback) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tsukiweb-public-'))
	try {
		await callback(directory)
	}
	finally {
		await fs.rm(directory, {recursive: true, force: true})
	}
}

test('the curated mao-audit JSON tree is publishable', async () => {
	assert.equal(
		isExcludedPublicPath('static/mao-audit/public_dossier_aggregate.json'),
		false,
	)
	assert.equal(
		isPrivateClosurePath('static/mao-audit/public_dossier_aggregate.json'),
		false,
	)

	await withTemporaryDirectory(async directory => {
		const source = path.join(directory, 'public')
		const destination = path.join(directory, 'dist')
		const curatedFiles = {
			'static/mao-audit/public_dossier_aggregate.json': '{"dossiers":23}\n',
			'static/mao-audit/script_index.json': '{"scripts":1}\n',
		}
		for (const [relativePath, contents] of Object.entries(curatedFiles)) {
			const file = path.join(source, relativePath)
			await fs.mkdir(path.dirname(file), {recursive: true})
			await fs.writeFile(file, contents)
		}

		await copyPublishablePublicTree(source, destination)

		for (const [relativePath, contents] of Object.entries(curatedFiles)) {
			assert.equal(
				await fs.readFile(path.join(destination, relativePath), 'utf8'),
				contents,
			)
		}
	})
})

test('raw comparator and unrelated language trees stay quarantined', () => {
	for (const relativePath of [
		'static/en-mm/game.json',
		'static/en-mm/fullscript_en-mm.txt',
		'static/fr-fan/game.json',
		'static/zh-yueji_yeren_hanhua_zu/lang.json',
	]) {
		assert.equal(isExcludedPublicPath(relativePath), true, relativePath)
	}
	assert.equal(isExcludedPublicPath('static/jp/game.json'), false)
	assert.equal(isExcludedPublicPath('static/en-mao/game.json'), false)
})

test('raw and private audit closure paths remain forbidden', () => {
	for (const relativePath of [
		'static/mao-audit/raw_findings.jsonl',
		'static/mao-audit/freeze_manifest.json',
		'static/mao-audit/public_dossier_freeze_manifest.json',
		'static/mao-audit/ledgers/packet-0001.json',
		'static/mao-audit/canonical_ledger.json',
		'static/mao-audit/inputs/source.json',
		'static/mao-audit/authority/private.json',
		'static/mao-audit/research_closure/challenges.json',
		'static/mao-audit/source_indexes/refs.json',
		'static/mao-audit/private_closure/notes.json',
	]) {
		assert.equal(isPrivateClosurePath(relativePath), true, relativePath)
	}
})

test('copying an allowed tree fails closed if private audit material appears', async () => {
	await withTemporaryDirectory(async directory => {
		const source = path.join(directory, 'public')
		const destination = path.join(directory, 'dist')
		const privateFile = path.join(
			source,
			'static/mao-audit/inputs/source.json',
		)
		await fs.mkdir(path.dirname(privateFile), {recursive: true})
		await fs.writeFile(privateFile, '{}\n')

		await assert.rejects(
			copyPublishablePublicTree(source, destination),
			/private translation closure under public\/: static\/mao-audit\/inputs/,
		)
	})
})

test('the build creates only the three fixed SPA deep entries', async () => {
	assert.deepEqual(SPA_DEEP_ENTRY_DIRECTORIES, ['play', 'script', 'audit'])

	await withTemporaryDirectory(async directory => {
		const indexBytes = Buffer.from('<!doctype html>\n<title>Tsukihime</title>\n')
		await fs.writeFile(path.join(directory, 'index.html'), indexBytes)

		await copySpaDeepEntries(directory)

		for (const deepEntry of SPA_DEEP_ENTRY_DIRECTORIES) {
			assert.deepEqual(
				await fs.readFile(path.join(directory, deepEntry, 'index.html')),
				indexBytes,
			)
		}
		await assert.rejects(
			fs.access(path.join(directory, 'audit', 'dossier', 'index.html')),
			{code: 'ENOENT'},
		)
	})
})
