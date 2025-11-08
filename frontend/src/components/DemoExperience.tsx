'use client';

import React from 'react';
import { DemoRepos } from './DemoRepos';
import { DemoCTA } from './DemoCTA';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, TrendingUp } from 'lucide-react';

export const DemoExperience: React.FC = () => {
  return (
    <div className="w-full space-y-12">
      {/* Hero Section */}
      <div className="text-center space-y-6 py-8">
        <div className="flex items-center justify-center gap-3">
          <Sparkles className="h-10 w-10 text-yellow-500 animate-pulse" />
          <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            GitHub Contributor Insights
          </h1>
        </div>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
          Discover who's contributing most to your favorite repositories. Explore detailed contributor leaderboards, analyze commit statistics, and identify your project's top contributors.
        </p>
      </div>

      {/* Stats Card */}
      <Card className="bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-blue-950/30 dark:via-purple-950/30 dark:to-pink-950/30 border-2 border-blue-200 dark:border-blue-800/50">
        <CardContent className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex items-center gap-4 p-4 bg-white dark:bg-gray-900/50 rounded-lg border border-blue-100 dark:border-blue-800/30">
              <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/50">
                <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <span className="text-4xl font-bold text-blue-600 dark:text-blue-400">6</span>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Demo Repositories Ready</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-white dark:bg-gray-900/50 rounded-lg border border-purple-100 dark:border-purple-800/30">
              <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/50">
                <Sparkles className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <span className="text-4xl font-bold text-purple-600 dark:text-purple-400">100%</span>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Completely Free</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Demo Repos */}
      <DemoRepos />

      {/* CTA Section */}
      <DemoCTA />
    </div>
  );
};

