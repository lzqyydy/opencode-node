#!/usr/bin/env node

import * as esbuild from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"
import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"
import { execSync } from "child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

// Read package.json
const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"))

// Get version info - simplified version detection for Node.js
const getVersionInfo = async () => {
  const env = {
    OPENCODE_CHANNEL: process.env["OPENCODE_CHANNEL"],
    OPENCODE_BUMP: process.env["OPENCODE_BUMP"],
    OPENCODE_VERSION: process.env["OPENCODE_VERSION"],
  }

  let channel: string
  if (env.OPENCODE_CHANNEL) {
    channel = env.OPENCODE_CHANNEL
  } else if (env.OPENCODE_BUMP) {
    channel = "latest"
  } else if (env.OPENCODE_VERSION && !env.OPENCODE_VERSION.startsWith("0.0.0-")) {
    channel = "latest"
  } else {
    try {
      channel = execSync("git branch --show-current", { encoding: "utf-8" }).trim()
    } catch {
      channel = "dev"
    }
  }

  const isPreview = channel !== "latest"

  let version: string
  if (env.OPENCODE_VERSION) {
    version = env.OPENCODE_VERSION
  } else if (isPreview) {
    version = `0.0.0-${channel}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  } else {
    try {
      const res = await fetch("https://registry.npmjs.org/opencode-ai/latest")
      if (!res.ok) throw new Error(res.statusText)
      const data = (await res.json()) as { version: string }
      const [major, minor, patch] = data.version.split(".").map((x: string) => Number(x) || 0)
      const t = env.OPENCODE_BUMP?.toLowerCase()
      if (t === "major") {
        version = `${major + 1}.0.0`
      } else if (t === "minor") {
        version = `${major}.${minor + 1}.0`
      } else {
        version = `${major}.${minor}.${patch + 1}`
      }
    } catch {
      version = pkg.version || "0.0.0"
    }
  }

  return { channel, version, isPreview }
}

const Script = await getVersionInfo()
console.log(`opencode script`, JSON.stringify(Script, null, 2))

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")

const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
  platform: esbuild.Platform
}[] = [
  {
    os: "darwin",
    arch: "arm64",
    platform: "node",
  },
  {
    os: "win32",
    arch: "x64",
    platform: "node",
  },
  {
    os: "linux",
    arch: "x64",
    platform: "node",
  },
]

const targets = singleFlag
  ? allTargets.filter((item) => {
      if (item.os !== process.platform || item.arch !== process.arch) {
        return false
      }

      // When building for the current platform, prefer a single native binary by default.
      // Baseline binaries require additional artifacts and can be flaky to download.
      if (item.avx2 === false) {
        return baselineFlag
      }

      // also skip abi-specific builds for the same reason
      if (item.abi !== undefined) {
        return false
      }

      return true
    })
  : allTargets

// Clean dist directory
fs.rmSync(path.join(dir, "dist"), { recursive: true, force: true })

const binaries: Record<string, string> = {}

// Install platform-specific dependencies if needed
if (!skipInstall) {
  console.log("Installing platform-specific dependencies...")
  try {
    execSync(`npm install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`, {
      stdio: "inherit",
      cwd: dir,
    })
    execSync(`npm install --os="*" --cpu="*" @parcel/watcher@${pkg.dependencies["@parcel/watcher"]}`, {
      stdio: "inherit",
      cwd: dir,
    })
  } catch (e) {
    console.warn("Warning: Failed to install some platform-specific dependencies:", e)
  }
}

// Helper to resolve path with extensions
const resolveWithExtensions = (basePath: string): string | null => {
  const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"]

  // First check if it's a direct file
  for (const ext of extensions) {
    const fullPath = basePath + ext
    if (fs.existsSync(fullPath)) {
      return fullPath
    }
  }

  // Check if basePath itself exists (might be a file without extension in the import)
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return basePath
  }

  return null
}

// Path alias plugin for esbuild to handle @/ imports
const pathAliasPlugin: esbuild.Plugin = {
  name: "path-alias",
  setup(build) {
    // Handle @/ alias -> src/
    build.onResolve({ filter: /^@\// }, (args) => {
      const relativePath = args.path.slice(2)
      const basePath = path.resolve(dir, "src", relativePath)
      const resolved = resolveWithExtensions(basePath)
      if (resolved) {
        return { path: resolved }
      }
      return { path: basePath }
    })

    // Handle @tui/ alias -> src/cli/cmd/tui/
    build.onResolve({ filter: /^@tui\// }, (args) => {
      const relativePath = args.path.slice(5)
      const basePath = path.resolve(dir, "src/cli/cmd/tui", relativePath)
      const resolved = resolveWithExtensions(basePath)
      if (resolved) {
        return { path: resolved }
      }
      return { path: basePath }
    })
  },
}

// Plugin to handle Bun-specific imports and replace with Node.js equivalents
const bunCompatPlugin: esbuild.Plugin = {
  name: "bun-compat",
  setup(build) {
    // Replace bun-pty with node-pty
    build.onResolve({ filter: /^bun-pty$/ }, () => {
      return { path: "node-pty", external: true }
    })

    // Handle Bun built-in modules
    build.onResolve({ filter: /^bun:/ }, (args) => {
      return { path: args.path, external: true }
    })

    // Handle import attributes (type: "file", type: "macro") - mark as external
    build.onResolve({ filter: /\.scm$|\.wasm$/ }, (args) => {
      return { path: args.path, external: true }
    })
  },
}

// External packages that should not be bundled (native modules, etc.)
const externalPackages = [
  "@parcel/watcher",
  "node-pty",
  "bun-pty",
  "tree-sitter",
  "tree-sitter-bash",
  "web-tree-sitter",
  "fsevents",
  // Bun-specific modules
  "bun:ffi",
  "bun:sqlite",
  "bun:jsc",
  "bun:test",
  // @opentui/core has Bun-specific dependencies
  "@opentui/core",
  "@opentui/solid",
]

for (const item of targets) {
  const name = [
    pkg.name,
    // changing to win32 flags npm for some reason
    item.os === "win32" ? "windows" : item.os,
    item.arch,
    item.avx2 === false ? "baseline" : undefined,
    item.abi === undefined ? undefined : item.abi,
  ]
    .filter(Boolean)
    .join("-")

  console.log(`building ${name}`)

  const distDir = path.join(dir, "dist", name)
  const binDir = path.join(distDir, "bin")
  fs.mkdirSync(binDir, { recursive: true })

  // Get worker paths
  const parserWorkerPath = path.resolve(dir, "./node_modules/@opentui/core/parser.worker.js")
  const workerPath = "./src/cli/cmd/tui/worker.ts"

  // Worker relative path for runtime
  const workerRelativePath = path.relative(dir, parserWorkerPath).replaceAll("\\", "/")

  try {
    // Build main bundle
    await esbuild.build({
      entryPoints: ["./src/index.ts"],
      bundle: true,
      platform: item.platform,
      target: "node22",
      format: "esm",
      outfile: path.join(binDir, "opencode.mjs"),
      sourcemap: "external",
      minify: false,
      keepNames: true,
      conditions: ["browser"],
      plugins: [
        pathAliasPlugin,
        bunCompatPlugin,
        solidPlugin({
          solid: {
            generate: "dom",
            hydratable: false,
          },
        }),
      ],
      external: externalPackages,
      define: {
        OPENCODE_VERSION: JSON.stringify(Script.version),
        OPENCODE_CHANNEL: JSON.stringify(Script.channel),
        OPENCODE_LIBC: item.os === "linux" ? JSON.stringify(item.abi ?? "glibc") : '""',
        OTUI_TREE_SITTER_WORKER_PATH: JSON.stringify(workerRelativePath),
        OPENCODE_WORKER_PATH: JSON.stringify(workerPath),
      },
      banner: {
        js: `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
`.trim(),
      },
      logLevel: "info",
    })

    // Create launcher script
    const launcherScript =
      item.os === "win32"
        ? `@echo off\nnode "%~dp0opencode.mjs" %*\n`
        : `#!/usr/bin/env node\nimport './opencode.mjs'\n`

    const launcherExt = item.os === "win32" ? ".cmd" : ""
    fs.writeFileSync(path.join(binDir, `opencode${launcherExt}`), launcherScript)

    if (item.os !== "win32") {
      // Make launcher executable on Unix
      fs.chmodSync(path.join(binDir, `opencode${launcherExt}`), 0o755)
    }

    // Copy worker files if they exist
    if (fs.existsSync(parserWorkerPath)) {
      fs.copyFileSync(parserWorkerPath, path.join(binDir, "parser.worker.js"))
    }

    // Write package.json for the distribution
    fs.writeFileSync(
      path.join(distDir, "package.json"),
      JSON.stringify(
        {
          name,
          version: Script.version,
          type: "module",
          os: [item.os],
          cpu: [item.arch],
          bin: {
            opencode: item.os === "win32" ? "./bin/opencode.cmd" : "./bin/opencode",
          },
        },
        null,
        2,
      ),
    )

    binaries[name] = Script.version
    console.log(`✓ Built ${name}`)
  } catch (error) {
    console.error(`✗ Failed to build ${name}:`, error)
    throw error
  }
}

console.log("\nBuild complete!")
console.log("Binaries:", binaries)

export { binaries }
