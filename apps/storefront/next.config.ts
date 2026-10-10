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
  // Redirect Open Mercato portal email links to the storefront account pages.
  // Open Mercato builds email links as {PLATFORM_PORTAL_BASE_URL}/{orgSlug}/portal/verify?token=...
  // When PLATFORM_PORTAL_BASE_URL points at the storefront origin these redirects
  // catch those paths and forward the token to the storefront's own account pages.
  async redirects() {
    return [
      {
        source: '/:orgSlug/portal/verify',
        destination: '/account/verify',
        permanent: false,
      },
      {
        source: '/:orgSlug/portal/reset-password',
        destination: '/account/reset-password',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
