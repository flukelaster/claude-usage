import { createReadStream } from 'node:fs'

/**
 * Stream-read a .jsonl file from a given byte offset.
 * Yields parsed JSON objects with their *exact* byte offset in the file,
 * so incremental sync can resume from the correct position regardless of
 * whether the file uses LF or CRLF line endings.
 */
export async function* readSessionFile(
  filePath: string,
  fromOffset = 0,
): AsyncGenerator<{ data: unknown; offset: number }> {
  const stream = createReadStream(filePath, { start: fromOffset })

  let offset = fromOffset
  let buffer: Buffer = Buffer.alloc(0)

  for await (const chunk of stream as AsyncIterable<Buffer>) {
    buffer = (buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk])) as Buffer

    let newlineIdx: number
    while ((newlineIdx = buffer.indexOf(0x0a)) !== -1) {
      // Extract line bytes excluding the trailing \n
      let lineEnd = newlineIdx
      // Strip trailing \r if present (CRLF)
      if (lineEnd > 0 && buffer[lineEnd - 1] === 0x0d) lineEnd -= 1

      const lineBytes = buffer.subarray(0, lineEnd)
      const consumed = newlineIdx + 1 // include the \n
      buffer = buffer.subarray(consumed)
      offset += consumed

      const line = lineBytes.toString('utf8')
      if (!line.trim()) continue
      try {
        yield { data: JSON.parse(line), offset }
      } catch {
        // Skip malformed JSON lines silently
      }
    }
  }

  // Handle final line without trailing newline
  if (buffer.length > 0) {
    const line = buffer.toString('utf8').replace(/\r$/, '')
    offset += buffer.length
    if (line.trim()) {
      try {
        yield { data: JSON.parse(line), offset }
      } catch {
        // ignore
      }
    }
  }
}
