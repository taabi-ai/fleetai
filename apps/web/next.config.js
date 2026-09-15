/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Optimization: standalone output is required for the Docker build.
  output: 'standalone',
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: { unoptimized: true },
  experimental: {
    // Turbopack is the default in Next 16; keep the webpack-free build.
    turbopack: true,
  },
}

module.exports = nextConfig
