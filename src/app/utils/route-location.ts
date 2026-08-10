export type BrowserLocationParts = {
	pathname: string
	search?: string
	hash?: string
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
