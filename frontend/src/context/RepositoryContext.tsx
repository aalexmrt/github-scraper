'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRepositoryJobs, Job } from '@/services/repositoryService';

// Define the context type
interface RepositoryContextType {
  jobs: Job[] | undefined;
  isLoading: boolean;
  isError: boolean;
  selectedRepo: string | null;
  setSelectedRepo: React.Dispatch<React.SetStateAction<string | null>>;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  refreshJobs: () => Promise<void>;
}

// Define the context
const RepositoryContext = createContext<RepositoryContextType | undefined>(
  undefined
);

// Custom hook to use the RepositoryContext
export const useRepositoryContext = () => {
  const context = useContext(RepositoryContext);
  if (!context) {
    throw new Error(
      'useRepositoryContext must be used within a RepositoryProvider'
    );
  }
  return context;
};

// Provider component
export const RepositoryProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefetching, setIsRefetching] = useState(false);

  const {
    data: jobs,
    refetch,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['repositoryJobs'],
    queryFn: fetchRepositoryJobs,
    refetchInterval: isRefetching ? 2000 : false, // Automatically refetch every 2 seconds if `isRefetching` is true
  });

  // TODO: Implement websocket connection to enhance the user experience
  // Check for queued jobs and toggle refetching
  useEffect(() => {
    const hasQueuedJobs = jobs?.some(
      (job) => job.status === 'waiting' || job.status === 'active'
    );

    if (hasQueuedJobs && !isRefetching) {
      setIsRefetching(true); // Start refetching
    } else if (!hasQueuedJobs && isRefetching) {
      setIsRefetching(false); // Stop refetching
    }
  }, [jobs, isRefetching]);
  // Function to trigger a manual refresh of jobs
  const refreshJobs = async () => {
    await refetch();
  };

  return (
    <RepositoryContext.Provider
      value={{
        jobs,
        isLoading,
        isError,
        selectedRepo,
        setSelectedRepo,
        searchTerm,
        setSearchTerm,
        refreshJobs,
      }}
    >
      {children}
    </RepositoryContext.Provider>
  );
};