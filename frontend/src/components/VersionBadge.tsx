'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchVersions } from '@/services/versionService';
import { Package } from 'lucide-react';
import packageJson from '../../package.json';

const FRONTEND_VERSION = packageJson.version;

export const VersionBadge: React.FC = () => {
  const { data: versions, isLoading } = useQuery({
    queryKey: ['versions'],
    queryFn: fetchVersions,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1, // Only retry once if it fails
  });

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <Package className="h-3 w-3" />
      <span className="font-mono">
        Frontend: {FRONTEND_VERSION}
        {versions && (
          <>
            {' • '}
            API: {versions.api}
            {' • '}
            Commit Worker: {versions.commitWorker}
            {' • '}
            User Worker: {versions.userWorker}
          </>
        )}
        {isLoading && !versions && ' • Loading...'}
      </span>
    </div>
  );
};
