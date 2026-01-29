import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import { Question } from "../../question"
import { withInstance } from "../instance-context"

export const QuestionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /question - List pending questions
  fastify.get("/", async (request, reply) => {
    return withInstance(request, async () => {
      const questions = await Question.list()
      return reply.send(questions)
    })
  })

  // POST /question/:requestID/reply
  fastify.post("/:requestID/reply", async (request, reply) => {
    return withInstance(request, async () => {
      const { requestID } = request.params as { requestID: string }
      const { answers } = request.body as { answers: any }
      await Question.reply({
        requestID,
        answers,
      })
      return reply.send(true)
    })
  })

  // POST /question/:requestID/reject
  fastify.post("/:requestID/reject", async (request, reply) => {
    return withInstance(request, async () => {
      const { requestID } = request.params as { requestID: string }
      await Question.reject(requestID)
      return reply.send(true)
    })
  })
}
