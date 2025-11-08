'use client';

import React, { useState } from 'react';
import { DemoRepos } from './DemoRepos';
import { DemoLeaderboard } from './DemoLeaderboard';
import { DemoCTA } from './DemoCTA';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, TrendingUp } from 'lucide-react';

export const DemoExperience: React.FC = () => {
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  if (selectedRepo) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 py-8 space-y-6">
        <DemoLeaderboard
          repoUrl={selectedRepo}
          onBack={() => setSelectedRepo(null)}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 space-y-12">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="h-8 w-8 text-yellow-500" />
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            GitHub Contributor Insights
          </h1>
        </div>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Discover who's contributing most to your favorite repositories. Explore contributor leaderboards and commit statistics.
        </p>
      </div>

      {/* Stats Card */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-8 flex-wrap">
            <div className="text-center">
              <div className="flex items-center gap-2 justify-center mb-1">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                <span className="text-3xl font-bold text-blue-600">6</span>
              </div>
              <p className="text-sm text-muted-foreground">Demo Repositories</p>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-2 justify-center mb-1">
                <Sparkles className="h-5 w-5 text-purple-600" />
                <span className="text-3xl font-bold text-purple-600">100%</span>
              </div>
              <p className="text-sm text-muted-foreground">Free to Explore</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Demo Repos */}
      <DemoRepos onSelectRepo={setSelectedRepo} />

      {/* CTA Section */}
      <DemoCTA />
    </div>
  );
};

