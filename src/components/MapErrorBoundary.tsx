import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  retryKey: number
}

export class MapErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[TripMap] map rendering failed', error, info.componentStack)
  }

  private retry = () => {
    this.setState((state) => ({
      error: null,
      retryKey: state.retryKey + 1,
    }))
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-[var(--copper)]/30 bg-[var(--card)] px-4 py-5 text-center"
        >
          <p className="font-medium text-[var(--ink)]">地图暂时无法显示</p>
          <p className="mt-1 text-sm text-[var(--stone)]">
            行程内容仍然可用，可以稍后重新加载地图。
          </p>
          <button
            type="button"
            onClick={this.retry}
            className="mt-3 rounded-full border border-[var(--stone)]/30 px-4 py-2 text-sm text-[var(--ink)] transition hover:border-[var(--sage)]"
          >
            重新加载地图
          </button>
        </div>
      )
    }

    return <div key={this.state.retryKey}>{this.props.children}</div>
  }
}
