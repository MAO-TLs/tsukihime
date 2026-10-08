import {stripInlineWaitCommands} from "./display-text"

export const normalizeSearchText = (value: string): string => value
	.normalize("NFKC")
	.toLocaleLowerCase()
	.replace(/\s+/gu, " ")
	.trim()

const compactSearchText = (value: string): string => value.replace(/\s+/gu, "")

export interface SearchText {
	spaced: string
	compact: string
}

// Prepare each passage once, not on each input render or query scan.
export function prepareSearchText(...values: Array<string | undefined>): SearchText {
	const spaced = normalizeSearchText(values.filter(Boolean).map(value => stripInlineWaitCommands(value!)).join("\n"))
	return {spaced, compact: compactSearchText(spaced)}
}

export function matchesSearchText(query: string, text: SearchText): boolean {
	return !query || text.spaced.includes(query) || text.compact.includes(compactSearchText(query))
}
