import apiClient from './apiClient';

export interface VersionInfo {
  api: string;
  commitWorker: string;
  userWorker: string;
}

export const fetchVersions = async (): Promise<VersionInfo> => {
  try {
    // Use the API proxy path which works in both dev and production
    const response = await apiClient.get('/api/version');
    return response.data;
  } catch (error) {
    // If version endpoint fails, return fallback values
    // This handles cases where the backend is not available or endpoint doesn't exist yet
    console.warn('Failed to fetch versions from backend:', error);
    return {
      api: 'unknown',
      commitWorker: 'unknown',
      userWorker: 'unknown',
    };
  }
};

