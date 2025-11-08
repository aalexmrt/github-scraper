'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

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

  // Fetch current user
  const { data: userData, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      console.log('[AUTH] Frontend: Fetching /api/auth/me');
      try {
        const response = await axios.get('/api/auth/me', {
          withCredentials: true,
        });
        console.log('[AUTH] Frontend: User data received:', response.data.user);
        return response.data.user as User;
      } catch (error: any) {
        // 401 is expected when not authenticated - return null instead of throwing
        if (error.response?.status === 401) {
          console.log('[AUTH] Frontend: Not authenticated (401)');
          return null;
        }
        console.error('[AUTH] Frontend: Error fetching user:', {
          status: error.response?.status,
          message: error.message,
          data: error.response?.data,
        });
        // For other errors, throw to let React Query handle them
        throw error;
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Update user state when data changes
  useEffect(() => {
    console.log('[AUTH] Frontend: User state updated:', userData ? { id: userData.id, username: userData.username } : null);
    setUser(userData || null);
  }, [userData]);

  // Check for auth success in URL (from OAuth callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      console.log('[AUTH] Frontend: Auth success detected in URL, refetching user data');
      // Remove query param from URL
      window.history.replaceState({}, '', window.location.pathname);
      // Refetch user data
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    }
  }, [queryClient]);

  // Login function - redirects to backend OAuth endpoint
  const login = () => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const loginUrl = `${backendUrl}/auth/github`;
    console.log('[AUTH] Frontend: Initiating login, redirecting to:', loginUrl);
    window.location.href = loginUrl;
  };

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      console.log('[AUTH] Frontend: Logging out');
      await axios.post('/api/auth/logout', {}, { withCredentials: true });
      console.log('[AUTH] Frontend: Logout successful');
    },
    onSuccess: () => {
      console.log('[AUTH] Frontend: Clearing user state');
      setUser(null);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (error: any) => {
      console.error('[AUTH] Frontend: Logout error:', error);
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

