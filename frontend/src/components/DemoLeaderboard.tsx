'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LogIn, CheckCircle2 } from 'lucide-react';
import { LeaderBoard } from './LeaderBoard';
import { useAuth } from '@/context/AuthContext';

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
  const { login } = useAuth();

  // Extract repo name from URL if not provided
  const displayName =
    repoName ||
    repoUrl
      .replace('https://github.com/', '')
      .split('/')
      .pop() ||
    'Repository';

  return (
    <div className="w-full space-y-6">
      {/* Demo Banner */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-600 font-bold text-lg">✨</span>
              </div>
              <div>
                <p className="font-semibold text-sm">Demo Mode</p>
                <p className="text-xs text-muted-foreground">
                  Exploring {displayName} leaderboard
                </p>
              </div>
            </div>
            <Button
              onClick={login}
              size="sm"
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <LogIn className="h-4 w-4" />
              Sign in to analyze your repos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={onBack}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to demo repositories
      </Button>

      {/* Leaderboard */}
      <LeaderBoard repoUrl={repoUrl} onBack={onBack} />

      {/* CTA Section */}
      <Card className="border-2 border-dashed">
        <CardContent className="p-6 text-center space-y-4">
          <div className="space-y-2">
            <h3 className="text-xl font-bold">Ready to analyze your own repositories?</h3>
            <p className="text-muted-foreground">
              Sign in with GitHub to unlock the full power of contributor insights
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>Analyze any repository</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>Track multiple repos</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>Access private repositories</span>
            </div>
          </div>
          <Button
            onClick={login}
            size="lg"
            className="gap-2"
          >
            <LogIn className="h-5 w-5" />
            Sign in with GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

