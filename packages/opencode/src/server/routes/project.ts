import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import { Instance } from "../../project/instance"
import { Project } from "../../project/project"
import { withInstance } from "../instance-context"

export const ProjectRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /project - List all projects
  fastify.get("/", async (request, reply) => {
    return withInstance(request, async () => {
      const projects = await Project.list()
      return reply.send(projects)
    })
  })

  // GET /project/current
  fastify.get("/current", async (request, reply) => {
    return withInstance(request, async () => {
      return reply.send(Instance.project)
    })
  })

  // PATCH /project/:projectID
  fastify.patch("/:projectID", async (request, reply) => {
    return withInstance(request, async () => {
      const { projectID } = request.params as { projectID: string }
      const body = request.body as any
      const project = await Project.update({ ...body, projectID })
      return reply.send(project)
    })
  })
}
