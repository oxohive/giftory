import 'server-only'
import type { z } from 'zod'
import { serverEnv } from '@/lib/env.server'
import { ApiError, buildQuery, parseResponse, type RequestOptions } from './http'

export type ServerRequestOptions = RequestOptions & {
  /**
   * Append the shop identifier (`organizationId`, else `orgSlug`) from server config. Public
   * storefront/gift_catalog routes need it on platform domains (localhost) to resolve the shop;
   * the backend derives the tenant from it and never trusts it as scope.
   */
  withShop?: boolean
  /** Seconds to keep the response in Next's data cache. 0 = no caching. */
  revalidate?: number
  tags?: string[]
}

/** Shop identifier query for public backend routes (see `withShop`). */
export function shopQuery(): Record<string, string> {
  if (serverEnv.organizationId) return { organizationId: serverEnv.organizationId }
  if (serverEnv.organizationSlug) return { orgSlug: serverEnv.organizationSlug }
  return {}
}

/** Server-side request straight to Open Mercato (`${apiBase}/api/...`). Never runs in the browser. */
export async function serverRequest<T>(path: string, schema: z.ZodType<T>, options: ServerRequestOptions = {}): Promise<T> {
  const query = options.withShop ? { ...options.query, ...shopQuery() } : options.query
  const url = `${serverEnv.apiBaseUrl}/api/${path.replace(/^\/+/, '')}${buildQuery(query)}`
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal ?? AbortSignal.timeout(10_000),
      ...(options.revalidate && options.revalidate > 0
        ? { next: { revalidate: options.revalidate, tags: options.tags } }
        : { cache: 'no-store' as const }),
    })
  } catch (error) {
    throw new ApiError(`Backend unreachable at ${serverEnv.apiBaseUrl}`, { code: 'network', details: error })
  }
  return parseResponse(res, schema, path)
}
