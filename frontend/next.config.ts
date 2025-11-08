import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    // Use environment variable for backend URL
    // When frontend runs locally, use localhost:3000
    // When frontend runs in Docker, use backend:3000
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

    return [
      {
        source: '/api/:path*', // Proxy all API requests
        destination: `${backendUrl}/:path*`, // Redirect to the backend
      },
    ];
  },
};

export default nextConfig;
