'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// Fängt Fehler im Root-Layout selbst ab (error.tsx greift nur bei Fehlern innerhalb
// eines Segments) — beides zusammen deckt Sentry-Erfassung vollständig ab.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="de">
      <body>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <div>
            <h2>Ein Fehler ist aufgetreten.</h2>
            <button onClick={() => window.location.reload()}>Seite neu laden</button>
          </div>
        </div>
      </body>
    </html>
  );
}
