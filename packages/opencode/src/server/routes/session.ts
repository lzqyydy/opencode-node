import type { FastifyInstance, FastifyPluginAsync } from "fastify"
import { Session } from "../../session"
import { MessageV2 } from "../../session/message-v2"
import { SessionPrompt } from "../../session/prompt"
import { SessionCompaction } from "../../session/compaction"
import { SessionRevert } from "../../session/revert"
import { SessionStatus } from "@/session/status"
import { SessionSummary } from "@/session/summary"
import { Todo } from "../../session/todo"
import { Agent } from "../../agent/agent"
import { Log } from "../../util/log"
import { PermissionNext } from "@/permission/next"
import { withInstance, getCorsHeaders } from "../instance-context"

const log = Log.create({ service: "server" })

export const SessionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /session - List sessions
  fastify.get("/", async (request, reply) => {
    return withInstance(request, async () => {
      const query = request.query as {
        directory?: string
        roots?: string
        start?: string
        search?: string
        limit?: string
      }
      const roots = query.roots === "true"
      const start = query.start ? parseInt(query.start, 10) : undefined
      const limit = query.limit ? parseInt(query.limit, 10) : undefined
      const term = query.search?.toLowerCase()

      const sessions: Session.Info[] = []
      for await (const session of Session.list()) {
        if (query.directory !== undefined && session.directory !== query.directory) continue
        if (roots && session.parentID) continue
        if (start !== undefined && session.time.updated < start) continue
        if (term !== undefined && !session.title.toLowerCase().includes(term)) continue
        sessions.push(session)
        if (limit !== undefined && sessions.length >= limit) break
      }
      return reply.send(sessions)
    })
  })

  // GET /session/status
  fastify.get("/status", async (request, reply) => {
    return withInstance(request, async () => {
      const result = SessionStatus.list()
      return reply.send(result)
    })
  })

  // GET /session/:sessionID
  fastify.get("/:sessionID", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      log.info("SEARCH", { url: request.url })
      const session = await Session.get(sessionID)
      return reply.send(session)
    })
  })

  // GET /session/:sessionID/children
  fastify.get("/:sessionID/children", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      const children = await Session.children(sessionID)
      return reply.send(children)
    })
  })

  // GET /session/:sessionID/todo
  fastify.get("/:sessionID/todo", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      const todos = await Todo.get(sessionID)
      return reply.send(todos)
    })
  })

  // POST /session - Create session
  fastify.post("/", async (request, reply) => {
    return withInstance(request, async () => {
      const body = (request.body as any) ?? {}
      const session = await Session.create(body)
      return reply.send(session)
    })
  })

  // DELETE /session/:sessionID
  fastify.delete("/:sessionID", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      await Session.remove(sessionID)
      return reply.send(true)
    })
  })

  // PATCH /session/:sessionID
  fastify.patch("/:sessionID", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      const updates = request.body as {
        title?: string
        time?: { archived?: number }
      }

      const updatedSession = await Session.update(
        sessionID,
        (session) => {
          if (updates.title !== undefined) {
            session.title = updates.title
          }
          if (updates.time?.archived !== undefined) {
            session.time.archived = updates.time.archived
          }
        },
        { touch: false },
      )

      return reply.send(updatedSession)
    })
  })

  // POST /session/:sessionID/init
  fastify.post("/:sessionID/init", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      const body = request.body as any
      await Session.initialize({ ...body, sessionID })
      return reply.send(true)
    })
  })

  // POST /session/:sessionID/fork
  fastify.post("/:sessionID/fork", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      const body = request.body as any
      const result = await Session.fork({ ...body, sessionID })
      return reply.send(result)
    })
  })

  // POST /session/:sessionID/abort
  fastify.post("/:sessionID/abort", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      SessionPrompt.cancel(sessionID)
      return reply.send(true)
    })
  })

  // POST /session/:sessionID/share
  fastify.post("/:sessionID/share", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      await Session.share(sessionID)
      const session = await Session.get(sessionID)
      return reply.send(session)
    })
  })

  // GET /session/:sessionID/diff
  fastify.get("/:sessionID/diff", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      const query = request.query as { messageID: string }
      const result = await SessionSummary.diff({
        sessionID,
        messageID: query.messageID,
      })
      return reply.send(result)
    })
  })

  // DELETE /session/:sessionID/share
  fastify.delete("/:sessionID/share", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      await Session.unshare(sessionID)
      const session = await Session.get(sessionID)
      return reply.send(session)
    })
  })

  // POST /session/:sessionID/summarize
  fastify.post("/:sessionID/summarize", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      const body = request.body as {
        providerID: string
        modelID: string
        auto?: boolean
      }
      const session = await Session.get(sessionID)
      await SessionRevert.cleanup(session)
      const msgs = await Session.messages({ sessionID })
      let currentAgent = await Agent.defaultAgent()
      for (let i = msgs.length - 1; i >= 0; i--) {
        const info = msgs[i].info
        if (info.role === "user") {
          currentAgent = info.agent || (await Agent.defaultAgent())
          break
        }
      }
      await SessionCompaction.create({
        sessionID,
        agent: currentAgent,
        model: {
          providerID: body.providerID,
          modelID: body.modelID,
        },
        auto: body.auto ?? false,
      })
      await SessionPrompt.loop(sessionID)
      return reply.send(true)
    })
  })

  // GET /session/:sessionID/message
  fastify.get("/:sessionID/message", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      const query = request.query as { limit?: string }
      const limit = query.limit ? parseInt(query.limit, 10) : undefined
      const messages = await Session.messages({ sessionID, limit })
      return reply.send(messages)
    })
  })

  // GET /session/:sessionID/message/:messageID
  fastify.get("/:sessionID/message/:messageID", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID, messageID } = request.params as {
        sessionID: string
        messageID: string
      }
      const message = await MessageV2.get({ sessionID, messageID })
      return reply.send(message)
    })
  })

  // DELETE /session/:sessionID/message/:messageID/part/:partID
  fastify.delete("/:sessionID/message/:messageID/part/:partID", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID, messageID, partID } = request.params as {
        sessionID: string
        messageID: string
        partID: string
      }
      await Session.removePart({ sessionID, messageID, partID })
      return reply.send(true)
    })
  })

  // PATCH /session/:sessionID/message/:messageID/part/:partID
  fastify.patch("/:sessionID/message/:messageID/part/:partID", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID, messageID, partID } = request.params as {
        sessionID: string
        messageID: string
        partID: string
      }
      const body = request.body as any
      if (body.id !== partID || body.messageID !== messageID || body.sessionID !== sessionID) {
        throw new Error(
          `Part mismatch: body.id='${body.id}' vs partID='${partID}', body.messageID='${body.messageID}' vs messageID='${messageID}', body.sessionID='${body.sessionID}' vs sessionID='${sessionID}'`,
        )
      }
      const part = await Session.updatePart(body)
      return reply.send(part)
    })
  })

  // POST /session/:sessionID/message - streaming response
  fastify.post("/:sessionID/message", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      const body = request.body as any

      // Include CORS headers for raw response
      const headers = {
        "Content-Type": "application/json",
        ...getCorsHeaders(request),
      }
      reply.raw.writeHead(200, headers)
      const msg = await SessionPrompt.prompt({ ...body, sessionID })
      reply.raw.end(JSON.stringify(msg))
    })
  })

  // POST /session/:sessionID/prompt_async
  fastify.post("/:sessionID/prompt_async", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      const body = request.body as any

      // Fire and forget
      SessionPrompt.prompt({ ...body, sessionID })
      return reply.code(204).send()
    })
  })

  // POST /session/:sessionID/command
  fastify.post("/:sessionID/command", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      const body = request.body as any
      const msg = await SessionPrompt.command({ ...body, sessionID })
      return reply.send(msg)
    })
  })

  // POST /session/:sessionID/shell
  fastify.post("/:sessionID/shell", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      const body = request.body as any
      const msg = await SessionPrompt.shell({ ...body, sessionID })
      return reply.send(msg)
    })
  })

  // POST /session/:sessionID/revert
  fastify.post("/:sessionID/revert", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      const body = request.body as any
      log.info("revert", body)
      const session = await SessionRevert.revert({ sessionID, ...body })
      return reply.send(session)
    })
  })

  // POST /session/:sessionID/unrevert
  fastify.post("/:sessionID/unrevert", async (request, reply) => {
    return withInstance(request, async () => {
      const { sessionID } = request.params as { sessionID: string }
      const session = await SessionRevert.unrevert({ sessionID })
      return reply.send(session)
    })
  })

  // POST /session/:sessionID/permissions/:permissionID (deprecated)
  fastify.post("/:sessionID/permissions/:permissionID", async (request, reply) => {
    return withInstance(request, async () => {
      const { permissionID } = request.params as {
        sessionID: string
        permissionID: string
      }
      const body = request.body as { response: any }
      PermissionNext.reply({
        requestID: permissionID,
        reply: body.response,
      })
      return reply.send(true)
    })
  })
}
