'use client';

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
import { useRepositoryContext } from '../context/RepositoryContext';
import { Repository } from '../services/repositoryService';

const statusConfig: Record<
  Repository['state'],
  { label: string; color: string }
> = {
  failed: { label: 'Failed', color: 'bg-red-500 text-red-100' },
  in_progress: { label: 'Processing', color: 'bg-yellow-500 text-yellow-100' },
  pending: { label: 'On Queue', color: 'bg-blue-500 text-blue-100' },
  completed: { label: 'Completed', color: 'bg-green-500 text-green-100' },
};

export function RepositoriesTable() {
  const {
    repositories,
    isLoading,
    isError,
    selectedRepo,
    setSelectedRepo,
    searchTerm,
    setSearchTerm,
  } = useRepositoryContext();

  const handleRepoClick = (repoUrl: string) => {
    setSelectedRepo(repoUrl);
  };

  const filteredRepositories =
    repositories?.filter((repository: any) =>
      repository.url.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

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
              {filteredRepositories &&
                filteredRepositories.length > 0 &&
                filteredRepositories.map((repo: Repository) => (
                  <TableRow key={repo.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <a
                        className="flex items-center space-x-2"
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <GitBranch className="w-4 h-4" />
                        <span>{repo.url}</span>
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`${
                          statusConfig[repo.state].color
                        } font-semibold`}
                      >
                        {statusConfig[repo.state].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRepoClick(repo.url)}
                        disabled={repo.state !== 'completed'}
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
