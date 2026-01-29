import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import { ToolRegistry } from "../../tool/registry"
import { Worktree } from "../../worktree"
import { Instance } from "../../project/instance"
import { Project } from "../../project/project"
import { MCP } from "../../mcp"
import { zodToJsonSchema } from "zod-to-json-schema"
import { withInstance } from "../instance-context"

export const ExperimentalRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /experimental/tool/ids - List tool IDs
  fastify.get("/tool/ids", async (request, reply) => {
    return withInstance(request, async () => {
      return reply.send(await ToolRegistry.ids())
    })
  })

  // GET /experimental/tool - List tools
  fastify.get("/tool", async (request, reply) => {
    return withInstance(request, async () => {
      const { provider, model } = request.query as { provider: string; model: string }
      const tools = await ToolRegistry.tools({ providerID: provider, modelID: model })
      return reply.send(
        tools.map((t) => ({
          id: t.id,
          description: t.description,
          // Handle both Zod schemas and plain JSON schemas
          parameters: (t.parameters as any)?._def ? zodToJsonSchema(t.parameters as any) : t.parameters,
        })),
      )
    })
  })

  // POST /experimental/worktree - Create worktree
  fastify.post("/worktree", async (request, reply) => {
    return withInstance(request, async () => {
      const body = request.body as any
      const worktree = await Worktree.create(body)
      return reply.send(worktree)
    })
  })

  // GET /experimental/worktree - List worktrees
  fastify.get("/worktree", async (request, reply) => {
    return withInstance(request, async () => {
      const sandboxes = await Project.sandboxes(Instance.project.id)
      return reply.send(sandboxes)
    })
  })

  // DELETE /experimental/worktree - Remove worktree
  fastify.delete("/worktree", async (request, reply) => {
    return withInstance(request, async () => {
      const body = request.body as any
      await Worktree.remove(body)
      await Project.removeSandbox(Instance.project.id, body.directory)
      return reply.send(true)
    })
  })

  // POST /experimental/worktree/reset - Reset worktree
  fastify.post("/worktree/reset", async (request, reply) => {
    return withInstance(request, async () => {
      const body = request.body as any
      await Worktree.reset(body)
      return reply.send(true)
    })
  })

  // GET /experimental/resource - Get MCP resources
  fastify.get("/resource", async (request, reply) => {
    return withInstance(request, async () => {
      return reply.send(await MCP.resources())
    })
  })
}
