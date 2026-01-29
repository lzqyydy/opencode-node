import {spawn as nodeSpawn, type SpawnOptions, type ChildProcess} from "child_process"
import path from "path"
import fs from "fs"

/**
 * Interface for spawn options similar to Bun.SpawnOptions
 */
export interface NodeSpawnOptions {
  cwd?: string
  env?: Record<string, string | undefined>
  stdout?: "pipe" | "ignore" | "inherit" | number
  stderr?: "pipe" | "ignore" | "inherit" | number
  stdin?: "pipe" | "ignore" | "inherit" | number
  maxBuffer?: number
}

/**
 * FileSink interface compatible with Bun's FileSink
 */
export interface NodeFileSink {
  write(data: string | ArrayBuffer | ArrayBufferView | Uint8Array): number
  end(data?: string | ArrayBuffer | ArrayBufferView | Uint8Array): number
  flush(): void
}

/**
 * Interface for the spawned process similar to Bun's Subprocess
 */
export interface NodeSubprocess {
  readonly pid: number | undefined
  readonly stdin: NodeFileSink
  readonly stdout: ReadableStream<Uint8Array>
  readonly stderr: ReadableStream<Uint8Array>
  readonly exited: Promise<number>
  readonly exitCode: number | null
  kill(signal?: number | NodeJS.Signals): void
  ref(): void
  unref(): void
}

/**
 * Options for the which function
 */
export interface WhichOptions {
  PATH?: string
}

/**
 * A no-op FileSink for when stdin is not available
 */
const noopFileSink: NodeFileSink = {
  write(): number {
    return 0
  },
  end(): number {
    return 0
  },
  flush(): void {},
}

/**
 * A no-op ReadableStream for when stdout/stderr is not available
 */
const noopReadableStream: ReadableStream<Uint8Array> = new ReadableStream({
  start(controller) {
    controller.close()
  },
})

/**
 * Convert Node.js Readable stream to Web ReadableStream
 */
function nodeStreamToWebReadable(nodeStream: NodeJS.ReadableStream | null): ReadableStream<Uint8Array> | null {
  if (!nodeStream) return null

  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk))
      })
      nodeStream.on("end", () => {
        controller.close()
      })
      nodeStream.on("error", (err) => {
        controller.error(err)
      })
    },
    cancel() {
      if ("destroy" in nodeStream && typeof nodeStream.destroy === "function") {
        nodeStream.destroy()
      }
    },
  })
}

/**
 * Create a FileSink compatible wrapper for Node.js writable stream
 */
function createFileSink(nodeStream: NodeJS.WritableStream | null): NodeFileSink | null {
  if (!nodeStream) return null

  return {
    write(data: string | ArrayBuffer | ArrayBufferView | Uint8Array): number {
      let buffer: Buffer
      if (typeof data === "string") {
        buffer = Buffer.from(data)
      } else if (data instanceof ArrayBuffer) {
        buffer = Buffer.from(data)
      } else if (ArrayBuffer.isView(data)) {
        buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      } else {
        buffer = Buffer.from(data)
      }
      nodeStream.write(buffer)
      return buffer.length
    },
    end(data?: string | ArrayBuffer | ArrayBufferView | Uint8Array): number {
      if (data !== undefined) {
        let buffer: Buffer
        if (typeof data === "string") {
          buffer = Buffer.from(data)
        } else if (data instanceof ArrayBuffer) {
          buffer = Buffer.from(data)
        } else if (ArrayBuffer.isView(data)) {
          buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        } else {
          buffer = Buffer.from(data)
        }
        nodeStream.end(buffer)
        return buffer.length
      }
      nodeStream.end()
      return 0
    },
    flush(): void {
      // Node.js streams auto-flush, this is a no-op for compatibility
      if ("cork" in nodeStream && "uncork" in nodeStream) {
        ;(nodeStream as any).uncork()
      }
    },
  }
}

/**
 * Spawn a new process (similar to Bun.spawn)
 * Supports both array form and object form
 *
 * @param cmdOrOptions - Command array or options object with cmd property
 * @param options - Spawn options (when first argument is command array)
 * @returns A subprocess object compatible with Bun's Subprocess
 */
