import axios from 'axios';
import { logger } from '../utils/logger';

// Configure axios to include credentials (cookies) in all requests
axios.defaults.withCredentials = true;

// Define the Job type
export interface Repository {
  id: string;
  url: string;
  state:
    | 'pending'
    | 'in_progress'
    | 'commits_processing'
    | 'users_processing'
    | 'completed'
    | 'failed';
}
// Fetch repository jobs from the API
export const fetchRepositories = async (): Promise<Repository[]> => {
  const response = await axios.get('/api/repositories');
  return response.data;
};

export interface LeaderboardResponse {
  top_contributors: Contributor[];
  isPartial?: boolean;
  repository?: string;
}

export interface Contributor {
  commitCount: number;
  username: string | null;
  email: string;
  profileUrl: string | null;
  isEnriched?: boolean;
}

export const getRepositoryLeaderboard = async (
  repoUrl: string
): Promise<LeaderboardResponse> => {
  logger.debug(repoUrl);
  const response = await axios.get(`/api/leaderboard?repoUrl=${repoUrl}`);
  logger.debug(response.data);
  return {
    top_contributors: response.data.top_contributors || [],
    isPartial: response.data.isPartial || false,
    repository: response.data.repository,
  };
};

export const retryRepository = async (
  repoUrl: string
): Promise<{ message: string; repository: Repository }> => {
  const response = await axios.post(
    `/api/repositories/retry?repoUrl=${repoUrl}`,
    {},
    {
      withCredentials: true,
    }
  );
  return response.data;
};
