import type { NextConfig } from 'next'

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'

function remotePatternFor(url: string) {
  try {
    const parsed = new URL(url)
    return {
      protocol: parsed.protocol.replace(':', '') as 'http' | 'https',
      hostname: parsed.hostname,
      port: parsed.port,
      pathname: '/**',
    }
  } catch {
    return null
  }
}

const backendPattern = remotePatternFor(apiBase)

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: backendPattern ? [backendPattern] : [],
  },
}

export default nextConfig
