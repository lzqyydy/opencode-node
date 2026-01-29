import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import { Config } from "../../config/config"
import { Provider } from "../../provider/provider"
import { ModelsDev } from "../../provider/models"
import { ProviderAuth } from "../../provider/auth"
import { mapValues } from "remeda"
import { withInstance } from "../instance-context"

export const ProviderRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /provider - List providers
  fastify.get("/", async (request, reply) => {
    return withInstance(request, async () => {
      const config = await Config.get()
      const disabled = new Set(config.disabled_providers ?? [])
      const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined

      const allProviders = await ModelsDev.get()
      const filteredProviders: Record<string, (typeof allProviders)[string]> = {}
      for (const [key, value] of Object.entries(allProviders)) {
        if ((enabled ? enabled.has(key) : true) && !disabled.has(key)) {
          filteredProviders[key] = value
        }
      }

      const connected = await Provider.list()
      const providers = Object.assign(
        mapValues(filteredProviders, (x) => Provider.fromModelsDevProvider(x)),
        connected,
      )
      return reply.send({
        all: Object.values(providers),
        default: mapValues(providers, (item) => Provider.sort(Object.values(item.models))[0].id),
        connected: Object.keys(connected),
      })
    })
  })

  // GET /provider/auth - Get provider auth methods
  fastify.get("/auth", async (request, reply) => {
    return withInstance(request, async () => {
      return reply.send(await ProviderAuth.methods())
    })
  })

  // POST /provider/:providerID/oauth/authorize
  fastify.post("/:providerID/oauth/authorize", async (request, reply) => {
    return withInstance(request, async () => {
      const { providerID } = request.params as { providerID: string }
      const { method } = request.body as { method: number }
      const result = await ProviderAuth.authorize({
        providerID,
        method,
      })
      return reply.send(result)
    })
  })

  // POST /provider/:providerID/oauth/callback
  fastify.post("/:providerID/oauth/callback", async (request, reply) => {
    return withInstance(request, async () => {
      const { providerID } = request.params as { providerID: string }
      const { method, code } = request.body as { method: number; code?: string }
      await ProviderAuth.callback({
        providerID,
        method,
        code,
      })
      return reply.send(true)
    })
  })
}
