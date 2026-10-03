/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'builder-stellar-web.vercel.app',
        pathname: '/images/**'
      },
      {
        protocol: 'https',
        hostname: 'builder-stellar-web.vercel.app',
        pathname: '/api/render/**'
      }
    ]
  }
};

export default nextConfig;