export function spawn(cmdOrOptions: string[] | {cmd: string[]} & NodeSpawnOptions, options?: NodeSpawnOptions): NodeSubprocess {
  let cmd: string[]
  let opts: NodeSpawnOptions

  // Handle both calling conventions:
  // 1. spawn([cmd, ...args], options)
  // 2. spawn({ cmd: [cmd, ...args], ...options })
  if (Array.isArray(cmdOrOptions)) {
    cmd = cmdOrOptions
    opts = options || {}
  } else {
    cmd = cmdOrOptions.cmd
    const {cmd: _, ...rest} = cmdOrOptions
    opts = rest
  }

  if (cmd.length === 0) {
    throw new Error("spawn: command array cannot be empty")
  }

  const [command, ...args] = cmd

  // Map Bun-style stdio options to Node.js options
  const mapStdio = (value: "pipe" | "ignore" | "inherit" | number | undefined): "pipe" | "ignore" | "inherit" | number => {
    if (value === undefined) return "pipe"
    return value
  }

  const spawnOptions: SpawnOptions = {
    cwd: opts.cwd,
    env: opts.env as NodeJS.ProcessEnv,
    stdio: [mapStdio(opts.stdin), mapStdio(opts.stdout), mapStdio(opts.stderr)],
  }

  const childProcess: ChildProcess = nodeSpawn(command, args, spawnOptions)

  let resolvedExitCode: number | null = null

  const exitedPromise = new Promise<number>((resolve) => {
    childProcess.on("exit", (code) => {
      resolvedExitCode = code ?? 1
      resolve(resolvedExitCode)
    })
    childProcess.on("error", () => {
      resolvedExitCode = 1
      resolve(1)
    })
  })

  const subprocess: NodeSubprocess = {
    get pid() {
      return childProcess.pid
    },
    get stdin() {
      return createFileSink(childProcess.stdin) ?? noopFileSink
    },
    get stdout() {
      return noopReadableStream
      // return nodeStreamToWebReadable(childProcess.stdout) ?? noopReadableStream
    },
    get stderr() {
      return noopReadableStream
      // return nodeStreamToWebReadable(childProcess.stderr) ?? noopReadableStream
    },
    get exited() {
      return exitedPromise
    },
    get exitCode() {
      return resolvedExitCode
    },
    kill(signal?: number | NodeJS.Signals) {
      childProcess.kill(signal)
    },
    ref() {
      childProcess.ref()
    },
    unref() {
      childProcess.unref()
    },
  }

  return subprocess
}

/**
 * Find the path to an executable (similar to Bun.which)
 *
 * @param command - The command name to find
 * @param options - Options including custom PATH
 * @returns The full path to the executable, or null if not found
 */
export function which(command: string, options?: WhichOptions): string | null {
  const pathEnv = options?.PATH ?? process.env.PATH ?? ""
  const pathDirs = pathEnv.split(path.delimiter).filter(Boolean)

  // On Windows, also check common extensions
  const isWindows = process.platform === "win32"
  const extensions = isWindows ? (process.env.PATHEXT?.split(";") ?? [".COM", ".EXE", ".BAT", ".CMD"]) : [""]

  // If command is an absolute path, check it directly
  if (path.isAbsolute(command)) {
    for (const ext of extensions) {
      const fullPath = command + ext
      if (isExecutable(fullPath)) {
        return fullPath
      }
    }
    if (isExecutable(command)) {
      return command
    }
    return null
  }

  // Search in PATH directories
  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, command + ext)
      if (isExecutable(fullPath)) {
        return fullPath
      }
    }
    // Also try without extension on Windows (for commands like 'git')
    if (isWindows) {
      const fullPath = path.join(dir, command)
      if (isExecutable(fullPath)) {
        return fullPath
      }
    }
  }

  return null
}

/**
 * stdin object compatible with Bun.stdin
 */
export const stdin = {
  /**
   * Read all stdin as text
   */
  async text(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => data += chunk);
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    });
  }
}

/**
 * Check if a file exists and is executable
 */
function isExecutable(filepath: string): boolean {
  try {
    const stats = fs.statSync(filepath)
    if (!stats.isFile()) return false

    // On Windows, just check if file exists
    if (process.platform === "win32") {
      return true
    }

    // On Unix, check execute permission
    const mode = stats.mode
    const isOwner = stats.uid === process.getuid?.()
    const isGroup = stats.gid === process.getgid?.()

    if (isOwner && mode & 0o100) return true
    if (isGroup && mode & 0o010) return true
    if (mode & 0o001) return true

    // Also check if we have root access
    if (process.getuid?.() === 0) return true

    return false
  } catch {
    return false
  }
}
