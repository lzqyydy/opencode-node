import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import { PermissionNext } from "@/permission/next"
import { withInstance } from "../instance-context"

export const PermissionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /permission/:requestID/reply
  fastify.post("/:requestID/reply", async (request, reply) => {
    return withInstance(request, async () => {
      const { requestID } = request.params as { requestID: string }
      const { reply: replyValue, message } = request.body as {
        reply: any
        message?: string
      }
      await PermissionNext.reply({
        requestID,
        reply: replyValue,
        message,
      })
      return reply.send(true)
    })
  })

  // GET /permission - List pending permissions
  fastify.get("/", async (request, reply) => {
    return withInstance(request, async () => {
      const permissions = await PermissionNext.list()
      return reply.send(permissions)
    })
  })
}
