'use client';

import React from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { UserCircle2, Trophy } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

interface Contributor {
  commitCount: number;
  username: string;
  email: string;
  profileUrl: string;
}

const fetchLeaderboard = async (): Promise<Contributor[]> => {
  const response = await axios.get('/api/leaderboard', {
    params: { repoUrl: 'https://github.com/midudev/landing-infojobs' },
  });
  return response.data.leaderboard;
};

export const Leaderboard: React.FC = () => {
  const {
    data: contributors,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: fetchLeaderboard,
  });

  if (isLoading) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            GitHub Contributors Leaderboard
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
        <CardContent className="flex items-center justify-center p-6">
          <p className="text-red-500 text-lg">Error</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">
          GitHub Contributors Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Rank</TableHead>
              <TableHead>Username</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead>Commits</TableHead>
              <TableHead className="text-right">Profile</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contributors?.map((contributor, index) => (
              <TableRow key={index} className="hover:bg-muted/50">
                <TableCell className="font-medium">
                  {index === 0 ? (
                    <Badge
                      variant="default"
                      className="bg-yellow-500 text-primary-foreground"
                    >
                      <Trophy className="w-4 h-4 mr-1" />
                      {index + 1}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{index + 1}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <Avatar className="w-8 h-8">
                      <AvatarImage
                        src={`https://github.com/${contributor.username}.png`}
                        alt={contributor.username}
                      />
                      <AvatarFallback>
                        <UserCircle2 className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                    <span>{contributor.username || 'Unknown'}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {contributor.email}
                </TableCell>
                <TableCell>{contributor.commitCount}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={contributor.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {/* <Github className="w-4 h-4 mr-2" /> */}
                      View
                    </a>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
