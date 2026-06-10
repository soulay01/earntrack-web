import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config, { isServer }) => {
    // Fix Firebase 12 ESM/CJS resolution for Next.js 15 webpack
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'firebase/app': path.resolve('./node_modules/firebase/app/dist/index.cjs.js'),
        'firebase/auth': path.resolve('./node_modules/firebase/auth/dist/index.cjs.js'),
        'firebase/firestore': path.resolve('./node_modules/firebase/firestore/dist/index.cjs.js'),
        'firebase/storage': path.resolve('./node_modules/firebase/storage/dist/index.cjs.js'),
        'firebase/functions': path.resolve('./node_modules/firebase/functions/dist/index.cjs.js'),
      };
    }
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
