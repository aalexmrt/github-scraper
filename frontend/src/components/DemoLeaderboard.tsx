'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LeaderBoard } from './LeaderBoard';
import { Layout } from './Layout';

interface DemoLeaderboardProps {
  repoUrl: string;
  repoName?: string;
  onBack: () => void;
}

export const DemoLeaderboard: React.FC<DemoLeaderboardProps> = ({
  repoUrl,
  repoName,
  onBack,
}) => {

  // Extract repo name from URL if not provided
  const displayName =
    repoName ||
    repoUrl
      .replace('https://github.com/', '')
      .split('/')
      .pop() ||
    'Repository';

  return (
    <Layout onBack={onBack} showBackButton={true}>
      <div className="w-full space-y-6">
        {/* Demo Mode Indicator */}
        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border-blue-200 dark:border-blue-800/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                <span className="text-blue-600 dark:text-blue-400 font-bold text-lg">✨</span>
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-white">Demo Mode</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Exploring {displayName} leaderboard • Sign in with GitHub (top right) to analyze your own repos
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Leaderboard */}
        <LeaderBoard repoUrl={repoUrl} />
      </div>
    </Layout>
  );
};

