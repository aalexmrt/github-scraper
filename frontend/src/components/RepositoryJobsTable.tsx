'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, GitBranch, AlertCircle } from 'lucide-react';
import { LeaderBoard } from './LeaderBoard';

interface Job {
  id: string;
  repoUrl: string;
  status: 'active' | 'waiting' | 'completed';
}

const fetchRepositoryJobs = async (): Promise<Job[]> => {
  const response = await axios.get('/api/repositories/jobs');
  return response.data;
};

const statusConfig = {
  active: { label: 'Processing', color: 'bg-yellow-500 text-yellow-100' },
  waiting: { label: 'On Queue', color: 'bg-blue-500 text-blue-100' },
  completed: { label: 'Completed', color: 'bg-green-500 text-green-100' },
};

export function RepositoryJobsTable() {
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const {
    data: jobs,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['repositoryJobs'],
    queryFn: fetchRepositoryJobs,
  });

  const handleRepoClick = (repoUrl: string) => {
    setSelectedRepo(repoUrl);
  };

  const filteredJobs = jobs?.filter((job) =>
    job.repoUrl.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (selectedRepo) {
    return (
      <LeaderBoard
        repoUrl={selectedRepo}
        onBack={() => setSelectedRepo(null)}
      />
    );
  }

  if (isLoading) {
    return (
      <Card className="w-full min-w-[800px] max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            Processed Repositories
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
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <p className="text-red-500 text-lg mb-4">Error loading jobs.</p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full min-w-[800px] max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">
          Processed Repositories
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-2 mb-4">
          <Search className="w-5 h-5 text-gray-500" />
          <Input
            type="text"
            placeholder="Search repositories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-grow"
          />
        </div>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60%]">Repository URL</TableHead>
                <TableHead className="w-[20%]">Status</TableHead>
                <TableHead className="w-[20%]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs?.map((job) => (
                <TableRow key={job.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <a
                      className="flex items-center space-x-2"
                      href={job.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <GitBranch className="w-4 h-4" />
                      <span>{job.repoUrl}</span>
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`${
                        statusConfig[job.status].color
                      } font-semibold`}
                    >
                      {statusConfig[job.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRepoClick(job.repoUrl)}
                      disabled={job.status !== 'completed'}
                    >
                      Leaderboard
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
