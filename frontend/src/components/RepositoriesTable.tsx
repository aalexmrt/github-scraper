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
import { Search, GitBranch, AlertCircle, RefreshCw } from 'lucide-react';
import { useRepositoryContext } from '../context/RepositoryContext';
import { Repository } from '../services/repositoryService';
import { useRouter } from 'next/navigation';
import { getLeaderboardRoute } from '@/lib/repoUtils';
import { useMutation } from '@tanstack/react-query';
import { retryRepository } from '../services/repositoryService';
import { useAuth } from '../context/AuthContext';
import { toast } from '@/hooks/use-toast';

const statusConfig: Record<
  Repository['state'],
  { label: string; color: string }
> = {
  failed: { label: 'Failed', color: 'bg-red-500 text-red-100' },
  in_progress: { label: 'Processing', color: 'bg-yellow-500 text-yellow-100' },
  commits_processing: { label: 'Processing Commits', color: 'bg-yellow-500 text-yellow-100' },
  users_processing: { label: 'Processing Users', color: 'bg-yellow-500 text-yellow-100' },
  pending: { label: 'On Queue', color: 'bg-blue-500 text-blue-100' },
  completed: { label: 'Completed', color: 'bg-green-500 text-green-100' },
};

const getStatusConfig = (state: Repository['state']) => {
  return statusConfig[state] || { label: state, color: 'bg-gray-500 text-gray-100' };
};

export function RepositoriesTable() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const {
    repositories,
    isLoading,
    isError,
    searchTerm,
    setSearchTerm,
    refreshJobs,
  } = useRepositoryContext();

  const handleRepoClick = (repoUrl: string) => {
    const route = getLeaderboardRoute(repoUrl);
    if (route) {
      router.push(route);
    }
  };

  const retryMutation = useMutation({
    mutationFn: retryRepository,
    onSuccess: () => {
      toast({
        title: 'Success',
        description:
          'Repository queued for retry. Processing will begin shortly.',
      });
      refreshJobs();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description:
          error.response?.data?.error || 'Failed to retry repository.',
        variant: 'destructive',
      });
    },
  });

  const handleRetry = (repoUrl: string, e: React.MouseEvent) => {
    e.stopPropagation();
    retryMutation.mutate(repoUrl);
  };

  const filteredRepositories =
    repositories?.filter((repository: any) =>
      repository.url.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">
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
      <Card className="w-full">
        <CardContent className="flex flex-col items-center justify-center p-6">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <p className="text-red-500 text-lg mb-4">Error loading jobs.</p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </CardContent>
      </Card>
    );
  }

  const hasRepositories =
    filteredRepositories && filteredRepositories.length > 0;

  return (
    <Card className="w-full border border-gray-200 dark:border-gray-800 shadow-sm bg-white dark:bg-gray-900">
      <CardHeader className="border-b border-gray-100 dark:border-gray-800 pb-6">
        <div className="space-y-4">
          <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
            Your Repositories
          </CardTitle>
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <Search className="w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search repositories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent border-0 text-base focus:ring-0 placeholder:text-gray-400"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {!hasRepositories ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-800">
              <GitBranch className="w-6 h-6 text-gray-400" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-medium text-gray-900 dark:text-white">
                No repositories yet
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Add a repository above to get started
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-t border-gray-200 dark:border-gray-700 hover:bg-transparent">
                  <TableHead className="w-[45%] font-semibold text-gray-900 dark:text-white">
                    Repository
                  </TableHead>
                  <TableHead className="w-[20%] font-semibold text-gray-900 dark:text-white">
                    Status
                  </TableHead>
                  <TableHead className="w-[35%] text-right font-semibold text-gray-900 dark:text-white">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRepositories.map((repo: Repository) => (
                  <TableRow
                    key={repo.id}
                    className="border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <TableCell className="font-medium py-4">
                      <a
                        className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <GitBranch className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{repo.url}</span>
                      </a>
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge
                        variant="outline"
                        className={`${
                          getStatusConfig(repo.state).color
                        } font-semibold border-0`}
                      >
                        {getStatusConfig(repo.state).label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right py-4">
                      <div className="flex items-center justify-end gap-2">
                        {repo.state === 'failed' && isAuthenticated && (
                          <Button
                            onClick={(e) => handleRetry(repo.url, e)}
                            disabled={retryMutation.isPending}
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${
                                retryMutation.isPending ? 'animate-spin' : ''
                              }`}
                            />
                            {retryMutation.isPending ? 'Retrying...' : 'Retry'}
                          </Button>
                        )}
                        <Button
                          onClick={() => handleRepoClick(repo.url)}
                          disabled={repo.state !== 'completed'}
                          className={`${
                            repo.state === 'completed'
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed'
                          } transition-colors`}
                          size="sm"
                        >
                          View Leaderboard
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
