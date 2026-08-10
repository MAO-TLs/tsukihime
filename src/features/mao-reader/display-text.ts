const INLINE_WAIT_COMMAND = /!w\d+/gu

export const stripInlineWaitCommands = (text: string): string =>
	text.replace(INLINE_WAIT_COMMAND, "")
