'use client';

import React, { useState } from 'react';
import { AuthButton } from './AuthButton';
import { Button } from '@/components/ui/button';
import { GitBranch, Menu, X } from 'lucide-react';
import Link from 'next/link';

interface HeaderProps {
  onBack?: () => void;
  showBackButton?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onBack,
  showBackButton = false,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-gray-800 dark:bg-gray-950/80">
        <div className="mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Logo & Brand */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="p-2 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 group-hover:shadow-lg transition-shadow">
                  <GitBranch className="h-5 w-5 text-white" />
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    GitHub Insights
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Contributor Analytics
                  </p>
                </div>
              </Link>
            </div>

            {/* Back Button (shown when navigating) */}
            {showBackButton && onBack && (
              <Button
                onClick={onBack}
                variant="ghost"
                size="sm"
                className="hidden sm:flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                <span>← Back</span>
              </Button>
            )}

            {/* Desktop Auth Button */}
            <div className="hidden sm:flex items-center gap-4">
              <AuthButton />
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={toggleMobileMenu}
              className="sm:hidden p-2 rounded-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
            <div className="px-4 py-4 space-y-3">
              {showBackButton && onBack && (
                <Button
                  onClick={() => {
                    onBack();
                    closeMobileMenu();
                  }}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                >
                  ← Back
                </Button>
              )}
              <div className="border-t border-gray-200 dark:border-gray-800 pt-3">
                <AuthButton />
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
};
