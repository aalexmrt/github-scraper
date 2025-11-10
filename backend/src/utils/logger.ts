/**
 * Simple logger utility that reduces verbosity in production
 * Only logs errors and warnings in production, all logs in development
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = {
  /**
   * Log debug messages (only in development)
   */
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Log info messages (only in development)
   */
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.log('[INFO]', ...args);
    }
  },

  /**
   * Log warnings (always logged)
   */
  warn: (...args: any[]) => {
    console.warn('[WARN]', ...args);
  },

  /**
   * Log errors (always logged)
   */
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
  },

  /**
   * Log auth-related messages (always logged for security monitoring)
   */
  auth: (...args: any[]) => {
    console.log('[AUTH]', ...args);
  },
};

