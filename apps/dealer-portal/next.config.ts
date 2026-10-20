import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'

// Turbopack's root inference stops at this app's package.json unless told otherwise, so it
// never sees ../../packages/{ui,api-client} that @gift/ui and @gift/api-client symlink to.
// Point it at the monorepo root explicitly (a sibling of apps/storefront and packages/).
const monorepoRoot = fileURLToPath(new URL('../..', import.meta.url))

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // @gift/ui and @gift/api-client ship untranspiled .tsx/.ts source (file: packages, no build step).
  transpilePackages: ['@gift/ui', '@gift/api-client'],
  turbopack: {
    root: monorepoRoot,
  },
}

export default config
