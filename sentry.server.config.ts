import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/sentryPrivacy';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
});
