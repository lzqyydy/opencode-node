import http from "http"
import https from "https"
import net from "net"

/**
 * Node.js polyfill for Bun.Server type
 */
export interface NodeServer<T = undefined> {
  readonly port: number
  readonly hostname: string
  readonly url: URL
  stop(closeActiveConnections?: boolean): Promise<void> | void
  readonly websocket?: NodeWebSocketHandler<T>
}

/**
 * WebSocket handler interface compatible with Bun's WebSocketHandler
 */
export interface NodeWebSocketHandler<T = undefined> {
  message?: (ws: NodeServerWebSocket<T>, message: string | Buffer) => void
  open?: (ws: NodeServerWebSocket<T>) => void
  close?: (ws: NodeServerWebSocket<T>, code: number, reason: string) => void
  drain?: (ws: NodeServerWebSocket<T>) => void
  error?: (ws: NodeServerWebSocket<T>, error: Error) => void
}

/**
 * Server WebSocket interface compatible with Bun's ServerWebSocket
 */
export interface NodeServerWebSocket<T = undefined> {
  readonly data: T
  readonly readyState: 0 | 1 | 2 | 3
  send(message: string | Buffer | ArrayBuffer | Uint8Array): void
  close(code?: number, reason?: string): void
  ping(data?: string | Buffer): void
  pong(data?: string | Buffer): void
}

/**
 * Options for serve function, compatible with Bun.serve options
 */
export interface NodeServeOptions<T = undefined> {
  port?: number
  hostname?: string
  fetch: (request: Request, server: NodeServer<T>) => Response | Promise<Response>
  websocket?: NodeWebSocketHandler<T>
  idleTimeout?: number
}

/**
 * Options for connect function, compatible with Bun.connect options
 */
export interface NodeConnectOptions {
  hostname: string
  port: number
  socket: {
    open?: (socket: NodeSocket) => void
    data?: (socket: NodeSocket, data: Buffer) => void
    close?: (socket: NodeSocket) => void
    error?: (socket: NodeSocket, error: Error) => void
  }
}

/**
 * Socket interface for TCP connections
 */
export interface NodeSocket {
  end(): void
  write(data: string | Buffer): void
}

/**
 * Create an HTTP server (similar to Bun.serve)
 * @param options - Server options including port, hostname, fetch handler, and optional websocket handler
 * @returns A server object compatible with Bun.Server
 */
export function serve<T = undefined>(options: NodeServeOptions<T>): NodeServer<T> {
  const { port = 0, hostname = "0.0.0.0", fetch, websocket, idleTimeout } = options

  let actualPort = port
  let actualHostname = hostname
  let serverUrl: URL

  const server = http.createServer(async (req, res) => {
    try {
      // Build the URL
      const protocol = "http"
      const host = req.headers.host || `${actualHostname}:${actualPort}`
      const url = new URL(req.url || "/", `${protocol}://${host}`)

      // Read body if present
      let body: BodyInit | undefined
      if (req.method !== "GET" && req.method !== "HEAD") {
        const chunks: Buffer[] = []
        for await (const chunk of req) {
          chunks.push(chunk as Buffer)
        }
        if (chunks.length > 0) {
          body = Buffer.concat(chunks)
        }
      }

      // Create Headers object
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            value.forEach((v) => headers.append(key, v))
          } else {
            headers.set(key, value)
          }
        }
      }

      // Create Request object
      const request = new Request(url.toString(), {
        method: req.method,
        headers,
        body: body,
        // @ts-ignore - duplex is required for streaming bodies
        duplex: body ? "half" : undefined,
      })

      // Call fetch handler
      const response = await fetch(request, nodeServer)

      // Send response status and headers
      res.statusCode = response.status
      response.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })

      // Send response body
      if (response.body) {
        const reader = response.body.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(Buffer.from(value))
          }
        } finally {
          reader.releaseLock()
        }
        res.end()
      } else {
        res.end()
      }
    } catch (error) {
      console.error("Server error:", error)
      if (!res.headersSent) {
        res.statusCode = 500
        res.end("Internal Server Error")
      }
    }
  })

  // Handle idle timeout (convert to milliseconds)
  if (idleTimeout !== undefined && idleTimeout > 0) {
    server.timeout = idleTimeout * 1000
    server.keepAliveTimeout = idleTimeout * 1000
  } else if (idleTimeout === 0) {
    // 0 means no timeout
    server.timeout = 0
    server.keepAliveTimeout = 0
  }

  // Start listening synchronously (throw if port in use)
  try {
    server.listen(port, hostname)
  } catch (err) {
    throw new Error(`Failed to start server on port ${port}: ${err}`)
  }

  // Wait for server to be ready and get actual address
  const address = server.address()
  if (typeof address === "object" && address) {
    actualPort = address.port
    actualHostname = address.address
  }

  // Create URL with localhost if bound to all interfaces
  const urlHostname = actualHostname === "0.0.0.0" || actualHostname === "::" ? "localhost" : actualHostname
  serverUrl = new URL(`http://${urlHostname}:${actualPort}`)

  const nodeServer: NodeServer<T> = {
    get port() {
      return actualPort
    },
    get hostname() {
      return actualHostname
    },
    get url() {
      return serverUrl
    },
    websocket,
    stop(closeActiveConnections?: boolean): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        if (closeActiveConnections) {
          // Force close all connections
          server.closeAllConnections?.()
        }
        server.close((err) => {
          if (err && (err as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    },
  }

  return nodeServer
}

/**
 * Create a TCP connection to check if a port is in use (similar to Bun.connect)
 * @param options - Connection options including hostname, port, and socket handlers
 * @returns A promise that resolves to a socket object
 */
export function connect(options: NodeConnectOptions): Promise<NodeSocket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: options.hostname,
      port: options.port,
    })

    const nodeSocket: NodeSocket = {
      end() {
        socket.end()
      },
      write(data: string | Buffer) {
        socket.write(data)
      },
    }

    socket.on("connect", () => {
      options.socket.open?.(nodeSocket)
      resolve(nodeSocket)
    })

    socket.on("data", (data) => {
      options.socket.data?.(nodeSocket, data)
    })

    socket.on("close", () => {
      options.socket.close?.(nodeSocket)
    })

    socket.on("error", (error) => {
      options.socket.error?.(nodeSocket, error)
      reject(error)
    })
  })
}

/**
 * Type alias for Bun.Server compatibility
 * This allows code to use `NodeBunServer<T>` as a drop-in replacement for `Bun.Server<T>`
 */
export type NodeBunServer<T = undefined> = NodeServer<T>
