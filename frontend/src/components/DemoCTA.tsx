'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LogIn, CheckCircle2, GitBranch, Users, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export const DemoCTA: React.FC = () => {
  const { login } = useAuth();

  return (
    <Card className="w-full border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardContent className="p-8">
        <div className="text-center space-y-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold">Ready to analyze your repositories?</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Sign in with GitHub to unlock the full power of contributor insights and start tracking your own projects.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
            <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-background/50">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <GitBranch className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="font-semibold">Analyze Any Repo</h3>
              <p className="text-sm text-muted-foreground text-center">
                Track contributor activity across all your repositories
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-background/50">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="font-semibold">Track Contributors</h3>
              <p className="text-sm text-muted-foreground text-center">
                See who&apos;s contributing most and identify key team members
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-background/50">
              <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Lock className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="font-semibold">Private Repos</h3>
              <p className="text-sm text-muted-foreground text-center">
                Secure access to analyze your private repositories
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <Button
              onClick={login}
              size="lg"
              className="gap-2 text-lg px-8 py-6"
            >
              <LogIn className="h-5 w-5" />
              Sign in with GitHub
            </Button>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Free to use</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>OAuth secure</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

