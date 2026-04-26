/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
      return [
        {
          source: '/media/:path*',
          destination: 'http://host.docker.internal:8787/media/:path*',
        },
        {
          source: '/thumbnails/:path*',
          destination: 'http://host.docker.internal:8787/thumbnails/:path*',
        },
        {
          source: '/api/:path*',
          destination: 'http://host.docker.internal:8787/api/:path*',
        },
        {
          source: '/connect/:path*',
          destination: 'http://host.docker.internal:8787/connect/:path*',
        },
        {
          source: '/debug/:path*',
          destination: 'http://host.docker.internal:8787/debug/:path*',
        },
        {
          source: '/public/:path*',
          destination: 'http://host.docker.internal:8787/public/:path*',
        },
      ];
    },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default nextConfig;
