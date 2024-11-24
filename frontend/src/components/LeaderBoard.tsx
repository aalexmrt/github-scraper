'use client';

import React from 'react';
import axios from 'axios';
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
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, GitCommit, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface Contributor {
  commitCount: number;
  username: string;
  email: string;
  profileUrl: string;
}

const fetchLeaderboard = async (repoUrl: string): Promise<Contributor[]> => {
  const response = await axios.get('/api/leaderboard', {
    params: { repoUrl },
  });
  return response.data.leaderboard;
};

export function LeaderBoard({
  repoUrl,
  onBack,
}: {
  repoUrl: string;
  onBack: () => void;
}) {
  const {
    data: contributors,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['leaderboard', repoUrl],
    queryFn: () => fetchLeaderboard(repoUrl),
  });

  if (isLoading) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
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
    );
  }

  if (isError) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex flex-col items-center justify-center p-6">
          <p className="text-red-500 text-lg mb-4">
            Error loading leaderboard.
          </p>
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Jobs
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between">
        <Button onClick={onBack} variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Jobs
        </Button>
        <CardTitle className="text-2xl font-bold">
          Contributor Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Rank</TableHead>
              <TableHead>Contributor</TableHead>
              <TableHead className="text-right">Commits</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contributors?.map((contributor, index) => (
              <TableRow
                key={index}
                className="hover:bg-muted/50 transition-colors"
              >
                <TableCell className="font-medium">
                  {index === 0 && (
                    <Trophy className="inline-block mr-2 text-yellow-500" />
                  )}
                  {index === 1 && (
                    <Trophy className="inline-block mr-2 text-gray-400" />
                  )}
                  {index === 2 && (
                    <Trophy className="inline-block mr-2 text-amber-600" />
                  )}
                  {index + 1}
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-4">
                    <Avatar>
                      <AvatarImage
                        src={`https://github.com/${contributor.username}.png`}
                      />
                      <AvatarFallback>
                        {contributor.username?.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold">
                        {contributor.username || 'Unknown'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {contributor.email}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" className="font-mono">
                    <GitCommit className="inline-block mr-1 h-3 w-3" />
                    {contributor.commitCount}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
