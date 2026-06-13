import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // Note: transpilePackages for @firebase/* causes module factory references to be lost.
  // Instead we use conditionNames + mainFields to force CJS resolution.
  webpack: (config, { compilerType }) => {
    // ── Force CJS resolution for Firebase modules ──
    // ROOT CAUSE: Next.js 15 sets mainFields=['browser','module','main'] for client
    // builds. firebase/auth's "browser" field → ESM → originalFactory.call error.
    //
    // Fix strategy:
    // 1. mainFields=['main',...] — firebase/auth (no exports field) uses `main` CJS build
    // 2. conditionNames adds 'require' — @firebase/* packages resolve via exports field
    //    to browser CJS entries (e.g. @firebase/auth exports.browser.require → browser-cjs)
    // 3. sideEffects: true — prevents tree-shaking of Firebase DI provider registrations

    // Override top-level resolver
    config.resolve.mainFields = ['main', 'module', 'browser'];
    // Keep 'webpack' + 'module' (Next.js internals need them), ADD 'require' for CJS resolution
    config.resolve.conditionNames = ['webpack', 'browser', 'require', 'module', 'default'];

    // Patch per-layer resolvers (Next.js uses separate resolvers for SSR/RSC layers)
    const patchResolver = (obj: any) => {
      if (obj?.resolve?.mainFields) {
        obj.resolve.mainFields = ['main', 'module', 'browser'];
      }
      if (obj?.resolve?.conditionNames) {
        // Add 'require' to the per-layer defaults without removing 'webpack'/'module'
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
