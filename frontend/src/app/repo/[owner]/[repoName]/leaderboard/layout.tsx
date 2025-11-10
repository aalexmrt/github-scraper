import type { Metadata } from 'next';

type Props = {
  params: Promise<{ owner: string; repoName: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, repoName } = await params;
  const repoUrl = `https://github.com/${owner}/${repoName}`;
  const title = `${owner}/${repoName} - Contributor Leaderboard`;
  const description = `View the top contributors and commit statistics for ${owner}/${repoName} on GitHub. See who's driving this project forward with detailed contributor metrics.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/repo/${owner}/${repoName}/leaderboard`,
      type: 'website',
      siteName: 'GitHub Repository Scraper',
      images: [
        {
          url: `/og-image.png`,
          width: 1200,
          height: 630,
          alt: `${owner}/${repoName} Contributor Leaderboard`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og-image.png'],
    },
    alternates: {
      canonical: `/repo/${owner}/${repoName}/leaderboard`,
    },
  };
}

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
