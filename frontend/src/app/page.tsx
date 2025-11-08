'use client';

import { RepositoryForm } from '@/components/RepositoryForm';
import { RepositoriesTable } from '@/components/RepositoriesTable';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { DemoExperience } from '@/components/DemoExperience';
import { useAuth } from '@/context/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Layout } from '@/components/Layout';
import { Zap } from 'lucide-react';

function AuthenticatedExperience() {
  return (
    <Layout>
      <RepositoryProvider>
        <div className="space-y-12">
          {/* Page Header Section */}
          <div className="space-y-3 pb-8 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
                Repository Analysis
              </h1>
            </div>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl">
              Add repositories to analyze contributor insights and generate
              leaderboards. Get real-time processing updates and detailed
              contributor metrics.
            </p>
          </div>

          {/* Form Section */}
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-semibold text-sm">
                1
              </span>
              Add Repository
            </h2>
            <RepositoryForm />
          </div>

          {/* Results Section */}
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 font-semibold text-sm">
                2
              </span>
              Your Repositories
            </h2>
            <RepositoriesTable />
          </div>
        </div>
      </RepositoryProvider>
    </Layout>
  );
}

function LoadingState() {
  return (
    <Layout>
      <div className="space-y-8">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="w-full h-96" />
      </div>
    </Layout>
  );
}

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingState />;
  }

  if (!isAuthenticated) {
    return (
      <Layout>
        <DemoExperience />
      </Layout>
    );
  }

  return <AuthenticatedExperience />;
}
