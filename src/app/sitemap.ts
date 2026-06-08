import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://earntrack.de';

  return [
    { url: base, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/login`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/demo`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/impressum`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/datenschutz`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/agb`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
  ];
}
