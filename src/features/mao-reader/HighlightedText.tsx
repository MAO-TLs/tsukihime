import {Fragment, type ReactNode} from "react"
import {stripInlineWaitCommands} from "./display-text"
import type {RubySpan} from "./types"

export interface HighlightRange {
	start: number
	end: number
}

export interface InteractiveHighlight {
	id: string
	text: string
	label: string
	description: string
	active?: boolean
}

export interface PositionedInteractiveHighlight extends HighlightRange {
	highlight: InteractiveHighlight
}

export function findHighlightRanges(text: string, highlights: string[]): HighlightRange[] {
	const ranges: HighlightRange[] = []
	for (const highlight of new Set(highlights.filter(Boolean))) {
		let start = text.indexOf(highlight)
		while (start >= 0) {
			ranges.push({start, end: start + highlight.length})
			start = text.indexOf(highlight, start + highlight.length)
		}
	}

	const merged: HighlightRange[] = []
	for (const range of ranges.sort((a, b) => a.start - b.start || a.end - b.end)) {
		const previous = merged.at(-1)
		if (previous && range.start <= previous.end)
			previous.end = Math.max(previous.end, range.end)
		else
			merged.push({...range})
	}
	return merged
}

export function positionInteractiveHighlights(
	text: string,
	highlights: InteractiveHighlight[],
): PositionedInteractiveHighlight[] {
	const positioned = highlights
		.filter(highlight => Boolean(highlight.text))
		.map(highlight => {
			const start = text.indexOf(highlight.text)
			return {highlight, start, end: start + highlight.text.length}
		})
		.filter(range => range.start >= 0)
		.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))

	const accepted: PositionedInteractiveHighlight[] = []
	let cursor = 0
	for (const range of positioned) {
		if (range.start < cursor)
			continue
		accepted.push(range)
		cursor = range.end
	}
	return accepted
}

interface HighlightedTextProps {
	text: string
	highlights?: string[]
	interactiveHighlights?: InteractiveHighlight[]
	onToggleHighlight?: (id: string) => void
	rubySpans?: RubySpan[]
	tone: "japanese" | "mirror"
}

export default function HighlightedText({
	text,
	highlights = [],
	interactiveHighlights = [],
	onToggleHighlight,
	rubySpans = [],
	tone,
}: HighlightedTextProps) {
	const interactiveRanges = positionInteractiveHighlights(text, interactiveHighlights)
	if (interactiveRanges.length > 0) {
		const interactiveNodes: ReactNode[] = []
		let interactiveCursor = 0
		for (const {highlight, start, end} of interactiveRanges) {
			if (start > interactiveCursor)
				interactiveNodes.push(<Fragment key={`text-${interactiveCursor}`}>{stripInlineWaitCommands(text.slice(interactiveCursor, start))}</Fragment>)
			const tooltipId = `mao-audit-preview-${highlight.id}`
			interactiveNodes.push(
				<button
					type="button"
					className="todokanai-error-trigger"
					key={`interactive-${highlight.id}-${start}`}
					aria-describedby={tooltipId}
					aria-expanded={Boolean(highlight.active)}
					title={`${highlight.label}: ${highlight.description}`}
					onClick={() => onToggleHighlight?.(highlight.id)}
				>
					{stripInlineWaitCommands(text.slice(start, end))}
					<span className="todokanai-error-preview" id={tooltipId} role="tooltip">
						<strong>{highlight.label}</strong>
						<span>{highlight.description}</span>
					</span>
				</button>,
			)
			interactiveCursor = end
		}
		if (interactiveCursor < text.length)
			interactiveNodes.push(<Fragment key={`text-${interactiveCursor}`}>{stripInlineWaitCommands(text.slice(interactiveCursor))}</Fragment>)
		return <>{interactiveNodes}</>
	}

	const ranges = findHighlightRanges(text, highlights)
	const nodes: ReactNode[] = []
	let key = 0

	const isHighlighted = (start: number, end: number) =>
		ranges.some(range => range.start < end && range.end > start)

	const pushPlainText = (start: number, end: number) => {
		let cursor = start
		for (const range of ranges) {
			const rangeStart = Math.max(start, range.start)
			const rangeEnd = Math.min(end, range.end)
			if (rangeStart >= rangeEnd)
				continue
			if (cursor < rangeStart)
				nodes.push(<Fragment key={`text-${key++}`}>{stripInlineWaitCommands(text.slice(cursor, rangeStart))}</Fragment>)
			nodes.push(
				<mark className={`mao-audit-highlight mao-audit-highlight--${tone}`} key={`mark-${key++}`}>
					{stripInlineWaitCommands(text.slice(rangeStart, rangeEnd))}
				</mark>,
			)
			cursor = rangeEnd
		}
		if (cursor < end)
			nodes.push(<Fragment key={`text-${key++}`}>{stripInlineWaitCommands(text.slice(cursor, end))}</Fragment>)
	}

	let cursor = 0
	for (const span of [...rubySpans].sort((a, b) => a.start - b.start || a.end - b.end)) {
		if (
			span.start < cursor
			|| span.start < 0
			|| span.end <= span.start
			|| span.end > text.length
			|| !span.reading.trim()
		)
			continue
		pushPlainText(cursor, span.start)
		const ruby = (
			<ruby>
				{stripInlineWaitCommands(span.base || text.slice(span.start, span.end))}
				<rp>(</rp><rt>{span.reading}</rt><rp>)</rp>
			</ruby>
		)
		nodes.push(isHighlighted(span.start, span.end) ? (
			<mark className={`mao-audit-highlight mao-audit-highlight--${tone}`} key={`ruby-mark-${key++}`}>
				{ruby}
			</mark>
		) : <Fragment key={`ruby-${key++}`}>{ruby}</Fragment>)
		cursor = span.end
	}
	pushPlainText(cursor, text.length)

	return <>{nodes.length ? nodes : stripInlineWaitCommands(text)}</>
}
