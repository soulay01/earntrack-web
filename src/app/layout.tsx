import type { Metadata } from 'next';
import './globals.css';
import { Provider } from './Provider';

export const metadata: Metadata = {
  title: 'EarnTrack',
  description: 'Business-Management für Kleinunternehmer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
