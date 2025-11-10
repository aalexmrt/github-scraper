import axios, { AxiosResponse, AxiosError } from 'axios';
import { logger } from './logger';

interface RateLimitState {
  remaining: number;
  reset: number; // Unix timestamp in seconds
  limit: number;
}

interface GitHubErrorResponse {
  message?: string;
  documentation_url?: string;
}

class RateLimitHandler {
  private rateLimitState: RateLimitState | null = null;
  private readonly MIN_REMAINING_THRESHOLD = 10; // Start waiting when we have 10 requests left
  private readonly WAIT_BUFFER_SECONDS = 5; // Wait 5 seconds before reset time to be safe

  /**
   * Extract rate limit information from GitHub API response headers
   */
  private extractRateLimitHeaders(response: AxiosResponse): RateLimitState | null {
    const remaining = response.headers['x-ratelimit-remaining'];
    const reset = response.headers['x-ratelimit-reset'];
    const limit = response.headers['x-ratelimit-limit'];

    if (remaining !== undefined && reset !== undefined && limit !== undefined) {
      return {
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10),
        limit: parseInt(limit, 10),
      };
    }

    return null;
  }

  /**
   * Update rate limit state from response headers
   */
  updateFromResponse(response: AxiosResponse): void {
    const newState = this.extractRateLimitHeaders(response);
    if (newState) {
      this.rateLimitState = newState;
      logger.debug(
        `Rate limit: ${newState.remaining}/${newState.limit} remaining, resets at ${new Date(newState.reset * 1000).toISOString()}`
      );
    }
  }

  /**
   * Check if we need to wait before making a request
   * Returns the number of milliseconds to wait, or 0 if no wait needed
   */
  async checkAndWait(): Promise<void> {
    if (!this.rateLimitState) {
      // No rate limit info yet, proceed
      return;
    }

    const { remaining, reset } = this.rateLimitState;
    const now = Math.floor(Date.now() / 1000);

    // If we're at or below the threshold, wait until reset
    if (remaining <= this.MIN_REMAINING_THRESHOLD) {
      const waitTime = reset - now + this.WAIT_BUFFER_SECONDS;

      if (waitTime > 0) {
        const waitTimeMs = waitTime * 1000;
        logger.warn(
          `Rate limit low (${remaining} remaining). Waiting ${waitTime} seconds until reset at ${new Date(reset * 1000).toISOString()}`
        );
        await this.sleep(waitTimeMs);
        // Reset state after waiting (next request will update it)
        this.rateLimitState = null;
      }
    }
  }

  /**
   * Handle rate limit error from GitHub API
   * Extracts reset time from error response and throws a proper error
   */
  handleRateLimitError(error: AxiosError): never {
    const resetHeader = error.response?.headers['x-ratelimit-reset'];
    const resetTime = resetHeader ? parseInt(resetHeader, 10) : null;
    const resetDate = resetTime ? new Date(resetTime * 1000) : null;

    const errorData = error.response?.data as GitHubErrorResponse | undefined;
    const errorMessage = errorData?.message || error.message;
    const requestId = errorData?.documentation_url
      ? errorData.documentation_url.split('/').pop()
      : null;

    let message = `GitHub API rate limit exceeded`;
    if (resetDate) {
      const waitSeconds = Math.max(0, resetTime! - Math.floor(Date.now() / 1000));
      message += `. Rate limit resets at ${resetDate.toISOString()} (in ${waitSeconds} seconds)`;
    }
    if (requestId) {
      message += `. Request ID: ${requestId}`;
    }

    const rateLimitError = new Error(message);
    (rateLimitError as any).isRateLimitError = true;
    (rateLimitError as any).resetTime = resetTime;
    (rateLimitError as any).resetDate = resetDate;

    throw rateLimitError;
  }

  /**
   * Check if an error is a rate limit error
   */
  isRateLimitError(error: any): boolean {
    if (error.isRateLimitError) {
      return true;
    }

    const statusCode = error.response?.status;
    const errorData = error.response?.data as GitHubErrorResponse | undefined;
    const errorMessage = errorData?.message || error.message || '';

    return (
      statusCode === 403 &&
      (errorMessage.includes('API rate limit exceeded') ||
        errorMessage.includes('rate limit'))
    );
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit state (for debugging)
   */
  getState(): RateLimitState | null {
    return this.rateLimitState;
  }
}

// Export a singleton instance
export const rateLimitHandler = new RateLimitHandler();

