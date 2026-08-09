export function reserveAlignedContinuation(text: string): string {
	const currentLine = text.slice(text.lastIndexOf('\n') + 1)
	return currentLine.includes("[center]") ? `${text}\n[center]` : text
}
