import type { FastifyReply, FastifyRequest } from "fastify"
import {getCorsHeaders} from "./instance-context";

export interface SSEStream {
  writeSSE(event: { data: string; event?: string; id?: string }): void
  close(): void
  onAbort(callback: () => void): void
}

export function streamSSE(
  reply: FastifyReply,
  handler: (stream: SSEStream) => Promise<void>,
  request?: FastifyRequest,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const raw = reply.raw

    // Build headers including CORS
    const headers: Record<string, string> = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...(request ? getCorsHeaders(request) : {}),
    }

    raw.writeHead(200, headers)

    let closed = false
    let abortCallback: (() => void) | undefined

    const stream: SSEStream = {
      writeSSE(event) {
        if (closed) return
        if (event.id) raw.write(`id: ${event.id}\n`)
        if (event.event) raw.write(`event: ${event.event}\n`)
        raw.write(`data: ${event.data}\n\n`)
      },
      close() {
        if (closed) return
        closed = true
        raw.end()
        resolve()
      },
      onAbort(callback) {
        abortCallback = callback
      },
    }

    // Handle client disconnect
    raw.on("close", () => {
      if (!closed) {
        closed = true
        abortCallback?.()
        resolve()
      }
    })

    // Execute handler
    handler(stream).catch((err) => {
      console.error("SSE handler error:", err)
      if (!closed) {
        closed = true
        raw.end()
        resolve()
      }
    })
  })
}
