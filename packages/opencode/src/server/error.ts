// Error definitions for Fastify routes (simplified without OpenAPI)
// These are kept for reference but no longer used for OpenAPI schema generation

export const ERRORS = {
  400: {
    description: "Bad request",
  },
  404: {
    description: "Not found",
  },
} as const

export function errors(...codes: number[]) {
  return Object.fromEntries(codes.map((code) => [code, ERRORS[code as keyof typeof ERRORS]]))
}
