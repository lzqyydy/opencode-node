import fs from "fs/promises"
import fsSync from "fs"
import path from "path"
import {fileURLToPath} from "url"

/**
 * File stats interface similar to Bun's file stats
 */
export interface NodeBunFileStats {
  size: number
  mtime: Date
  atime: Date
  birthtime: Date
  isFile(): boolean
  isDirectory(): boolean
}

/**
 * Writer interface for streaming writes
 */
export interface NodeBunFileWriter {
  write(data: string | Uint8Array | ArrayBuffer): number
  flush(): void
  end(): void
}

/**
 * A polyfill interface that mimics Bun's file object
 */
export interface NodeBunFile {
  /** The file path */
  readonly name: string
  /** MIME type of the file (based on extension) */
  readonly type: string
  /** File size in bytes (synchronous, returns 0 if file doesn't exist) */
  readonly size: number
  /** Read file content as JSON */
  json<T = any>(): Promise<T>
  /** Read file content as text */
  text(): Promise<string>
  /** Read file content as ArrayBuffer */
  arrayBuffer(): Promise<ArrayBuffer>
  /** Read file content as Uint8Array */
  bytes(): Promise<Uint8Array>
  /** Check if file exists */
  exists(): Promise<boolean>
  /** Get file stats */
  stat(): Promise<NodeBunFileStats>
  /** Write content to the file */
  write(content: string | ArrayBuffer | Uint8Array | Response): Promise<number>
  /** Get a writer for streaming writes */
  writer(): NodeBunFileWriter
}

/**
 * Common MIME type mappings based on file extension
 */
const MIME_TYPES: Record<string, string> = {
  // Text
  ".txt": "text/plain",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".csv": "text/csv",
  ".xml": "text/xml",
  ".md": "text/markdown",
  // JavaScript/TypeScript
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".cjs": "text/javascript",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".jsx": "text/javascript",
  // JSON
  ".json": "application/json",
  ".jsonl": "application/jsonl",
  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".fbs": "image/vnd.fastbidsheet",
  // Documents
  ".pdf": "application/pdf",
  // Archives
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  // Others
  ".wasm": "application/wasm",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
  ".toml": "application/toml",
  ".sh": "application/x-sh",
  ".py": "text/x-python",
  ".rb": "text/x-ruby",
  ".go": "text/x-go",
  ".rs": "text/x-rust",
  ".java": "text/x-java",
  ".c": "text/x-c",
  ".cpp": "text/x-c++",
  ".h": "text/x-c",
  ".hpp": "text/x-c++",
}

function getMimeType(filepath: string): string {
  const ext = path.extname(filepath).toLowerCase()
  return MIME_TYPES[ext] || "application/octet-stream"
}

/**
 * Create a file reference object (similar to Bun.file)
 * @param filepath - The path to the file (string or URL)
 * @returns A file object with methods to read content
 */
export function file(filepath: string | URL): NodeBunFile {
  // Convert URL to string path if needed
  const resolvedPath = filepath instanceof URL ? fileURLToPath(filepath) : filepath

  // Get file size synchronously (returns 0 if file doesn't exist)
  const getSize = (): number => {
    try {
      return fsSync.statSync(resolvedPath).size
    } catch {
      return 0
    }
  }

  return {
    name: resolvedPath,
    type: getMimeType(resolvedPath),
    get size(): number {
      return getSize()
    },

    async json<T = any>(): Promise<T> {
      const content = await fs.readFile(resolvedPath, "utf-8")
      return JSON.parse(content) as T
    },

    async text(): Promise<string> {
      return fs.readFile(resolvedPath, "utf-8")
    },

    async arrayBuffer(): Promise<ArrayBuffer> {
      const buffer = await fs.readFile(resolvedPath) as Buffer<ArrayBuffer>
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    },

    async bytes(): Promise<Uint8Array> {
      const buffer = await fs.readFile(resolvedPath)
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    },

    async exists(): Promise<boolean> {
      try {
        await fs.access(resolvedPath)
        return true
      } catch {
        return false
      }
    },

    async stat(): Promise<NodeBunFileStats> {
      const stats = await fs.stat(resolvedPath)
      return {
        size: stats.size,
        mtime: stats.mtime,
        atime: stats.atime,
        birthtime: stats.birthtime,
        isFile: () => stats.isFile(),
        isDirectory: () => stats.isDirectory(),
      }
    },

    async write(content: string | ArrayBuffer | Uint8Array | Response): Promise<number> {
      return write(resolvedPath, content)
    },

    writer(): NodeBunFileWriter {
      // Ensure directory exists
      const dir = path.dirname(resolvedPath)
      fsSync.mkdirSync(dir, {recursive: true})

      // Open file for appending
      const fd = fsSync.openSync(resolvedPath, "a")
      let buffer: Buffer[] = []

      return {
        write(data: string | Uint8Array | ArrayBuffer): number {
          let chunk: Buffer
          if (typeof data === "string") {
            chunk = Buffer.from(data)
          } else if (data instanceof ArrayBuffer) {
            chunk = Buffer.from(data)
          } else {
            chunk = Buffer.from(data)
          }
          buffer.push(chunk)
          return chunk.length
        },
        flush(): void {
          if (buffer.length > 0) {
            const combined = Buffer.concat(buffer)
            fsSync.writeSync(fd, combined)
            buffer = []
          }
        },
        end(): void {
          this.flush()
          fsSync.closeSync(fd)
        },
      }
    },
  }
}

/**
 * Write content to a file (similar to Bun.write)
 * @param destination - The file path or file object to write to
 * @param content - The content to write
 * @returns The number of bytes written
 */
export async function write(
  destination: string | NodeBunFile,
  content: string | ArrayBuffer | Uint8Array | Response,
): Promise<number> {
  const filepath = typeof destination === "string" ? destination : destination.name

  // Ensure directory exists
  const dir = path.dirname(filepath)
  await fs.mkdir(dir, {recursive: true}).catch(() => {})

  let data: string | Buffer
  if (typeof content === "string") {
    data = content
  } else if (content instanceof Response) {
    // Handle fetch Response
    const arrayBuffer = await content.arrayBuffer()
    data = Buffer.from(arrayBuffer)
  } else if (content instanceof ArrayBuffer) {
    data = Buffer.from(content)
  } else {
    data = Buffer.from(content)
  }

  await fs.writeFile(filepath, data)
  return typeof data === "string" ? Buffer.byteLength(data) : data.length
}
