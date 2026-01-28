import fs from "fs/promises"
import path from "path"
import { createRequire } from "module"
import { minimatch } from "minimatch"
import crypto from "crypto"

/**
 * Sleep for a specified number of milliseconds (similar to Bun.sleep)
 * @param ms - The number of milliseconds to sleep
 * @returns A promise that resolves after the specified time
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Resolve a module specifier to its absolute path (similar to Bun.resolve)
 * @param specifier - The module specifier to resolve
 * @param parent - The parent module path to resolve from
 * @returns The resolved absolute path
 */
export async function resolve(specifier: string, parent?: string): Promise<string> {
  try {
    // Use createRequire for CommonJS-style resolution
    const require = createRequire(parent ? (parent.startsWith("file://") ? parent : `file://${parent}`) : import.meta.url)
    return require.resolve(specifier)
  } catch (err) {
    // If standard resolution fails, try as a relative path
    if (parent) {
      const parentDir = path.dirname(parent.replace(/^file:\/\//, ""))
      const resolved = path.resolve(parentDir, specifier)
      try {
        await fs.access(resolved)
        return resolved
      } catch {
        // Continue to throw original error
      }
    }
    throw err
  }
}

/**
 * Calculate the display width of a string (similar to Bun.stringWidth)
 * Handles wide characters (CJK), emoji, and control characters
 * @param str - The string to measure
 * @returns The display width of the string
 */
/**
 * Hash utilities similar to Bun.hash
 */
export const hash = {
  /**
   * Compute xxHash32-compatible hash (using MD5 truncated to 32 bits for compatibility)
   * This provides a fast, stable hash suitable for cache keys
   * @param data - The data to hash (string, Buffer, or ArrayBuffer)
   * @returns A 32-bit unsigned integer hash value
   */
  xxHash32(data: string | Buffer | ArrayBuffer | Uint8Array): number {
    let buffer: Buffer
    if (typeof data === "string") {
      buffer = Buffer.from(data)
    } else if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data)
    } else if (data instanceof Uint8Array) {
      buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    } else {
      buffer = data
    }

    // Use MD5 and take first 4 bytes as a 32-bit hash
    // This provides similar distribution characteristics for cache keys
    const md5 = crypto.createHash("md5").update(buffer).digest()
    return md5.readUInt32LE(0)
  },

  /**
   * Compute a general hash using the specified algorithm
   * @param data - The data to hash
   * @param algorithm - The hash algorithm (default: "sha256")
   * @returns The hash as a hex string
   */
  digest(data: string | Buffer | ArrayBuffer | Uint8Array, algorithm: string = "sha256"): string {
    let buffer: Buffer
    if (typeof data === "string") {
      buffer = Buffer.from(data)
    } else if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data)
    } else if (data instanceof Uint8Array) {
      buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    } else {
      buffer = data
    }

    return crypto.createHash(algorithm).update(buffer).digest("hex")
  },
}

export function stringWidth(str: string): number {
  if (!str || typeof str !== "string") {
    return 0
  }

  let width = 0

  // Remove ANSI escape codes
  const cleanStr = str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ""
  )

  for (const char of cleanStr) {
    const code = char.codePointAt(0)
    if (code === undefined) continue

    // Control characters and null
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      continue
    }

    // Combining characters (zero width)
    if (
      (code >= 0x0300 && code <= 0x036f) || // Combining Diacritical Marks
      (code >= 0x1ab0 && code <= 0x1aff) || // Combining Diacritical Marks Extended
      (code >= 0x1dc0 && code <= 0x1dff) || // Combining Diacritical Marks Supplement
      (code >= 0x20d0 && code <= 0x20ff) || // Combining Diacritical Marks for Symbols
      (code >= 0xfe20 && code <= 0xfe2f)    // Combining Half Marks
    ) {
      continue
    }

    // Wide characters (CJK, etc.)
    if (
      (code >= 0x1100 && code <= 0x115f) ||  // Hangul Jamo
      (code >= 0x2e80 && code <= 0x9fff) ||  // CJK
      (code >= 0xac00 && code <= 0xd7a3) ||  // Hangul Syllables
      (code >= 0xf900 && code <= 0xfaff) ||  // CJK Compatibility Ideographs
      (code >= 0xfe10 && code <= 0xfe1f) ||  // Vertical forms
      (code >= 0xfe30 && code <= 0xfe6f) ||  // CJK Compatibility Forms
      (code >= 0xff00 && code <= 0xff60) ||  // Fullwidth Forms
      (code >= 0xffe0 && code <= 0xffe6) ||  // Fullwidth Forms
      (code >= 0x20000 && code <= 0x2fffd) || // CJK Extension B
      (code >= 0x30000 && code <= 0x3fffd)   // CJK Extension C
    ) {
      width += 2
      continue
    }

    // Emoji (most are wide)
    if (
      (code >= 0x1f300 && code <= 0x1f9ff) || // Misc Symbols and Pictographs, Emoticons, etc.
      (code >= 0x2600 && code <= 0x26ff) ||   // Misc symbols
      (code >= 0x2700 && code <= 0x27bf)      // Dingbats
    ) {
      width += 2
      continue
    }

    // Default: single width
    width += 1
  }

  return width
}

/**
 * Options for Glob.scan()
 */
export interface GlobScanOptions {
  cwd?: string
  onlyFiles?: boolean
  absolute?: boolean
  dot?: boolean
  followSymlinks?: boolean
}

/**
 * A Glob class similar to Bun.Glob
 */
export class Glob {
  private pattern: string

  constructor(pattern: string) {
    this.pattern = pattern
  }

  /**
   * Check if a string matches this glob pattern
   * @param str - The string to test
   * @returns True if the string matches the pattern
   */
  match(str: string): boolean {
    return minimatch(str, this.pattern, { dot: true })
  }

  /**
   * Scan a directory for files matching this glob pattern
   * @param options - Scan options
   * @returns An async iterable of matching file paths
   */
  async *scan(options?: GlobScanOptions): AsyncGenerator<string, void, unknown> {
    const cwd = options?.cwd ?? process.cwd()
    const onlyFiles = options?.onlyFiles ?? true
    const absolute = options?.absolute ?? false
    const dot = options?.dot ?? true

    // Helper function to recursively scan directories
    async function* scanDir(dir: string, baseDir: string, pattern: string): AsyncGenerator<string, void, unknown> {
      let entries: import("fs").Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        const name = entry.name

        // Skip hidden files if dot is false
        if (!dot && name.startsWith(".")) {
          continue
        }

        const fullPath = path.join(dir, name)
        const relativePath = path.relative(baseDir, fullPath)

        if (entry.isDirectory()) {
          // Always recurse into directories for ** patterns
          yield* scanDir(fullPath, baseDir, pattern)

          // Also yield directory if not onlyFiles and it matches
          if (!onlyFiles && minimatch(relativePath, pattern, { dot })) {
            yield absolute ? fullPath : relativePath
          }
        } else if (entry.isFile()) {
          if (minimatch(relativePath, pattern, { dot })) {
            yield absolute ? fullPath : relativePath
          }
        }
      }
    }

    yield* scanDir(cwd, cwd, this.pattern)
  }
}
