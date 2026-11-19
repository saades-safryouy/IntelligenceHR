import './LoadingState.css'

interface LoadingStateProps {
  /** Main text shown under the spinner. */
  label?: string
  /** Optional secondary line. */
  description?: string
  /** Wrap in the standard `.page` container. Set to false inside an existing panel or page. */
  page?: boolean
}

export function LoadingState({
  label = 'Loading...',
  description,
  page = true,
}: LoadingStateProps) {
  const content = (
    <div className="loading-state" role="status" aria-live="polite" aria-busy="true">
      <span className="loading-spinner" aria-hidden="true" />
      <p className="loading-label">{label}</p>
      {description && <p className="loading-description">{description}</p>}
    </div>
  )

  return page ? <div className="page">{content}</div> : content
}
