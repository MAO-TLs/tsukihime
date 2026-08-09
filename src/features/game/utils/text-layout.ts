export function reserveAlignedContinuation(text: string): string {
	const currentLine = text.slice(text.lastIndexOf('\n') + 1)
	const alignment = currentLine.match(/\[(?:center|right)\]/)?.[0]
	return alignment ? `${text}\n${alignment}` : text
}
