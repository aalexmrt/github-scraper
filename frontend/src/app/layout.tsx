import type { Metadata } from 'next';
import ReactQueryLayout from './ReactQueryLayout';
import localFont from 'next/font/local';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: {
    default: 'GitHub Repository Scraper - Contributor Leaderboards',
    template: '%s | GitHub Repository Scraper',
  },
  description:
    'Analyze GitHub repositories to extract commit history and generate contributor leaderboards. Track top contributors, monitor processing status, and access detailed metrics for both public and private repositories.',
  keywords: [
    'GitHub',
    'repository analysis',
    'contributor leaderboard',
    'commit history',
    'GitHub scraper',
    'developer analytics',
    'open source',
    'code analysis',
    'repository metrics',
    'contributor tracking',
  ],
  authors: [
    {
      name: 'Alex Martinez',
      url: 'https://github.com/aalexmrt',
    },
  ],
  creator: 'Alex Martinez',
  publisher: 'Alex Martinez',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'
  ),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'GitHub Repository Scraper',
    title: 'GitHub Repository Scraper - Contributor Leaderboards',
    description:
      'Analyze GitHub repositories to extract commit history and generate contributor leaderboards. Track top contributors and access detailed metrics.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'GitHub Repository Scraper - Contributor Leaderboards',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GitHub Repository Scraper - Contributor Leaderboards',
    description:
      'Analyze GitHub repositories to extract commit history and generate contributor leaderboards.',
    creator: '@aalexmrt',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    // Add your verification codes here when available
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
  },
  category: 'developer tools',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'GitHub Repository Scraper',
    description:
      'Analyze GitHub repositories to extract commit history and generate contributor leaderboards. Track top contributors and access detailed metrics.',
    url: siteUrl,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    author: {
      '@type': 'Person',
      name: 'Alex Martinez',
      url: 'https://github.com/aalexmrt',
    },
    creator: {
      '@type': 'Person',
      name: 'Alex Martinez',
      url: 'https://github.com/aalexmrt',
    },
    keywords:
      'GitHub, repository analysis, contributor leaderboard, commit history, developer analytics',
    featureList: [
      'GitHub repository analysis',
      'Contributor leaderboards',
      'Commit history tracking',
      'Real-time processing status',
      'Public and private repository support',
    ],
  };

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <ReactQueryLayout>{children}</ReactQueryLayout>
      </body>
    </html>
  );
}
