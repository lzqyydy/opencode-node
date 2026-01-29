import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import { BusEvent } from "@/bus/bus-event"
import { GlobalBus } from "@/bus/global"
import { Instance } from "../../project/instance"
import { Installation } from "@/installation"
import { Log } from "../../util/log"
import { streamSSE } from "../sse"
import z from "zod"

const log = Log.create({ service: "server" })

export const GlobalDisposedEvent = BusEvent.define("global.disposed", z.object({}))

export const GlobalRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /global/health
  fastify.get("/health", async (request, reply) => {
    return reply.send({ healthy: true, version: Installation.VERSION })
  })

  // GET /global/event - SSE stream
  fastify.get("/event", async (request, reply) => {
    log.info("global event connected")
    // Pass request for CORS headers
    await streamSSE(
      reply,
      async (stream) => {
        stream.writeSSE({
          data: JSON.stringify({
            payload: {
              type: "server.connected",
              properties: {},
            },
          }),
        })

        async function handler(event: any) {
          stream.writeSSE({
            data: JSON.stringify(event),
          })
        }
        GlobalBus.on("event", handler)

        // Send heartbeat every 30s to prevent WKWebView timeout (60s default)
        const heartbeat = setInterval(() => {
          stream.writeSSE({
            data: JSON.stringify({
              payload: {
                type: "server.heartbeat",
                properties: {},
              },
            }),
          })
        }, 30000)

        stream.onAbort(() => {
          clearInterval(heartbeat)
          GlobalBus.off("event", handler)
          log.info("global event disconnected")
        })

        // Keep the connection open
        await new Promise<void>(() => {})
      },
      request,
    )
  })

  // POST /global/dispose
  fastify.post("/dispose", async (request, reply) => {
    await Instance.disposeAll()
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: GlobalDisposedEvent.type,
        properties: {},
      },
    })
    return reply.send(true)
  })
}
