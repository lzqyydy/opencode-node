import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import { File } from "../../file"
import { Ripgrep } from "../../file/ripgrep"
import { Instance } from "../../project/instance"
import { withInstance } from "../instance-context"

export const FileRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /find - Find text
  fastify.get("/find", async (request, reply) => {
    return withInstance(request, async () => {
      const { pattern } = request.query as { pattern: string }
      const result = await Ripgrep.search({
        cwd: Instance.directory,
        pattern,
        limit: 10,
      })
      return reply.send(result)
    })
  })

  // GET /find/file - Find files
  fastify.get("/find/file", async (request, reply) => {
    return withInstance(request, async () => {
      const query = request.query as {
        query: string
        dirs?: string
        type?: "file" | "directory"
        limit?: string
      }
      const limit = query.limit ? parseInt(query.limit, 10) : 10
      const results = await File.search({
        query: query.query,
        limit: Math.min(Math.max(limit, 1), 200),
        dirs: query.dirs !== "false",
        type: query.type,
      })
      return reply.send(results)
    })
  })

  // GET /find/symbol - Find symbols
  fastify.get("/find/symbol", async (request, reply) => {
    return withInstance(request, async () => {
      // Currently disabled
      return reply.send([])
    })
  })

  // GET /file - List files
  fastify.get("/file", async (request, reply) => {
    return withInstance(request, async () => {
      const { path } = request.query as { path: string }
      const content = await File.list(path)
      return reply.send(content)
    })
  })

  // GET /file/content - Read file
  fastify.get("/file/content", async (request, reply) => {
    return withInstance(request, async () => {
      const { path } = request.query as { path: string }
      const content = await File.read(path)
      return reply.send(content)
    })
  })

  // GET /file/status - Get file status
  fastify.get("/file/status", async (request, reply) => {
    return withInstance(request, async () => {
      const content = await File.status()
      return reply.send(content)
    })
  })
}
