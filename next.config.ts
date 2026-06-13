import type { NextConfig } from 'next';
import path from 'path';

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

export default nextConfig;
