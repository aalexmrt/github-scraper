'use client';

import { RepositoryForm } from '@/components/RepositoryForm';
import { RepositoriesTable } from '@/components/RepositoriesTable';
import { AuthButton } from '@/components/AuthButton';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { DemoExperience } from '@/components/DemoExperience';
import { useAuth } from '@/context/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';

function AuthenticatedExperience() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen pb-20 gap-16 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start w-full max-w-[1000px] px-4">
        <div className="w-full flex justify-end mb-4">
          <AuthButton />
        </div>
        <RepositoryProvider>
          <RepositoryForm />
          <RepositoriesTable />
        </RepositoryProvider>
      </main>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen pb-20 gap-16 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start w-full max-w-[1000px] px-4">
        <div className="w-full flex justify-end mb-4">
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="w-full h-96" />
      </main>
    </div>
  );
}

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingState />;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen pb-20 font-[family-name:var(--font-geist-sans)]">
        <div className="w-full flex justify-end p-4">
          <AuthButton />
        </div>
        <DemoExperience />
      </div>
    );
  }

  return <AuthenticatedExperience />;
}
