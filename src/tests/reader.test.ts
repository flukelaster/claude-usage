import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSessionFile } from '~/server/claude-logs/reader'

const tmpDir = mkdtempSync(join(tmpdir(), 'reader-test-'))

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

async function collect(iter: AsyncGenerator<{ data: unknown; offset: number }>) {
  const out: { data: unknown; offset: number }[] = []
  for await (const entry of iter) out.push(entry)
  return out
}

describe('readSessionFile', () => {
  it('parses LF-terminated JSONL and tracks byte offset exactly', async () => {
    const file = join(tmpDir, 'lf.jsonl')
    const lines = [
      JSON.stringify({ type: 'assistant', i: 0 }),
      JSON.stringify({ type: 'user', i: 1 }),
      JSON.stringify({ type: 'assistant', i: 2 }),
    ]
    writeFileSync(file, lines.join('\n') + '\n', 'utf8')

    const parsed = await collect(readSessionFile(file, 0))
    expect(parsed).toHaveLength(3)
    expect((parsed[0].data as { i: number }).i).toBe(0)
    // The offset after the last entry should equal the file length.
    const expectedLen = Buffer.byteLength(lines.join('\n') + '\n', 'utf8')
    expect(parsed[2].offset).toBe(expectedLen)
  })

  it('handles CRLF line endings without drifting offset', async () => {
    const file = join(tmpDir, 'crlf.jsonl')
    const lines = [
      JSON.stringify({ type: 'assistant', i: 0 }),
      JSON.stringify({ type: 'assistant', i: 1 }),
    ]
    writeFileSync(file, lines.join('\r\n') + '\r\n', 'utf8')

    const parsed = await collect(readSessionFile(file, 0))
    expect(parsed).toHaveLength(2)
    const expectedLen = Buffer.byteLength(lines.join('\r\n') + '\r\n', 'utf8')
    expect(parsed[1].offset).toBe(expectedLen)
  })

  it('resumes from a byte offset mid-file', async () => {
    const file = join(tmpDir, 'resume.jsonl')
    const a = JSON.stringify({ type: 'assistant', i: 0 })
    const b = JSON.stringify({ type: 'assistant', i: 1 })
    const c = JSON.stringify({ type: 'assistant', i: 2 })
    writeFileSync(file, `${a}\n${b}\n${c}\n`, 'utf8')

    const skip = Buffer.byteLength(`${a}\n`, 'utf8')
    const parsed = await collect(readSessionFile(file, skip))
    expect(parsed.map((p) => (p.data as { i: number }).i)).toEqual([1, 2])
  })

  it('skips malformed JSON lines silently', async () => {
    const file = join(tmpDir, 'bad.jsonl')
    writeFileSync(file, '{"ok":1}\nnot-json\n{"ok":2}\n', 'utf8')
    const parsed = await collect(readSessionFile(file, 0))
    expect(parsed.map((p) => (p.data as { ok: number }).ok)).toEqual([1, 2])
  })

  it('emits the final line when the file has no trailing newline', async () => {
    const file = join(tmpDir, 'no-trailing.jsonl')
    writeFileSync(file, '{"i":0}\n{"i":1}', 'utf8')
    const parsed = await collect(readSessionFile(file, 0))
    expect(parsed.map((p) => (p.data as { i: number }).i)).toEqual([0, 1])
  })
})
