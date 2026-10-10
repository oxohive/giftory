import type { NextConfig } from "next";
import { resolveAllowedDevOrigins } from './src/lib/dev-origins'
import { telemetryServerExternalPackages } from '@open-mercato/telemetry/nextjs-config'

const isDevelopment = process.env.NODE_ENV !== 'production'
const allowedDevOrigins = isDevelopment ? resolveAllowedDevOrigins() : []

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' data: https:",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  "img-src 'self' data: blob: https:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https: ws: wss:",
].join('; ')

const nextConfig: NextConfig & { agentRules?: boolean } = {
  distDir: '.mercato/next',
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Mirror apps/mercato: scaffolded apps ship their own AGENTS.md/CLAUDE.md
  // from the template, so let Next 16.3+ leave them alone rather than
  // appending its managed agent-rules block on every `next dev`.
  agentRules: false,
  experimental: {
    serverMinification: false,
    turbopackMinify: false,
    // Mirror apps/mercato: treat these barrel-heavy packages as having
    // modularized exports so only the named exports actually used are
    // evaluated. Keeps scaffolded apps on the same client-bundle baseline.
    //   - lucide-react: icons used across the default backend components.
    //   - recharts: pairs with the next/dynamic chart split in @open-mercato/ui.
    //   - date-fns: already deep-imported; listed here as defense-in-depth.
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns'],
    ...(isDevelopment
      ? {
          preloadEntriesOnStart: false,
        }
      : {}),
  },
  allowedDevOrigins: allowedDevOrigins.length > 0 ? allowedDevOrigins : undefined,
  // Transpile @open-mercato packages that have TypeScript in src/
  // Note: @open-mercato/shared is excluded as it has pre-built dist/ files
  transpilePackages: [
    '@open-mercato/core',
    '@open-mercato/ui',
    '@open-mercato/events',
    '@open-mercato/cache',
    '@open-mercato/queue',
    '@open-mercato/search',
    '@open-mercato/content',
    '@open-mercato/onboarding',
    '@open-mercato/ai-assistant',
  ],
  serverExternalPackages: [
    'esbuild',
    '@esbuild/darwin-arm64',
    '@open-mercato/cli',
    'puppeteer-core',
    'jszip',
    'yjs',
    // Telemetry: the OTEL SDK + instrumentations must run as real Node modules,
    // not be bundled — the auto-instrumentations (pg/undici) monkey-patch the
    // underlying drivers at runtime. The full list is owned by
    // @open-mercato/telemetry so it can never drift into a partial (silently
    // "emits nothing") copy.
    ...telemetryServerExternalPackages,
    // @opentelemetry/sdk-node's own build/src/{utils,sdk}.js unconditionally
    // `require()` ALL four OTLP exporter variants (HTTP + gRPC) regardless of
    // which protocol is actually configured — telemetryServerExternalPackages
    // only lists the HTTP ones. Without these, webpack tries to bundle
    // @grpc/grpc-js (which needs Node's `fs`) and fails with
    // "Module not found: Can't resolve 'fs'" in certificate-provider.js.
    '@opentelemetry/exporter-trace-otlp-grpc',
    '@opentelemetry/exporter-logs-otlp-grpc',
    '@opentelemetry/exporter-metrics-otlp-grpc',
    '@opentelemetry/otlp-grpc-exporter-base',
    '@grpc/grpc-js',
    '@grpc/proto-loader',
  ],
  // `serverExternalPackages` above only covers the Node.js server compilation.
  // The grpc/OTel chain also gets pulled into the CLIENT (browser) bundle via
  // .mercato/generated/messages.client.generated.ts -> a module's
  // message-objects.ts -> @open-mercato/core's bootstrap -> events/queue ->
  // @open-mercato/telemetry -> @opentelemetry/sdk-node -> the gRPC exporters
  // -> @grpc/grpc-js, which needs real Node sockets/DNS/TLS/fs that don't
  // exist in a browser. That code path is never actually reachable client-side
  // (telemetry only runs server-side) — it's an accidental transitive import,
  // not a real client dependency — so stub these out for the browser bundle
  // only, rather than trying to break the import chain itself.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        dns: false,
        net: false,
        tls: false,
        child_process: false,
        http2: false,
        os: false,
        perf_hooks: false,
      }
    }
    return config
  },
  // Mirror server-only env vars that client components must observe. Keep this
  // list minimal — anything added here is inlined into the client bundle.
  env: {
    OM_SEARCH_MIN_LEN: process.env.OM_SEARCH_MIN_LEN,
  },
  async headers() {
    const originHeaderName = (process.env.CUSTOMER_DOMAIN_ORIGIN_HEADER ?? 'X-Open-Mercato-Origin').trim()
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        // Attachment file downloads set their own restrictive CSP (sandbox)
        // in the route handler — override the global app CSP so it is not
        // replaced at the Next.js config layer.
        source: '/api/attachments/file/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'none'; sandbox" },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        // Marker header consumed by the custom-domain DNS reverse-resolve check
        // (see SPEC 2026-04-08-portal-custom-domain-routing). Lets the verifier
        // tell "request reached our origin" from "request was answered by an
        // unrelated host that proxied it through Cloudflare/Fastly".
        source: '/_next/health',
        headers: [{ key: originHeaderName, value: '1' }],
      },
    ]
  },
}

export default nextConfig
