import axios from 'axios';

// Define the Job type
export interface Job {
  id: string;
  repoUrl: string;
  status: 'active' | 'waiting' | 'completed';
}
// Fetch repository jobs from the API
export const fetchRepositoryJobs = async (): Promise<Job[]> => {
  const response = await axios.get('/api/repositories/jobs');
  return response.data;
};
