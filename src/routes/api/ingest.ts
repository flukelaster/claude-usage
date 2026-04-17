import { createFileRoute } from '@tanstack/react-router'

/**
 * Remote .jsonl chunk ingest endpoint used by the agent uploader on
 * secondary machines. Payload is a JSON envelope so the agent can stay a
 * ~200-line Node script without binary/multipart plumbing. See
 * `scripts/agent.ts` for the client side.
 *
 * Auth: `Authorization: Bearer <key>` where the key is managed in
 * Settings → "Remote ingest". The key is generated on first read, so a
 * fresh DB is already armed.
 */
export const Route = createFileRoute('/api/ingest')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getDb } = await import('~/server/db/client')
        const { getOrCreateIngestApiKey } = await import('~/server/db/app-settings')
        const { projects } = await import('~/server/db/schema')
        const { processSessionChunk, parseBytes } = await import('~/server/claude-logs/processor')

        const expected = getOrCreateIngestApiKey()
        const auth = request.headers.get('authorization') ?? ''
        const presented = auth.startsWith('Bearer ') ? auth.slice(7) : ''
        if (!presented || !timingSafeEqual(presented, expected)) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }

        let payload: IngestPayload
        try {
          payload = (await request.json()) as IngestPayload
        } catch {
          return Response.json({ error: 'invalid_json' }, { status: 400 })
        }

        const validation = validatePayload(payload)
        if (validation) {
          return Response.json({ error: validation }, { status: 400 })
        }

        const db = getDb()

        db.insert(projects)
          .values({
            id: payload.projectId,
            cwd: payload.cwd ?? null,
            displayName: payload.displayName,
          })
          .onConflictDoUpdate({
            target: projects.id,
            set: {
              cwd: payload.cwd ?? null,
              displayName: payload.displayName,
            },
          })
          .run()

        let bytes: Buffer
        try {
          bytes = Buffer.from(payload.bytesBase64, 'base64')
        } catch {
          return Response.json({ error: 'invalid_base64' }, { status: 400 })
        }

        const result = processSessionChunk({
          db,
          projectId: payload.projectId,
          machineId: payload.machineId,
          filePath: payload.filePath,
          sessionId: payload.sessionId,
          fromOffset: payload.fromOffset,
          currentSize: payload.currentSize,
          entries: parseBytes(bytes, payload.fromOffset),
        })

        return Response.json({
          ok: true,
          messagesAdded: result.messagesAdded,
          lastOffset: result.lastOffset,
        })
      },
    },
  },
})

interface IngestPayload {
  machineId: string
  projectId: string
  cwd?: string | null
  displayName: string
  sessionId: string
  filePath: string
  fromOffset: number
  currentSize: number
  bytesBase64: string
}

function validatePayload(p: IngestPayload): string | null {
  const required: Array<keyof IngestPayload> = [
    'machineId',
    'projectId',
    'displayName',
    'sessionId',
    'filePath',
    'bytesBase64',
  ]
  for (const k of required) {
    if (typeof p[k] !== 'string' || !p[k]) return `missing_${String(k)}`
  }
  if (typeof p.fromOffset !== 'number' || p.fromOffset < 0) return 'invalid_fromOffset'
  if (typeof p.currentSize !== 'number' || p.currentSize < 0) return 'invalid_currentSize'
  // Keep each chunk under 20MB base64 (~15MB raw) — one session file is
  // usually under this, and it caps the damage of an oversized request.
  if (p.bytesBase64.length > 20_000_000) return 'chunk_too_large'
  return null
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
