'use client';

import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitBranch, ExternalLink, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getLeaderboardRoute } from '@/lib/repoUtils';

interface DemoRepo {
  url: string;
  name: string;
  owner: string;
  description: string;
  featured: boolean;
  category: string;
}

const DEMO_REPOS: DemoRepo[] = [
  {
    url: 'https://github.com/chalk/chalk',
    name: 'chalk',
    owner: 'chalk',
    description: 'Terminal string styling done right',
    featured: true,
    category: 'CLI Tool',
  },
  {
    url: 'https://github.com/sindresorhus/ora',
    name: 'ora',
    owner: 'sindresorhus',
    description: 'Elegant terminal spinners',
    featured: true,
    category: 'CLI Tool',
  },
  {
    url: 'https://github.com/sindresorhus/is',
    name: 'is',
    owner: 'sindresorhus',
    description: "Type check values: is.string('🦄') => true",
    featured: true,
    category: 'Utility',
  },
  {
    url: 'https://github.com/mrmlnc/fast-glob',
    name: 'fast-glob',
    owner: 'mrmlnc',
    description: 'Fast and efficient glob library for Node.js',
    featured: false,
    category: 'Utility',
  },
  {
    url: 'https://github.com/sindresorhus/got',
    name: 'got',
    owner: 'sindresorhus',
    description: 'Human-friendly and powerful HTTP request library',
    featured: false,
    category: 'HTTP Client',
  },
  {
    url: 'https://github.com/axios/axios',
    name: 'axios',
    owner: 'axios',
    description: 'Promise based HTTP client for the browser and node.js',
    featured: false,
    category: 'HTTP Client',
  },
];

export const DemoRepos: React.FC = () => {
  const router = useRouter();
  const featuredRepos = DEMO_REPOS.filter((repo) => repo.featured);
  const otherRepos = DEMO_REPOS.filter((repo) => !repo.featured);

  const handleRepoClick = (repoUrl: string) => {
    const route = getLeaderboardRoute(repoUrl);
    if (route) {
      router.push(route);
    }
  };

  return (
    <div className="w-full space-y-8">
      {/* Featured Repos */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-yellow-500" />
          <h2 className="text-2xl font-bold">Featured Repositories</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {featuredRepos.map((repo) => (
            <Card
              key={repo.url}
              className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50"
              onClick={() => handleRepoClick(repo.url)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-lg">{repo.name}</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {repo.category}
                  </Badge>
                </div>
                <CardDescription className="text-sm">
                  {repo.owner}/{repo.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {repo.description}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRepoClick(repo.url);
                    }}
                  >
                    View Leaderboard
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(repo.url, '_blank');
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Other Repos */}
      {otherRepos.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold mb-4">More Repositories</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {otherRepos.map((repo) => (
              <Card
                key={repo.url}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleRepoClick(repo.url)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">{repo.name}</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {repo.category}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {repo.owner}/{repo.name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                    {repo.description}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRepoClick(repo.url);
                    }}
                  >
                    View Leaderboard
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
