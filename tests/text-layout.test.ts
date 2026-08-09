import assert from "node:assert/strict"
import test from "node:test"

import { reserveAlignedContinuation } from "../src/features/game/utils/text-layout.ts"

test("centered click continuations reserve a new centered line", () => {
	assert.equal(
		reserveAlignedContinuation("[center]A dark night."),
		"[center]A dark night.\n[center]",
	)
	assert.equal(
		reserveAlignedContinuation("[center]First.\n[center]Second."),
		"[center]First.\n[center]Second.\n[center]",
	)
})

test("right-aligned continuations are not resegmented", () => {
	assert.equal(
		reserveAlignedContinuation("[color=#fff][right]First."),
		"[color=#fff][right]First.",
	)
})

test("left-aligned prose keeps its normal inline continuation", () => {
	assert.equal(reserveAlignedContinuation("First."), "First.")
	assert.equal(reserveAlignedContinuation("[left]First."), "[left]First.")
})
