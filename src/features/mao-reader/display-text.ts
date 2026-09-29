const INLINE_WAIT_COMMAND = /!w\d+/gu
const STANDALONE_COLOR_COMMAND = /^[\t ]*#[0-9a-f]{6}[\t ]*(?:\r?\n|$)/gimu

export const stripInlineWaitCommands = (text: string): string =>
	text
		.replace(INLINE_WAIT_COMMAND, "")
		.replace(STANDALONE_COLOR_COMMAND, "")
