import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/sentryPrivacy';

// Reine Fehler-Erfassung – bewusst ohne Session Replay, Feedback-Widget oder
// Performance-Tracing (tracesSampleRate), das wären zusätzliche Datenerfassungs-
// Flächen, die eine eigene DSGVO-Abwägung bräuchten (siehe LOGGING.md). Wenn das
// später gebraucht wird: beforeSendTransaction ergänzen, nicht nur beforeSend.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
