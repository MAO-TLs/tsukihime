export type BrowserLocationParts = {
	pathname: string
	search?: string
	hash?: string
}

export function shouldPushReaderContext(current: string, destination: string): boolean {
	const before = new URL(current, 'https://reader.invalid')
	const after = new URL(destination, 'https://reader.invalid')
	return before.pathname === after.pathname
		&& before.searchParams.get('scope') === 'all'
		&& after.searchParams.get('scope') !== 'all'
		&& Boolean(after.hash)
}

export function normalizeAppPathname(pathname: string, baseUrl: string): string {
	const base = baseUrl.replace(/\/+$/u, "")
	let appPath = pathname
	if (base && base !== "/" && (appPath === base || appPath.startsWith(`${base}/`)))
		appPath = appPath.slice(base.length)
	appPath = `/${appPath.replace(/^\/+|\/+$/gu, "")}`
	return appPath || "/"
}

export function appLocationString(
	location: BrowserLocationParts,
	baseUrl: string,
): string {
	return `${normalizeAppPathname(location.pathname, baseUrl)}${location.search ?? ""}${location.hash ?? ""}`
}
