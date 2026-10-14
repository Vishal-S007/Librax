import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('LIBRAX screen error', error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="card mx-auto mt-10 max-w-lg p-8 text-center">
        <TriangleAlert className="mx-auto h-8 w-8 text-rose" aria-hidden />
        <h2 className="mt-3 font-display text-xl text-ink">This screen hit a problem</h2>
        <p className="mt-2 text-sm text-ink-muted">Your library data is safe — nothing was saved by the failed action.</p>
        <p className="mt-3 break-words rounded-control bg-surface-sunken p-3 font-mono text-xs text-ink-faint">{this.state.error.message}</p>
        <button onClick={() => this.setState({ error: null })} className="mt-5 rounded-control bg-brass px-4 py-2 text-sm font-medium text-brass-ink">
          Try again
        </button>
      </div>
    );
  }
}
