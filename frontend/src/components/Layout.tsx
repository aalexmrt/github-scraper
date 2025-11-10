'use client';

import React from 'react';
import { Header } from './Header';
import { VersionBadge } from './VersionBadge';

interface LayoutProps {
  children: React.ReactNode;
  onBack?: () => void;
  showBackButton?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  onBack,
  showBackButton = false,
}) => {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-950">
      <Header onBack={onBack} showBackButton={showBackButton} />

      {/* Main Content Area */}
      <main className="flex-1 w-full">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                © 2025 GitHub Insights. Analyze repositories with ease.
              </p>
              <div className="flex gap-6 text-sm text-gray-600 dark:text-gray-400">
                <a
                  href="https://github.com"
                  className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  GitHub
                </a>
                <a
                  href="https://github.com/aalexmrt/github-scraper"
                  className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  Project
                </a>
              </div>
            </div>
            <div className="flex justify-center pt-2 border-t border-gray-200 dark:border-gray-800">
              <VersionBadge />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
