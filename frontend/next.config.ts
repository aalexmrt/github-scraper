import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Proxy API requests to backend
  // Uses NEXT_PUBLIC_API_URL environment variable (set in Vercel dashboard for production)
  // Falls back to localhost for local development
  async rewrites() {
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
