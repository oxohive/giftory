import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'

// Turbopack's root inference stops at this app's package.json unless told otherwise, so it
// never sees ../../packages/ui that @gift/ui symlinks to. Point it at the monorepo root
// explicitly (a sibling of apps/dealer-portal and packages/).
const monorepoRoot = fileURLToPath(new URL('../..', import.meta.url))

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
  // @gift/ui ships untranspiled .tsx/.ts source (file: package, no build step).
  transpilePackages: ['@gift/ui'],
  turbopack: {
    root: monorepoRoot,
  },
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
