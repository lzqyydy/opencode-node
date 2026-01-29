import type { FastifyRequest, FastifyReply } from "fastify"
import { Instance } from "../project/instance"
import { InstanceBootstrap } from "../project/bootstrap"

/**
 * Get CORS headers for a request if origin is allowed
 */
export function getCorsHeaders(request: FastifyRequest): Record<string, string> {
  const headers: Record<string, string> = {}
  const origin = request.headers.origin

  if (origin) {
    // Check if origin is allowed (matching the CORS config in server.ts)
    const isAllowed =
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:") ||
      origin === "tauri://localhost" ||
      origin === "http://tauri.localhost" ||
      /^https:\/\/([a-z0-9-]+\.)*opencode\.ai$/.test(origin)

    if (isAllowed) {
      headers["Access-Control-Allow-Origin"] = origin
      headers["Access-Control-Allow-Credentials"] = "true"
    }
  }

  return headers
}

/**
 * Helper to get directory from request
 */
export function getDirectoryFromRequest(request: FastifyRequest): string {
  let directory =
    (request.query as any)?.directory ||
    request.headers["x-opencode-directory"] ||
    process.cwd()
  try {
    directory = decodeURIComponent(directory as string)
  } catch {
    // fallback to original value
  }
  return directory
}

/**
 * Wrap a route handler with Instance context
 */
export function withInstance<T>(
  request: FastifyRequest,
  handler: () => T,
) {
  const directory = getDirectoryFromRequest(request)
  return Instance.provide({
    directory,
    init: InstanceBootstrap,
    fn: handler,
  })
}
