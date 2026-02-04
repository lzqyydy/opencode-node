import {EOL} from "os"
import {Log} from "./util/log"
import {UI} from "./cli/ui"
import {Installation} from "./installation"
import {NamedError} from "@opencode-ai/util/error"
import {FormatError} from "./cli/error"
import {ServeCommand} from "./cli/cmd/serve"
// import {WebCommand} from "./cli/cmd/web"
import {ResolveMessage} from "./util/node-polyfill"


// write current PID to console
console.log(`PID: ${process.pid}${EOL}`)

process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", {
    e: e instanceof Error ? e.message : e,
  })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", {
    e: e instanceof Error ? e.message : e,
  })
})

await Log.init({
  print: false,
  dev: Installation.isLocal(),
  level: (() => {
    if (Installation.isLocal()) return "DEBUG"
    return "INFO"
  })(),
})

process.env.AGENT = "1"
process.env.OPENCODE = "1"

Log.Default.info("opencode", {
  version: Installation.VERSION,
  args: process.argv.slice(2),
})


export async function run() {
  try {
    // await cli.parse()
    await ServeCommand.handler({
      $0: 'opencode',
      _: [],
      port: 0,
      hostname: "127.0.0.1",
      mdns: false,
      cors: [],
    });
  } catch (e) {
    let data: Record<string, any> = {}
    if (e instanceof NamedError) {
      const obj = e.toObject()
      Object.assign(data, {
        ...obj.data,
      })
    }

    if (e instanceof Error) {
      Object.assign(data, {
        name: e.name,
        message: e.message,
        cause: e.cause?.toString(),
        stack: e.stack,
      })
    }

    if (e instanceof ResolveMessage) {
      Object.assign(data, {
        name: e.name,
        message: e.message,
        code: e.code,
        specifier: e.specifier,
        referrer: e.referrer,
        position: e.position,
        importKind: e.importKind,
      })
    }
    Log.Default.error("fatal", data)
    const formatted = FormatError(e)
    if (formatted) UI.error(formatted)
    if (formatted === undefined) {
      UI.error("Unexpected error, check log file at " + Log.file() + " for more details" + EOL)
      console.error(e instanceof Error ? e.message : String(e))
    }
    process.exitCode = 1
  } finally {
    // Some subprocesses don't react properly to SIGTERM and similar signals.
    // Most notably, some docker-container-based MCP servers don't handle such signals unless
    // run using `docker run --init`.
    // Explicitly exit to avoid any hanging subprocesses.
    process.exit()
  }
}
