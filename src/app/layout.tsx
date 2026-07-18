import type { Metadata } from 'next';
export const dynamic = 'force-dynamic';

import Script from 'next/script';
import { Inter } from 'next/font/google';
import './globals.css';
import { Provider } from './Provider';
import { DirtyGuardProvider } from '@/contexts/DirtyGuardContext';
import ErrorBoundary from '@/components/ErrorBoundary';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'EarnTrack – Mitarbeiterverwaltung & Profit-Tracking für Handwerker',
    template: '%s | EarnTrack',
  },
  description:
    'EarnTrack ist die smarte App für Mitarbeiterverwaltung, Profit-Tracking, Zeiterfassung und Einsatzplanung. Erstelle Kostenvoranschläge und Rechnungen in Sekunden. 14 Tage kostenlos testen.',
  keywords: [
    'Mitarbeiterverwaltung',
    'Profit-Tracking',
    'Handwerker App',
    'Einsatzplanung',
    'Rechnungen erstellen',
    'Kostenvoranschlag',
    'Kleinunternehmer',
    'Zeiterfassung',
    'Projektmanagement',
    'Baustellen App',
  ],
  metadataBase: new URL('https://earntrack.de'),
  alternates: { canonical: 'https://earntrack.de' },
  openGraph: {
    title: 'EarnTrack – Mitarbeiterverwaltung & Profit-Tracking für Handwerker',
    description:
      'Die smarte App für Mitarbeiterverwaltung, Profit-Tracking, Zeiterfassung und Einsatzplanung. 14 Tage kostenlos testen.',
    url: 'https://earntrack.de',
    siteName: 'EarnTrack',
    locale: 'de_DE',
    type: 'website',
    images: [
      {
        url: 'https://earntrack.de/logo-1024.png',
        width: 1024,
        height: 1024,
        alt: 'EarnTrack Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EarnTrack – Mitarbeiterverwaltung & Profit-Tracking für Handwerker',
    description:
      'Die smarte App für Mitarbeiterverwaltung, Profit-Tracking, Zeiterfassung und Einsatzplanung. 14 Tage kostenlos testen.',
    images: ['https://earntrack.de/logo-1024.png'],
  },
  robots: { index: true, follow: true },
  publisher: 'EarnTrack – Solaiman Tanjaoui',
  category: 'business',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/svg+xml" href="/favicon-new.svg" />
        <link rel="icon" href="/favicon-new.png" sizes="32x32" type="image/png" />
        <link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png" />
        <link rel="icon" href="/icon.png" sizes="192x192" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-icon-new.png" sizes="180x180" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="EarnTrack" />
        <meta name="theme-color" content="#0A0F0D" />
      </head>
      <body className={`${inter.className} bg-white text-slate-900 antialiased`}>
        <DirtyGuardProvider><ErrorBoundary><Provider>{children}</Provider></ErrorBoundary></DirtyGuardProvider>
        <Script id="ld-pricing" type="application/ld+json" strategy="beforeInteractive">{`
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "EarnTrack",
            "applicationCategory": "BusinessApplication",
            "operatingSystem": "Web, iOS, Android",
            "description": "Business OS für Handwerker & Dienstleister. Projekte, Zeiten, Rechnungen und Profit-Tracking.",
            "url": "https://earntrack.de",
            "offers": [
              {
                "@type": "Offer",
                "name": "Solo",
                "price": "27.99",
                "priceCurrency": "EUR",
                "description": "App-Zugang, Projekte, Kunden, Rechnungen. Für Einzelunternehmer. Max. 2 Mitarbeiter."
              },
              {
                "@type": "Offer",
                "name": "Team",
                "price": "49.99",
                "priceCurrency": "EUR",
                "description": "Bis zu 5 Mitarbeiter. Alles aus Solo plus Teamverwaltung, DATEV-Export."
              },
              {
                "@type": "Offer",
                "name": "Business",
                "price": "79.99",
                "priceCurrency": "EUR",
                "description": "Unbegrenzte Mitarbeiter. Alles aus Team plus individuelle Artikel, API."
              }
            ]
          }
        `}</Script>
        <Script id="register-sw" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator && !window.__swRegistered) {
            window.__swRegistered = true;
            navigator.serviceWorker.register('/sw.js');
          }
        `}</Script>
      </body>
    </html>
  );
}
