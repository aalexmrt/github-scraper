'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Trophy, GitCommit } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Layout } from '@/components/Layout';
import { getRepositoryLeaderboard } from '@/services/repositoryService';
import { buildRepoUrl } from '@/lib/repoUtils';

interface Contributor {
  commitCount: number;
  username: string;
  email: string;
  profileUrl: string;
}

export default function LeaderboardPage() {
  const params = useParams();
  const router = useRouter();
  const owner = params.owner as string;
  const repoName = params.repoName as string;
  const repoUrl = buildRepoUrl(owner, repoName);

  const {
    data: contributors,
    isLoading,
    isError,
  } = useQuery<Contributor[]>({
    queryKey: ['leaderboard', repoUrl],
    queryFn: () => getRepositoryLeaderboard(repoUrl),
  });

  const handleBack = () => {
    router.push('/');
  };

  if (isLoading) {
    return (
      <Layout onBack={handleBack} showBackButton={true}>
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">
              Loading Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="w-full h-12 mb-4" />
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="w-full h-16 mb-2" />
            ))}
          </CardContent>
        </Card>
      </Layout>
    );
  }

  if (isError) {
    return (
      <Layout onBack={handleBack} showBackButton={true}>
        <Card className="w-full">
          <CardContent className="flex flex-col items-center justify-center p-6">
            <p className="text-red-500 text-lg mb-4">
              Error loading leaderboard.
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout onBack={handleBack} showBackButton={true}>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="space-y-3 pb-6 border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Trophy className="h-8 w-8 text-yellow-500" />
            Top Contributors
          </h1>
          <div className="space-y-2">
            <p className="text-base text-gray-600 dark:text-gray-400">
              Ranked by commit count - See who&apos;s driving this project forward
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Repository:{' '}
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-mono break-all transition-colors"
              >
                {repoUrl}
              </a>
            </p>
          </div>
        </div>

        {/* Leaderboard Card */}
        <Card className="w-full border border-gray-200 dark:border-gray-800 shadow-sm bg-white dark:bg-gray-900">
          <CardHeader className="pb-4 border-b border-gray-100 dark:border-gray-800">
            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
              Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow className="border-t border-gray-100 dark:border-gray-700 hover:bg-transparent">
                  <TableHead className="w-[10%] font-semibold text-gray-900 dark:text-white">#</TableHead>
                  <TableHead className="font-semibold text-gray-900 dark:text-white">Contributor</TableHead>
                  <TableHead className="w-[20%] text-right font-semibold text-gray-900 dark:text-white">Commits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contributors?.map((contributor, index) => (
                  <TableRow
                    key={index}
                    className="border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <TableCell className="font-semibold py-4">
                      <div className="flex items-center gap-2">
                        {index === 0 && (
                          <Trophy className="h-5 w-5 text-yellow-500" />
                        )}
                        {index === 1 && (
                          <Trophy className="h-5 w-5 text-gray-400" />
                        )}
                        {index === 2 && (
                          <Trophy className="h-5 w-5 text-amber-600" />
                        )}
                        {index > 2 && (
                          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-bold text-gray-600 dark:text-gray-400">
                            {index + 1}
                          </span>
                        )}
                        {index <= 2 && <span>{index + 1}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <a
                          href={contributor.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0"
                        >
                          <Avatar className="h-10 w-10 border-2 border-gray-200 dark:border-gray-700">
                            <AvatarImage
                              src={`https://github.com/${contributor.username}.png`}
                            />
                            <AvatarFallback className="bg-gradient-to-br from-blue-400 to-purple-400 text-white font-semibold">
                              {contributor.username?.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </a>
                        <div className="min-w-0">
                          <a
                            href={contributor.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors block truncate"
                          >
                            {contributor.username || 'Unknown'}
                          </a>
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                            {contributor.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-4">
                      <Badge className="bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-200 font-semibold border-0">
                        <GitCommit className="h-3 w-3 mr-1" />
                        {contributor.commitCount}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
