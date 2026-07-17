import type { ErrorEvent, EventHint } from '@sentry/nextjs';

// Gemeinsamer beforeSend-Filter für Client/Server/Edge — siehe
// ~/.claude/skills/dsgvo-auth-and-logging/LOGGING.md. Entfernt Auth-/Cookie-Header
// und redacted Datei-Pfade mit Usernamen aus Stacktraces, bevor irgendwas Sentry
// verlässt. sendDefaultPii bleibt in allen drei Init-Configs auf false.
export function scrubSentryEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent {
  if (event.request?.headers) {
    delete event.request.headers['authorization'];
    delete event.request.headers['Authorization'];
    delete event.request.headers['cookie'];
    delete event.request.headers['Cookie'];
    delete event.request.headers['x-api-key'];
  }
  if (event.request?.cookies) {
    event.request.cookies = {};
  }
  event.exception?.values?.forEach((v) => {
    v.stacktrace?.frames?.forEach((f) => {
      if (f.filename) {
        f.filename = f.filename
          .replace(/\/(home|Users)\/[^/]+/g, '/$1/REDACTED')
          .replace(/([A-Za-z]:\\Users\\)[^\\]+/g, '$1REDACTED');
      }
    });
  });
  return event;
}
