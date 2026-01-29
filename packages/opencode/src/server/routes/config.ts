import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import { Config } from "../../config/config"
import { Provider } from "../../provider/provider"
import { mapValues } from "remeda"
import { Log } from "../../util/log"
import { withInstance } from "../instance-context"

const log = Log.create({ service: "server" })

export const ConfigRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /config
  fastify.get("/", async (request, reply) => {
    return withInstance(request, async () => {
      return reply.send(await Config.get())
    })
  })

  // PATCH /config
  fastify.patch("/", async (request, reply) => {
    return withInstance(request, async () => {
      const config = request.body as any
      await Config.update(config)
      return reply.send(config)
    })
  })

  // GET /config/providers
  fastify.get("/providers", async (request, reply) => {
    return withInstance(request, async () => {
      using _ = log.time("providers")
      const providers = await Provider.list().then((x) => mapValues(x, (item) => item))
      return reply.send({
        providers: Object.values(providers),
        default: mapValues(providers, (item) => Provider.sort(Object.values(item.models))[0].id),
      })
    })
  })
}
