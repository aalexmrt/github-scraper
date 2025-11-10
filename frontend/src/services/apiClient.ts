/**
 * Configured axios client with automatic token handling
 * Adds Bearer token to all requests automatically
 * Handles token expiration and clears invalid tokens
 */

import axios from 'axios';
import { tokenStorage } from '../utils/tokenStorage';
import { logger } from '../utils/logger';

// Create axios instance
export const apiClient = axios.create({
  withCredentials: true, // Enable cookies for backward compatibility
});

// Request interceptor - Add token to all requests
apiClient.interceptors.request.use(
  (config) => {
    const token = tokenStorage.get();
    
    if (token) {
      // Add Bearer token to Authorization header
      config.headers.Authorization = `Bearer ${token}`;
      logger.debug('Added token to request:', config.url);
    }
    
    return config;
  },
  (error) => {
    logger.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - Handle token expiration
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      logger.debug('401 error - clearing token');
      tokenStorage.clear();
      
      // Optionally redirect to login
      // window.location.href = '/';
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;

