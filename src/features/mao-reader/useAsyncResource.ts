import {useEffect, useState, type DependencyList} from "react"

export type AsyncResource<T> =
	| {status: "idle" | "loading"; data?: undefined; error?: undefined}
	| {status: "ready"; data: T; error?: undefined}
	| {status: "error"; data?: undefined; error: Error}

export function useAsyncResource<T>(
	load: (signal: AbortSignal) => Promise<T>,
	dependencies: DependencyList,
	enabled = true,
): AsyncResource<T> {
	const [resource, setResource] = useState<AsyncResource<T>>({status: enabled ? "loading" : "idle"})

	useEffect(() => {
		if (!enabled) {
			setResource({status: "idle"})
			return
		}
		const controller = new AbortController()
		setResource({status: "loading"})
		load(controller.signal).then(
			data => {
				if (!controller.signal.aborted)
					setResource({status: "ready", data})
			},
			error => {
				if (!controller.signal.aborted)
					setResource({
						status: "error",
						error: error instanceof Error ? error : new Error(String(error)),
					})
			},
		)
		return () => controller.abort()
		// `dependencies` deliberately controls the caller-provided loader closure.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [enabled, ...dependencies])

	return resource
}

