import type { NextConfig } from 'next';
import path from 'path';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config, _context) => {
    // ── Fix: Firebase ESM → CJS resolution ──
    //
    // ROOT CAUSE: Next.js 15 sets mainFields=['browser','module','main'] for client
    // builds. firebase/auth has browser: "dist/esm/index.esm.js" → webpack loads ESM.
    // Firebase v12 ESM modules conflict with webpack 5 → "originalFactory.call" error.
    //
    // Multi-layer fix:
    //
    // 1. conditionNames=['webpack','browser','require','module','default']
    //    Adds 'require' so @firebase/* packages resolve via their exports field to
    //    the browser CJS entry (e.g. @firebase/auth exports.browser.require → CJS).
    //    Non-Firebase packages are unaffected because they either don't have
    //    an exports field or their exports don't differ between ESM/CJS.
    //
    // 2. resolve.alias for firebase/auth
    //    firebase/auth has no exports field (only main/browser/module). mainFields
    //    stays default, so we need an explicit alias to its CJS entry point.
    //
    // 3. sideEffects: true on all Firebase modules
    //    Prevents webpack from tree-shaking DI provider registrations that run at
    //    module load time (e.g. @firebase/auth registering 'auth' provider).

    // Nur für Client-Builds: 'browser' in conditionNames erzwingt sonst überall die
    // Browser-Variante von Paketen mit conditional exports — im Server-Build hat das
    // z. B. @sentry/nextjs auf sein Client-Bundle statt Server-Bundle auflösen lassen
    // ("Attempted to call init() from the server but init is on the client").
    if (!_context.isServer) {
      config.resolve.conditionNames = ['webpack', 'browser', 'require', 'module', 'default'];

      // Alias firebase/* CJS entry points (these packages have no exports field)
      // so mainFields='browser' doesn't pick their ESM build
      config.resolve.alias = {
        ...config.resolve.alias,
        'firebase/auth': path.resolve(__dirname, 'node_modules/firebase/auth/dist/index.cjs.js'),
        'firebase/app': path.resolve(__dirname, 'node_modules/firebase/app/dist/index.cjs.js'),
        'firebase/firestore': path.resolve(__dirname, 'node_modules/firebase/firestore/dist/index.cjs.js'),
        'firebase/messaging': path.resolve(__dirname, 'node_modules/firebase/messaging/dist/index.cjs.js'),
      };

      // Per-layer conditionNames patch (Next.js uses separate resolvers per compiler layer)
      const patchResolver = (obj: any) => {
        if (obj?.resolve?.conditionNames) {
          const names = new Set(obj.resolve.conditionNames);
          names.add('require');
          obj.resolve.conditionNames = [...names];
        }
      };
      if (config.module?.rules) {
        for (const rule of config.module.rules) {
          patchResolver(rule);
          if (Array.isArray(rule?.use)) {
            rule.use.forEach(patchResolver);
          }
          if (rule?.oneOf) {
            rule.oneOf.forEach(patchResolver);
          }
        }
      }
    }

    // Mark all Firebase modules as sideEffects: true
    // Prevents tree-shaking of the DI provider registrations at module load time
    config.module.rules.push({
      test: /[\\/]node_modules[\\/](@firebase|firebase)[\\/]/,
      sideEffects: true,
    });
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HSTS: Browser erzwingt HTTPS für 1 Jahr inkl. Subdomains
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          // CSP: Verhindert XSS durch Einschränkung erlaubter Ressourcen
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Firebase Auth, Firestore, Functions, Storage
              "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://accounts.google.com https://*.firebaseapp.com https://js.stripe.com https://api.stripe.com https://emailjs.com https://api.emailjs.com https://o4511750118506496.ingest.de.sentry.io",
              // Stripe & Firebase Auth Frames (OAuth popup nutzt firebaseapp.com als Auth-Handler)
              "frame-src https://js.stripe.com https://hooks.stripe.com https://earntrack-new.firebaseapp.com https://accounts.google.com",
              // Skripte: 'unsafe-inline' nur für Next.js Hydration (nonces würden Streaming brauchen).
              // gstatic.com ist nötig, weil firebase-messaging-sw.js dort per importScripts() das
              // Firebase-SDK lädt – ohne diesen Eintrag blockiert die CSP den Service Worker und
              // Push-Benachrichtigungen kommen nie an.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://apis.google.com https://www.gstatic.com",
              "worker-src 'self'",
              // Styles: 'unsafe-inline' notwendig für Tailwind + Next.js CSS-in-JS
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Schriften
              "font-src 'self' https://fonts.gstatic.com",
              // Bilder: Firebase Storage + data-URIs für Previews
              "img-src 'self' data: blob: https://*.googleapis.com https://firebasestorage.googleapis.com https://*.googleusercontent.com",
              // Kein Einbetten in Frames von externen Seiten
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
      {
        source: '/favicon-new(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/apple-icon-new(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

// authToken bewusst weggelassen (kein Sentry-Auth-Token im Projekt) — Sourcemaps
// werden dadurch nicht hochgeladen, Fehlererfassung selbst funktioniert trotzdem.
// Bei Bedarf: SENTRY_AUTH_TOKEN ergänzen und hier durchreichen.
export default withSentryConfig(nextConfig, {
  org: 'earntrack',
  project: 'earntrack-web',
  silent: true,
  // Middleware bekommt sonst automatisch das volle Sentry-Edge-SDK eingebaut,
  // das hat die Middleware von 33 kB auf 450 kB aufgeblasen. Fehler-Erfassung
  // in Seiten/API-Routes bleibt davon unberührt (siehe sentry.edge.config.ts).
  webpack: {
    autoInstrumentMiddleware: false,
  },
  // Wir nutzen weder Tracing noch Session Replay noch das Feedback-Widget (siehe
  // instrumentation-client.ts) — diese Flags entfernen den zugehörigen toten Code
  // statt ihn nur ungenutzt mitzuschleppen. Ohne das lag der Client-Bundle-Zuwachs
  // bei ~300+ kB gzip für reine Fehler-Erfassung, deutlich über dem App-Budget.
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
    excludeReplayShadowDom: true,
    excludeReplayIframe: true,
    excludeReplayWorker: true,
  },
});
