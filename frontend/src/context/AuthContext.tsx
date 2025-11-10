'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { tokenStorage } from '../utils/tokenStorage';
import { logger } from '../utils/logger';

interface User {
  id: number;
  githubId: number;
  username: string;
  email: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [tokenExtracted, setTokenExtracted] = useState(false);

  // Helper to get backend URL for direct API calls (bypasses Vercel proxy for cookies)
  const getBackendUrl = () => {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    logger.debug('Backend URL:', url);
    return url.replace(/\/+$/, '');
  };

  // Extract token from URL synchronously on mount (before queries run)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get('auth');
    const token = params.get('token');
    
    if (authStatus === 'success' && token) {
      logger.auth('Received auth token from OAuth callback');
      logger.debug('Token length:', token.length);
      
      // Store token securely
      tokenStorage.set(token);
      
      // Clear URL immediately (remove token from browser history)
      const url = new URL(window.location.href);
      url.searchParams.delete('auth');
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.pathname + url.hash);
      
      logger.auth('Token stored and URL cleaned');
    }
    
    setTokenExtracted(true);
  }, []);

  // Fetch current user
  const { data: userData, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const backendUrl = getBackendUrl();
      const apiUrl = `${backendUrl}/auth/me`;
      const token = tokenStorage.get();
      
      logger.debug('Fetching user from:', apiUrl);
      logger.debug('Using auth method:', token ? 'Token' : 'Cookie');
      logger.debug('Token present:', !!token);
      
      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        logger.debug('Authorization header set');
      }
      
      try {
        const response = await axios.get(apiUrl, {
          withCredentials: true, // Keep for backward compatibility with cookies
          headers,
          // Don't treat 401 as an error - it's expected when not authenticated
          validateStatus: (status) => status === 200 || status === 401,
        });
        
        // Handle 401 response (not authenticated)
        if (response.status === 401) {
          logger.debug('Not authenticated (401) - expected when no valid token/session');
          // Clear invalid token if present
          tokenStorage.clear();
          return null;
        }
        
        logger.debug('User data received:', response.data.user);
        logger.auth('Authentication successful');
        return response.data.user as User;
      } catch (error: any) {
        // This catch block now only handles unexpected errors (network errors, etc.)
        logger.error('Error fetching user:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message,
          data: error.response?.data,
          url: apiUrl,
        });
        // For unexpected errors, throw to let React Query handle them
        throw error;
      }
    },
    enabled: tokenExtracted, // Wait for token extraction before running query
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Update user state when data changes
  useEffect(() => {
    logger.debug('User state updated:', userData ? { id: userData.id, username: userData.username } : null);
    setUser(userData || null);
  }, [userData]);

  // Login function - redirects to backend OAuth endpoint
  const login = () => {
    const backendUrl = getBackendUrl();
    const loginUrl = `${backendUrl}/auth/github`;
    logger.auth('Initiating login, redirecting to:', loginUrl);
    window.location.href = loginUrl;
  };

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const backendUrl = getBackendUrl();
      const apiUrl = `${backendUrl}/auth/logout`;
      const token = tokenStorage.get();
      
      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      
      logger.debug('Logging out');
      await axios.post(apiUrl, {}, {
        withCredentials: true,
        headers,
      });
      
      // Clear token immediately
      tokenStorage.clear();
      logger.auth('Logout successful, token cleared');
    },
    onSuccess: () => {
      logger.debug('Clearing user state');
      setUser(null);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (error: any) => {
      logger.error('Logout error:', error);
      // Clear token even if logout request fails
      tokenStorage.clear();
    },
  });

  const logout = () => {
    logoutMutation.mutate();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

