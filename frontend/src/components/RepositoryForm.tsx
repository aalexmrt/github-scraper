'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Info,
  Clock,
  HardDrive,
  GitBranch,
} from 'lucide-react';
import { useRepositoryContext } from '../context/RepositoryContext';
import { useAuth } from '../context/AuthContext';

import { Label } from './ui/label';

interface ApiResponse {
  data: {
    message: string;
  };
}

export const RepositoryForm: React.FC = () => {
  const [repoUrl, setRepoUrl] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [apiToken, setApiToken] = useState('');
  const [message, setMessage] = useState('');
  const { refreshJobs } = useRepositoryContext();
  const { isAuthenticated } = useAuth();

  // Processing intervals - matching actual scheduler configuration
  const commitProcessingInterval = '15 minutes';
  const userProcessingInterval = '4 hours';

  // Repository limits - matching backend configuration
  const maxRepoSizeMB = 250;
  const maxCommitCount = 2500;

  const submitRepository = useMutation({
    mutationFn: async () => {
      // If user is authenticated, backend will use their token automatically
      // Only send Authorization header if user manually provided a token
      const headers: Record<string, string> = {};
      if (isPrivate && !isAuthenticated && apiToken) {
        headers.Authorization = `Bearer ${apiToken}`;
      }

      // Perform the API request with credentials to include session cookie
      return await axios.post(
        `/api/leaderboard?repoUrl=${repoUrl}`,
        {},
        {
          headers,
          withCredentials: true,
        }
      );
    },
    onSuccess: (data: ApiResponse) => {
      setRepoUrl(''); // Reset form inputs
      if (isPrivate) {
        setApiToken('');
        setIsPrivate(false);
      }
      refreshJobs(); // Refresh repository jobs
      setMessage(
        data?.data?.message || 'Repository added to processing queue.'
      ); // Success message
    },
    onError: (error: any) => {
      const errorMessage =
        error.response?.data?.error || 'Failed to process repository.';
      setMessage(errorMessage); // Show error message
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!repoUrl) {
      setMessage('Please enter a valid repository URL.');
      return;
    }

    if (isPrivate && !isAuthenticated && !apiToken) {
      setMessage(
        'API token is required for private repositories, or sign in with GitHub.'
      );
      return;
    }

    submitRepository.mutate(); // Trigger mutation
  };

  return (
    <Card className="w-full border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-gray-900">
      <CardHeader className="border-b border-gray-100 dark:border-gray-800 pb-6">
        <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
          Add a GitHub Repository
        </CardTitle>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          Enter a repository URL to analyze its contributors and generate a
          leaderboard
        </p>

        {/* Limitations Section */}
        <Alert className="mt-4 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <AlertDescription className="text-sm space-y-2">
            <div className="font-semibold mb-2">Service Limitations:</div>
            <div className="space-y-1.5 pl-1">
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Commits:</strong> Processed every{' '}
                  {commitProcessingInterval}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Users:</strong> Processed every{' '}
                  {userProcessingInterval}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <HardDrive className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Repository size:</strong> Maximum {maxRepoSizeMB}MB
                </span>
              </div>
              <div className="flex items-start gap-2">
                <GitBranch className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Commit count:</strong> Maximum{' '}
                  {maxCommitCount.toLocaleString()} commits
                </span>
              </div>
            </div>
            <div className="pt-1 text-xs text-amber-800 dark:text-amber-300">
              Your repository will be added to the queue and processed during
              the next scheduled run.
            </div>
          </AlertDescription>
        </Alert>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Repository URL Section */}
          <div className="space-y-3">
            <Label
              htmlFor="repoUrl"
              className="text-base font-semibold text-gray-900 dark:text-white"
            >
              Repository URL
            </Label>
            <Input
              id="repoUrl"
              type="text"
              placeholder="https://github.com/username/repository"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="h-11 text-base border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Enter the full GitHub repository URL (HTTPS format)
            </p>
          </div>

          {/* Private Repository Section */}
          <div className="space-y-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="private"
                checked={isPrivate}
                onCheckedChange={(checked) => setIsPrivate(checked as boolean)}
                className="h-5 w-5"
              />
              <Label
                htmlFor="private"
                className="text-base font-medium text-gray-900 dark:text-white cursor-pointer"
              >
                This is a private repository
              </Label>
            </div>

            {isPrivate && (
              <div className="space-y-4 ml-8 border-l-2 border-gray-300 dark:border-gray-600 pl-4">
                {isAuthenticated ? (
                  <Alert className="bg-green-50 dark:bg-green-950/50 text-green-900 dark:text-green-200 border-green-200 dark:border-green-800">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <AlertDescription>
                      <span className="font-semibold block">
                        Authenticated ✓
                      </span>
                      Your GitHub token will be used automatically for private
                      repositories.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <Label
                      htmlFor="apiToken"
                      className="text-base font-semibold text-gray-900 dark:text-white"
                    >
                      GitHub API Token
                    </Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                      <Input
                        id="apiToken"
                        type="password"
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                        value={apiToken}
                        onChange={(e) => setApiToken(e.target.value)}
                        className="pl-10 h-11 text-base border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Your token is only used for this request and won&apos;t
                        be stored.
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Or{' '}
                        <button
                          type="button"
                          onClick={() => {
                            const backendUrl = (
                              process.env.NEXT_PUBLIC_API_URL ||
                              'http://localhost:3000'
                            ).replace(/\/+$/, '');
                            window.location.href = `${backendUrl}/auth/github`;
                          }}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold transition-colors"
                        >
                          sign in with GitHub
                        </button>{' '}
                        to use your token automatically.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={submitRepository.status === 'pending'}
            className="w-full h-11 text-base font-semibold bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
          >
            {submitRepository.status === 'pending' ? (
              <>
                <span className="inline-block animate-spin mr-2">⏳</span>
                Processing...
              </>
            ) : (
              'Analyze Repository'
            )}
          </Button>

          {/* Success Message */}
          {message && (
            <Alert className="bg-green-50 dark:bg-green-950/50 text-green-900 dark:text-green-200 border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="font-medium">
                {message}
              </AlertDescription>
            </Alert>
          )}

          {/* Error Message */}
          {submitRepository.error && (
            <Alert className="bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200 border-red-200 dark:border-red-800">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <AlertDescription className="font-medium">
                {submitRepository.error.message}
              </AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  );
};
