import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error caught by ErrorBoundary:", error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div
            role="alert"
            className="max-w-md w-full rounded-2xl bg-slate-900 border border-rose-500/30 p-6 text-center space-y-4 shadow-2xl"
          >
            <AlertTriangle className="h-10 w-10 text-rose-400 mx-auto" />
            <div>
              <h1 className="text-lg font-bold text-slate-100">Something went wrong</h1>
              <p className="text-xs text-slate-400 mt-1 break-words">
                {this.state.error.message || "An unexpected application error occurred."}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Try Again
              </button>
              <button
                type="button"
                onClick={() => window.location.assign("/")}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition"
              >
                Reload Vault
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
