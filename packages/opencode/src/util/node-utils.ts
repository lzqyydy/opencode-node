import { fileURLToPath as nodeFileURLToPath } from "url"

/**
 * Converts a file URL to a file path.
 * This is a Node.js compatible implementation to replace Bun's fileURLToPath.
 *
 * @param url - The file URL to convert (string or URL object)
 * @returns The corresponding file path
 */
export function fileURLToPath(url: string | URL): string {
  return nodeFileURLToPath(url)
}

/**
 * Converts a ReadableStream to text.
 * This is a Node.js compatible implementation to replace Bun's readableStreamToText.
 *
 * @param stream - The ReadableStream to convert
 * @returns A promise that resolves to the text content of the stream
 */
export async function readableStreamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  return new TextDecoder().decode(result)
}
