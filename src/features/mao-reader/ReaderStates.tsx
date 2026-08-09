interface ReaderErrorProps {
	error: Error
	onRetry?: () => void
}

export function ReaderLoading({label = "Loading the public record…"}: {label?: string}) {
	return (
		<div className="mao-reader-state" role="status">
			<span className="mao-reader-state__rule" aria-hidden />
			<p>{label}</p>
		</div>
	)
}

export function ReaderError({error, onRetry}: ReaderErrorProps) {
	return (
		<div className="mao-reader-state mao-reader-state--error" role="alert">
			<p className="mao-reader-kicker">Data unavailable</p>
			<h2>The public record could not be loaded.</h2>
			<p>{error.message}</p>
			{onRetry && <button type="button" className="mao-reader-button" onClick={onRetry}>Try again</button>}
		</div>
	)
}

