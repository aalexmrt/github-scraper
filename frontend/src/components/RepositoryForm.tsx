'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRepositoryContext } from '../context/RepositoryContext';

export const RepositoryForm: React.FC = () => {
  const [repoUrl, setRepoUrl] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { refreshJobs } = useRepositoryContext(); // Access refreshJobs from context

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!repoUrl) {
      setError('Please enter a valid repository URL.');
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await axios.get(`/api/leaderboard?repoUrl=${repoUrl}`);
      setMessage(
        response.data.message || 'Repository added to processing queue.'
      );
      setRepoUrl('');
      refreshJobs(); // Refresh jobs after a successful submission
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to process repository.');
    } finally {
      setLoading(false);
    }
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
          <Input
            type="text"
            placeholder="Enter GitHub Repository URL"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Processing...' : 'Submit'}
          </Button>
          {message && <p className="text-green-500 text-center">{message}</p>}
          {error && <p className="text-red-500 text-center">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
};
