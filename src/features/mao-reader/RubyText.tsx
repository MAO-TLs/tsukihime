import {Fragment, type ReactNode} from "react"
import type {RubySpan} from "./types"

export type RubyPart =
	| {kind: "text"; text: string}
	| {kind: "ruby"; text: string; reading: string}

export function buildRubyParts(text: string, spans: RubySpan[]): RubyPart[] {
	const parts: RubyPart[] = []
	let cursor = 0
	for (const span of [...spans].sort((a, b) => a.start - b.start || a.end - b.end)) {
		if (
			span.start < cursor
			|| span.start < 0
			|| span.end <= span.start
			|| span.end > text.length
			|| !span.reading.trim()
		)
			continue
		if (span.start > cursor)
			parts.push({kind: "text", text: text.slice(cursor, span.start)})
		parts.push({kind: "ruby", text: span.base || text.slice(span.start, span.end), reading: span.reading})
		cursor = span.end
	}
	if (cursor < text.length)
		parts.push({kind: "text", text: text.slice(cursor)})
	return parts.length ? parts : [{kind: "text", text}]
}

interface RubyTextProps {
	text: string
	spans?: RubySpan[]
}

export default function RubyText({text, spans = []}: RubyTextProps) {
	const nodes: ReactNode[] = buildRubyParts(text, spans).map((part, index) =>
		part.kind === "text" ? (
			<Fragment key={`${index}-${part.text}`}>{part.text}</Fragment>
		) : (
			<ruby key={`${index}-${part.text}-${part.reading}`}>
				{part.text}<rp>(</rp><rt>{part.reading}</rt><rp>)</rp>
			</ruby>
		))
	return <>{nodes}</>
}
