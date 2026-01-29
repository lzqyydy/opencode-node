import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Log } from "../util/log"
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import fastifyCors from "@fastify/cors"
import fastifyBasicAuth from "@fastify/basic-auth"
import fastifyWebsocket from "@fastify/websocket"
import { Provider } from "../provider/provider"
import { NamedError } from "@opencode-ai/util/error"
import { LSP } from "../lsp"
import { Format } from "../format"
import { Instance } from "../project/instance"
import { Vcs } from "../project/vcs"
import { Agent } from "../agent/agent"
import { Skill } from "../skill/skill"
import { Auth } from "../auth"
import { Flag } from "../flag/flag"
import { Command } from "../command"
import { Global } from "../global"
import { ProjectRoutes } from "./routes/project"
import { SessionRoutes } from "./routes/session"
import { PtyRoutes } from "./routes/pty"
import { McpRoutes } from "./routes/mcp"
import { FileRoutes } from "./routes/file"
import { ConfigRoutes } from "./routes/config"
import { ExperimentalRoutes } from "./routes/experimental"
import { ProviderRoutes } from "./routes/provider"
import { InstanceBootstrap } from "../project/bootstrap"
import { Storage } from "../storage/storage"
import { QuestionRoutes } from "./routes/question"
import { PermissionRoutes } from "./routes/permission"
import { GlobalRoutes } from "./routes/global"
import { MDNS } from "./mdns"
import { streamSSE } from "./sse"
import { withInstance } from "./instance-context"

// @ts-ignore This global is needed to prevent ai-sdk from logging warnings to stdout
globalThis.AI_SDK_LOG_WARNINGS = false

export namespace Server {
  const log = Log.create({ service: "server" })

  let _url: URL | undefined
  let _corsWhitelist: string[] = []
  let _fastify: FastifyInstance | undefined

  export function url(): URL {
    return _url ?? new URL("http://localhost:4096")
  }

