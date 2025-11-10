import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Proxy API requests to backend in local development
  // In production, Vercel handles this via vercel.json rewrites
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NEXT_PUBLIC_API_URL 
          ? `${process.env.NEXT_PUBLIC_API_URL}/:path*`
          : 'http://localhost:3000/:path*',
      },
    ];
  },
};

export default nextConfig;
