import './globals.css';
import type { Metadata } from 'next';
import { Bebas_Neue, DM_Mono } from 'next/font/google';

const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-void-display',
});

const dmMono = DM_Mono({
  weight: '300',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-void-mono',
});

export const metadata: Metadata = {
  title: 'media-sync-api — Explorer',
  description: 'LAN-only media-sync-api explorer UI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${bebasNeue.variable} ${dmMono.variable}`}>{children}</body>
    </html>
  );
}
