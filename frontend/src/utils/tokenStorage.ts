/**
 * Secure token storage utility
 * Uses sessionStorage (cleared on tab close) for better security than localStorage
 */

import { logger } from './logger';

const TOKEN_KEY = 'github_scraper_auth_token';

export const tokenStorage = {
  /**
   * Store authentication token
   * Uses sessionStorage which is cleared when the browser tab is closed
   */
  set(token: string): void {
    try {
      if (typeof window === 'undefined') {
        logger.warn('Cannot set token: window is undefined');
        return;
      }
      
      sessionStorage.setItem(TOKEN_KEY, token);
      logger.debug('Token stored successfully');
    } catch (error) {
      logger.error('Failed to store token:', error);
      // Silently fail - don't expose error details
    }
  },

  /**
   * Retrieve authentication token
   * @returns The stored token or null if not found
   */
  get(): string | null {
    try {
      if (typeof window === 'undefined') {
        return null;
      }
      
      return sessionStorage.getItem(TOKEN_KEY);
    } catch (error) {
      logger.error('Failed to retrieve token:', error);
      return null;
    }
  },

  /**
   * Clear authentication token
   * Called on logout or when token is invalid
   */
  clear(): void {
    try {
      if (typeof window === 'undefined') {
        return;
      }
      
      sessionStorage.removeItem(TOKEN_KEY);
      logger.debug('Token cleared');
    } catch (error) {
      logger.error('Failed to clear token:', error);
    }
  },

  /**
   * Check if token exists without exposing its value
   * @returns true if token exists, false otherwise
   */
  hasToken(): boolean {
    return !!this.get();
  },
};

