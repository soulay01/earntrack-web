'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-red-50">
      <div className="max-w-lg bg-white rounded-2xl shadow-lg border border-red-200 p-6">
        <h2 className="text-lg font-bold text-red-700 mb-2">Fehler</h2>
        <pre className="text-sm text-red-600 whitespace-pre-wrap break-all">
          {error.message}
        </pre>
        <button
          onClick={() => reset()}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold"
        >
          Erneut versuchen
        </button>
      </div>
    </div>
  );
}
