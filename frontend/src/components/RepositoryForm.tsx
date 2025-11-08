'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
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
      setMessage('API token is required for private repositories, or sign in with GitHub.');
      return;
    }

    submitRepository.mutate(); // Trigger mutation
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">
          Add a GitHub Repository
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="repoUrl">Repository URL</Label>
            <Input
              id="repoUrl"
              type="text"
              placeholder="https://github.com/username/repository"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="private"
              checked={isPrivate}
              onCheckedChange={(checked) => setIsPrivate(checked as boolean)}
            />
            <Label
              htmlFor="private"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              This is a private repository
            </Label>
          </div>
          {isPrivate && (
            <div className="space-y-2">
              {isAuthenticated ? (
                <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    You're signed in with GitHub. Your token will be used automatically for private repositories.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <Label htmlFor="apiToken">GitHub API Token</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="apiToken"
                      type="password"
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Your token will only be used for this request and won't be
                    stored. Or{' '}
                    <button
                      type="button"
                      onClick={() => {
                        const backendUrl =
                          process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
                        window.location.href = `${backendUrl}/auth/github`;
                      }}
                      className="text-blue-600 hover:underline"
                    >
                      sign in with GitHub
                    </button>{' '}
                    to use your token automatically.
                  </p>
                </>
              )}
            </div>
          )}
          <Button
            type="submit"
            disabled={submitRepository.status === 'pending'}
          >
            {submitRepository.status === 'pending' ? 'Processing...' : 'Submit'}
          </Button>
          {message && (
            <Alert className="bg-green-50 text-green-900 border-green-200">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          {submitRepository.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {submitRepository.error.message}
              </AlertDescription>
            </Alert>
          )}{' '}
        </form>
      </CardContent>
    </Card>
  );
};
