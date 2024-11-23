import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  /* config options here */
  async rewrites() {
    return [
      {
        source: '/api/:path*', // Proxy all API requests
        destination: 'http://app:3000/:path*', // Redirect to the backend container
      },
    ];
  },
};

export default nextConfig;

