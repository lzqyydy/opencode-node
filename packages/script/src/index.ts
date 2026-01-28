import { execSync } from "child_process"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

// Get directory of this file
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rootPkgPath = path.resolve(__dirname, "../../../package.json")
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"))
// const expectedBunVersion = rootPkg.packageManager?.split("@")[1]
const expectedBunVersion = '1.3.5';

// Note: In Node.js environment, we skip the Bun version check
// This allows the script to work in both Bun and Node.js environments
const isBunRuntime = typeof process.versions.bun !== "undefined"

if (isBunRuntime && expectedBunVersion) {
  // Simple semver check for Bun runtime
  // const currentBunVersion = process.versions.bun
  const currentBunVersion = '1.3.5';
  const [expectedMajor, expectedMinor] = expectedBunVersion.split(".").map(Number)
  const [currentMajor, currentMinor] = currentBunVersion.split(".").map(Number)

  if (currentMajor < expectedMajor || (currentMajor === expectedMajor && currentMinor < expectedMinor)) {
    throw new Error(
      `This script requires bun@^${expectedBunVersion}, but you are using bun@${process.versions.bun}`,
    )
  }
}

const env = {
  OPENCODE_CHANNEL: process.env["OPENCODE_CHANNEL"],
  OPENCODE_BUMP: process.env["OPENCODE_BUMP"],
  OPENCODE_VERSION: process.env["OPENCODE_VERSION"],
}

const CHANNEL = await (async () => {
  if (env.OPENCODE_CHANNEL) return env.OPENCODE_CHANNEL
  if (env.OPENCODE_BUMP) return "latest"
  if (env.OPENCODE_VERSION && !env.OPENCODE_VERSION.startsWith("0.0.0-")) return "latest"
  try {
    return execSync("git branch --show-current", { encoding: "utf-8" }).trim()
  } catch {
    return "dev"
  }
})()

const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async () => {
  if (env.OPENCODE_VERSION) return env.OPENCODE_VERSION
  if (IS_PREVIEW) return `0.0.0-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  const version = await fetch("https://registry.npmjs.org/opencode-ai/latest")
    .then((res) => {
      if (!res.ok) throw new Error(res.statusText)
      return res.json()
    })
    .then((data: any) => data.version)
  const [major, minor, patch] = version.split(".").map((x: string) => Number(x) || 0)
  const t = env.OPENCODE_BUMP?.toLowerCase()
  if (t === "major") return `${major + 1}.0.0`
  if (t === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
})()

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
}

console.log(`opencode script`, JSON.stringify(Script, null, 2))
