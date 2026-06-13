'use client';

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-red-50">
          <div className="max-w-lg bg-white rounded-2xl shadow-lg border border-red-200 p-6">
            <h2 className="text-lg font-bold text-red-700 mb-2">Fehler</h2>
            <p className="text-sm text-red-600">Ein unerwarteter Fehler ist aufgetreten. Bitte lade die Seite neu.</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold"
            >
              Neu laden
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
