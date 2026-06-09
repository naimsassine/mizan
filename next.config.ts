import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    after: true,
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
}

export default nextConfig
