import axios from 'axios';

// Define the Job type
export interface Repository {
  id: string;
  repoUrl: string;
  state: 'pending' | 'in_progress' | 'completed' | 'failed';
}
// Fetch repository jobs from the API
export const fetchRepositories = async (): Promise<Repository[]> => {
  const response = await axios.get('/api/repositories');
  return response.data;
};


export const getRepositoryLeaderboard = async (repoUrl: string): Promise<any> => {
  console.log(repoUrl);
  const response = await axios.get(`/api/leaderboard?repoUrl=${repoUrl}`);
  console.log(response.data);
  return response.data.top_contributors;
};