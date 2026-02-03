import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import { Pty } from "@/pty"
import { Storage } from "../../storage/storage"
import { withInstance } from "../instance-context"

export const PtyRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /pty - List PTY sessions
  fastify.get("/", async (request, reply) => {
    return withInstance(request, async () => {
      return reply.send(Pty.list())
    })
  })

  // POST /pty - Create PTY session
  fastify.post("/", async (request, reply) => {
    return withInstance(request, async () => {
      const body = request.body as any
      const info = await Pty.create(body)
      return reply.send(info)
    })
  })

  // GET /pty/:ptyID
  fastify.get("/:ptyID", async (request, reply) => {
    return withInstance(request, async () => {
      const { ptyID } = request.params as { ptyID: string }
      const info = Pty.get(ptyID)
      if (!info) {
        throw new Storage.NotFoundError({ message: "Session not found" })
      }
      return reply.send(info)
    })
  })

  // PUT /pty/:ptyID
  fastify.put("/:ptyID", async (request, reply) => {
    return withInstance(request, async () => {
      const { ptyID } = request.params as { ptyID: string }
      const body = request.body as any
      const info = await Pty.update(ptyID, body)
      return reply.send(info)
    })
  })

  // DELETE /pty/:ptyID
  fastify.delete("/:ptyID", async (request, reply) => {
    return withInstance(request, async () => {
      const { ptyID } = request.params as { ptyID: string }
      await Pty.remove(ptyID)
      return reply.send(true)
    })
  })

  // GET /pty/:ptyID/connect - WebSocket connection
  fastify.get("/:ptyID/connect", { websocket: true }, (connection, request) => {
    return withInstance(request, async () => {
      const { ptyID } = request.params as { ptyID: string }

      if (!Pty.get(ptyID)) {
        connection.socket.close(1008, "Session not found")
        return
      }

      // Create a WebSocket adapter that matches the expected interface
      const wsAdapter: Pty.WebSocketLike = {
        send: (data: string | ArrayBuffer) => {
          if (connection.socket.readyState === 1) {
            // WebSocket.OPEN
            connection.socket.send(data)
          }
        },
        close: () => {
          connection.socket.close()
        },
        readyState: connection.socket.readyState,
      }

      // Update readyState when it changes
      const updateReadyState = () => {
        wsAdapter.readyState = connection.socket.readyState
      }

      const handler = Pty.connect(ptyID, wsAdapter)

      connection.socket.on("message", (message) => {
        updateReadyState()
        handler?.onMessage(String(message))
      })

      connection.socket.on("close", () => {
        updateReadyState()
        handler?.onClose()
      })
    })
  })
}
