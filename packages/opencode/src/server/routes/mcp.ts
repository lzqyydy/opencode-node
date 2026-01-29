import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import { MCP } from "../../mcp"
import { withInstance } from "../instance-context"

export const McpRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /mcp - Get MCP status
  fastify.get("/", async (request, reply) => {
    return withInstance(request, async () => {
      return reply.send(await MCP.status())
    })
  })

  // POST /mcp - Add MCP server
  fastify.post("/", async (request, reply) => {
    return withInstance(request, async () => {
      const { name, config } = request.body as { name: string; config: any }
      const result = await MCP.add(name, config)
      return reply.send(result.status)
    })
  })

  // POST /mcp/:name/auth - Start MCP OAuth
  fastify.post("/:name/auth", async (request, reply) => {
    return withInstance(request, async () => {
      const { name } = request.params as { name: string }
      const supportsOAuth = await MCP.supportsOAuth(name)
      if (!supportsOAuth) {
        return reply.code(400).send({ error: `MCP server ${name} does not support OAuth` })
      }
      const result = await MCP.startAuth(name)
      return reply.send(result)
    })
  })

  // POST /mcp/:name/auth/callback - Complete MCP OAuth
  fastify.post("/:name/auth/callback", async (request, reply) => {
    return withInstance(request, async () => {
      const { name } = request.params as { name: string }
      const { code } = request.body as { code: string }
      const status = await MCP.finishAuth(name, code)
      return reply.send(status)
    })
  })

  // POST /mcp/:name/auth/authenticate
  fastify.post("/:name/auth/authenticate", async (request, reply) => {
    return withInstance(request, async () => {
      const { name } = request.params as { name: string }
      const supportsOAuth = await MCP.supportsOAuth(name)
      if (!supportsOAuth) {
        return reply.code(400).send({ error: `MCP server ${name} does not support OAuth` })
      }
      const status = await MCP.authenticate(name)
      return reply.send(status)
    })
  })

  // DELETE /mcp/:name/auth
  fastify.delete("/:name/auth", async (request, reply) => {
    return withInstance(request, async () => {
      const { name } = request.params as { name: string }
      await MCP.removeAuth(name)
      return reply.send({ success: true as const })
    })
  })

  // POST /mcp/:name/connect
  fastify.post("/:name/connect", async (request, reply) => {
    return withInstance(request, async () => {
      const { name } = request.params as { name: string }
      await MCP.connect(name)
      return reply.send(true)
    })
  })

  // POST /mcp/:name/disconnect
  fastify.post("/:name/disconnect", async (request, reply) => {
    return withInstance(request, async () => {
      const { name } = request.params as { name: string }
      await MCP.disconnect(name)
      return reply.send(true)
    })
  })
}