  function createApp(): FastifyInstance {
    const app = Fastify({
      logger: false,
    })

    // Error handler
    app.setErrorHandler((err, request, reply) => {
      log.error("failed", { error: err })

      if (err instanceof NamedError) {
        let status: number
        if (err instanceof Storage.NotFoundError) status = 404
        else if (err instanceof Provider.ModelNotFoundError) status = 400
        else if (err.name.startsWith("Worktree")) status = 400
        else status = 500
        return reply.code(status).send(err.toObject())
      }

      const message = err instanceof Error && err.stack ? err.stack : err.toString()
      return reply.code(500).send(new NamedError.Unknown({ message }).toObject())
    })

    // Basic auth middleware (if password is set)
    const password = Flag.OPENCODE_SERVER_PASSWORD
    if (password) {
      const username = Flag.OPENCODE_SERVER_USERNAME ?? "opencode"
      app.register(fastifyBasicAuth, {
        validate: async (user, pass) => {
          if (user !== username || pass !== password) {
            throw new Error("Unauthorized")
          }
        },
        authenticate: true,
      })
      app.addHook("onRequest", async (request, reply) => {
        try {
          await (app as any).basicAuth(request, reply)
        } catch (err) {
          reply.code(401).send({ error: "Unauthorized" })
        }
      })
    }

    // Request logging
    app.addHook("onRequest", async (request) => {
      const skipLogging = request.url === "/log"
      if (!skipLogging) {
        log.info("request", {
          method: request.method,
          path: request.url,
        })
      }
      ;(request as any).startTime = Date.now()
    })

    app.addHook("onResponse", async (request, reply) => {
      const skipLogging = request.url === "/log"
      if (!skipLogging) {
        const duration = Date.now() - ((request as any).startTime || Date.now())
        log.info("response", {
          method: request.method,
          path: request.url,
          statusCode: reply.statusCode,
          duration,
        })
      }
    })

    // CORS
    app.register(fastifyCors, {
      origin: (origin, cb) => {
        if (!origin) {
          cb(null, true)
          return
        }

        if (origin.startsWith("http://localhost:")) {
          cb(null, true)
          return
        }
        if (origin.startsWith("http://127.0.0.1:")) {
          cb(null, true)
          return
        }
        if (origin === "tauri://localhost" || origin === "http://tauri.localhost") {
          cb(null, true)
          return
        }

        // *.opencode.ai (https only)
        if (/^https:\/\/([a-z0-9-]+\.)*opencode\.ai$/.test(origin)) {
          cb(null, true)
          return
        }
        if (_corsWhitelist.includes(origin)) {
          cb(null, true)
          return
        }

        cb(null, false)
      },
    })

    // WebSocket support
    app.register(fastifyWebsocket)

    // Global routes (no Instance context)
    app.register(GlobalRoutes, { prefix: "/global" })

    // Register route plugins (they handle Instance context internally)
    app.register(ProjectRoutes, { prefix: "/project" })
    app.register(PtyRoutes, { prefix: "/pty" })
    app.register(ConfigRoutes, { prefix: "/config" })
    app.register(ExperimentalRoutes, { prefix: "/experimental" })
    app.register(SessionRoutes, { prefix: "/session" })
    app.register(PermissionRoutes, { prefix: "/permission" })
    app.register(QuestionRoutes, { prefix: "/question" })
    app.register(ProviderRoutes, { prefix: "/provider" })
    app.register(FileRoutes, { prefix: "/" })
    app.register(McpRoutes, { prefix: "/mcp" })

    // Main routes - wrapped with Instance context
    app.post("/instance/dispose", async (request, reply) => {
      return withInstance(request, async () => {
        await Instance.dispose()
        return reply.send(true)
      })
    })

    app.get("/path", async (request, reply) => {
      return withInstance(request, async () => {
        return reply.send({
          home: Global.Path.home,
          state: Global.Path.state,
          config: Global.Path.config,
          worktree: Instance.worktree,
          directory: Instance.directory,
        })
      })
    })

    app.get("/vcs", async (request, reply) => {
      return withInstance(request, async () => {
        const branch = await Vcs.branch()
        return reply.send({ branch })
      })
    })

    app.get("/command", async (request, reply) => {
      return withInstance(request, async () => {
        const commands = await Command.list()
        return reply.send(commands)
      })
    })

    app.post("/log", async (request, reply) => {
      // /log doesn't need Instance context
      const body = request.body as {
        service: string
        level: "debug" | "info" | "error" | "warn"
        message: string
        extra?: Record<string, any>
      }
      const logger = Log.create({ service: body.service })

      switch (body.level) {
        case "debug":
          logger.debug(body.message, body.extra)
          break
        case "info":
          logger.info(body.message, body.extra)
          break
        case "error":
          logger.error(body.message, body.extra)
          break
        case "warn":
          logger.warn(body.message, body.extra)
          break
      }

      return reply.send(true)
    })

    app.get("/agent", async (request, reply) => {
      return withInstance(request, async () => {
        const modes = await Agent.list()
        return reply.send(modes)
      })
    })

    app.get("/skill", async (request, reply) => {
      return withInstance(request, async () => {
        const skills = await Skill.all()
        return reply.send(skills)
      })
    })

    app.get("/lsp", async (request, reply) => {
      return withInstance(request, async () => {
        return reply.send(await LSP.status())
      })
    })

    app.get("/formatter", async (request, reply) => {
      return withInstance(request, async () => {
        return reply.send(await Format.status())
      })
    })

    app.put("/auth/:providerID", async (request, reply) => {
      return withInstance(request, async () => {
        const { providerID } = request.params as { providerID: string }
        const info = request.body as any
        await Auth.set(providerID, info)
        return reply.send(true)
      })
    })

    // SSE event stream - wrapped with Instance context
    app.get("/event", async (request, reply) => {
      return withInstance(request, async () => {
        log.info("event connected")
        // Pass request for CORS headers
        await streamSSE(
          reply,
          async (stream) => {
            stream.writeSSE({
              data: JSON.stringify({
                type: "server.connected",
                properties: {},
              }),
            })

            const unsub = Bus.subscribeAll(async (event) => {
              stream.writeSSE({
                data: JSON.stringify(event),
              })
              if (event.type === Bus.InstanceDisposed.type) {
                stream.close()
              }
            })

            // Send heartbeat every 30s to prevent WKWebView timeout (60s default)
            const heartbeat = setInterval(() => {
              stream.writeSSE({
                data: JSON.stringify({
                  type: "server.heartbeat",
                  properties: {},
                }),
              })
            }, 30000)

            stream.onAbort(() => {
              clearInterval(heartbeat)
              unsub()
              log.info("event disconnected")
            })

            // Keep the connection open
            await new Promise<void>(() => {})
          },
          request,
        )
      })
    })

    // 404 handler for unmatched routes (replaces proxy)
    app.setNotFoundHandler(async (request, reply) => {
      return reply.code(404).send({
        error: "Not Found",
        message: `Route ${request.method} ${request.url} not found`,
      })
    })

    return app
  }

  export interface ServerInstance {
    url: URL
    port: number
    stop: (closeActiveConnections?: boolean) => Promise<void>
  }

  export async function listen(opts: {
    port: number
    hostname: string
    mdns?: boolean
    cors?: string[]
  }): Promise<ServerInstance> {
    _corsWhitelist = opts.cors ?? []

    const app = createApp()
    _fastify = app

    const tryListen = async (port: number): Promise<string | undefined> => {
      try {
        const address = await app.listen({ port, host: opts.hostname })
        return address
      } catch {
        return undefined
      }
    }

    let address: string | undefined
    if (opts.port === 0) {
      address = (await tryListen(4096)) ?? (await tryListen(0))
    } else {
      address = await tryListen(opts.port)
    }

    if (!address) {
      throw new Error(`Failed to start server on port ${opts.port}`)
    }

    const addressUrl = new URL(address)
    _url = addressUrl
    const port = parseInt(addressUrl.port, 10)

    const shouldPublishMDNS =
      opts.mdns &&
      port &&
      opts.hostname !== "127.0.0.1" &&
      opts.hostname !== "localhost" &&
      opts.hostname !== "::1"

    if (shouldPublishMDNS) {
      MDNS.publish(port)
    } else if (opts.mdns) {
      log.warn("mDNS enabled but hostname is loopback; skipping mDNS publish")
    }

    return {
      url: addressUrl,
      port,
      stop: async (closeActiveConnections?: boolean) => {
        if (shouldPublishMDNS) MDNS.unpublish()
        await app.close()
      },
    }
  }
}
