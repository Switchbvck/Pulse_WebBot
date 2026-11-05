import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Top-level safety net: renders a branded fallback instead of a white screen
 * when any child throws during rendering.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message ?? 'Unknown error' }
  }

  componentDidCatch(error, info) {
    // Surface for debugging; a real deployment would forward this to a sink.
    console.error('Pulse crashed:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
          <AlertTriangle className="h-7 w-7" strokeWidth={1.8} />
        </span>
        <div>
          <h1 className="text-lg font-bold text-mist">Something went wrong</h1>
          <p className="mt-1 text-sm text-mist-dim">
            The app hit an unexpected error. Reloading usually fixes it.
          </p>
          <p className="mt-3 max-w-sm truncate font-mono text-[11px] text-mist-faint">
            {this.state.message}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-accent h-11 px-6 text-sm"
        >
          <RotateCcw className="h-4 w-4" />
          Reload Pulse
        </button>
      </div>
    )
  }
}
