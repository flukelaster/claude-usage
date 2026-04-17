/**
 * Remote agent: watches `~/.claude/projects/` and streams new .jsonl
 * bytes to a central dashboard via /api/ingest. One instance per
 * machine. State (per-file offsets) lives in a local JSON file so the
 * agent can resume where it left off across restarts.
 *
 * Run: pnpm agent
 * Config: env vars (see `.env.example`).
 */
import { homedir, hostname } from 'node:os'
import { join, basename, sep } from 'node:path'
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync, openSync, readSync, closeSync } from 'node:fs'
import chokidar from 'chokidar'

interface AgentConfig {
  serverUrl: string
  apiKey: string
  machineId: string
  claudeDir: string
  stateFile: string
  pollMs: number
}

interface FileState {
  offset: number
  size: number
  uploadedAt: string
}

interface AgentState {
  offsets: Record<string, FileState>
}

const CHUNK_BYTES = 10 * 1024 * 1024 // 10MB per HTTP request (server caps at 15MB raw)

function loadEnvFile(): void {
  // Minimal .env loader so users don't need `dotenv`. Looks in cwd and
  // in the agent's own directory. Values in process.env win.
  const candidates = [join(process.cwd(), '.env'), join(process.cwd(), 'agent.env')]
  for (const path of candidates) {
    if (!existsSync(path)) continue
    try {
      const content = readFileSync(path, 'utf8')
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq === -1) continue
        const key = trimmed.slice(0, eq).trim()
        let value = trimmed.slice(eq + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        if (!(key in process.env)) process.env[key] = value
      }
    } catch {}
  }
}

function loadConfig(): AgentConfig {
  loadEnvFile()
  const serverUrl = process.env.SERVER_URL?.replace(/\/$/, '')
  const apiKey = process.env.API_KEY
  if (!serverUrl) {
    console.error('[agent] SERVER_URL is required (e.g. http://home-pc.tailnet.ts.net:3000)')
    process.exit(1)
  }
  if (!apiKey) {
    console.error('[agent] API_KEY is required — grab it from the dashboard Settings page')
    process.exit(1)
  }
  return {
    serverUrl,
    apiKey,
    machineId: process.env.MACHINE_ID || hostname() || 'unknown',
    claudeDir: process.env.CLAUDE_DIR || join(homedir(), '.claude', 'projects'),
    stateFile: process.env.STATE_FILE || join(homedir(), '.claude-usage-agent-state.json'),
    pollMs: Number(process.env.POLL_MS) || 5000,
  }
}

function loadState(path: string): AgentState {
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as AgentState
    return parsed.offsets ? parsed : { offsets: {} }
  } catch {
    return { offsets: {} }
  }
}

function saveState(path: string, state: AgentState): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(state, null, 2))
}

function* scanSessionFiles(claudeDir: string): Generator<{ filePath: string; projectFolder: string }> {
  let projectEntries: string[]
  try {
    projectEntries = readdirSync(claudeDir)
  } catch {
    return
  }
  for (const entry of projectEntries) {
    const projectPath = join(claudeDir, entry)
    let stat
    try {
      stat = statSync(projectPath)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue
    let files: string[]
    try {
      files = readdirSync(projectPath)
    } catch {
      continue
    }
    for (const f of files) {
      if (f.endsWith('.jsonl')) {
        yield { filePath: join(projectPath, f), projectFolder: entry }
      }
    }
  }
}

/**
 * Best-effort cwd extraction from the first ~4KB of a session file.
 * Matches the server's own smart decoder so the project entry on the
 * server side lines up with what the owning machine's local dashboard
 * would have shown.
 */
function readCwdFromFile(filePath: string): string | null {
  try {
    const fd = openSync(filePath, 'r')
    const buf = Buffer.alloc(4096)
    const n = readSync(fd, buf, 0, 4096, 0)
    closeSync(fd)
    const content = buf.subarray(0, n).toString('utf8')
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      try {
        const entry = JSON.parse(line)
        if (typeof entry.cwd === 'string') return entry.cwd
      } catch {
        continue
      }
    }
  } catch {}
  return null
}

function displayNameFromCwd(cwd: string): string {
  const home = homedir()
  let rel = cwd
  if (cwd.startsWith(home)) rel = cwd.slice(home.length + 1)
  const segs = rel.split(/[\\/]/).filter(Boolean)
  if (segs.length <= 1) return segs[0] || cwd
  return segs.slice(-2).join('/')
}

async function uploadChunk(
  cfg: AgentConfig,
  params: {
    projectId: string
    cwd: string | null
    displayName: string
    sessionId: string
    filePath: string
    fromOffset: number
    currentSize: number
    bytes: Buffer
  },
): Promise<{ ok: true; lastOffset: number; messagesAdded: number } | { ok: false; error: string }> {
  const body = JSON.stringify({
    machineId: cfg.machineId,
    projectId: params.projectId,
    cwd: params.cwd,
    displayName: params.displayName,
    sessionId: params.sessionId,
    filePath: params.filePath,
    fromOffset: params.fromOffset,
    currentSize: params.currentSize,
    bytesBase64: params.bytes.toString('base64'),
  })

  try {
    const res = await fetch(`${cfg.serverUrl}/api/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    }
    const json = (await res.json()) as { ok: boolean; lastOffset: number; messagesAdded: number; error?: string }
    if (!json.ok) return { ok: false, error: json.error ?? 'unknown' }
    return { ok: true, lastOffset: json.lastOffset, messagesAdded: json.messagesAdded }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Upload everything new for one file, in ≤10MB chunks. Returns number
 * of messages ingested (sum across chunks) so the caller can log it.
 */
async function syncFile(
  cfg: AgentConfig,
  state: AgentState,
  file: { filePath: string; projectFolder: string },
): Promise<number> {
  let fileStat
  try {
    fileStat = statSync(file.filePath)
  } catch {
    return 0
  }
  const currentSize = fileStat.size
  const prev = state.offsets[file.filePath]
  let fromOffset = prev?.offset ?? 0
  // File truncated / rotated — start over.
  if (fromOffset > currentSize) fromOffset = 0
  if (fromOffset >= currentSize) return 0

  const cwd = readCwdFromFile(file.filePath)
  const displayName = cwd ? displayNameFromCwd(cwd) : file.projectFolder
  const sessionId = basename(file.filePath, '.jsonl')

  let totalAdded = 0
  let cursor = fromOffset

  while (cursor < currentSize) {
    const end = Math.min(cursor + CHUNK_BYTES, currentSize)
    const fd = openSync(file.filePath, 'r')
    const buf = Buffer.alloc(end - cursor)
    readSync(fd, buf, 0, buf.length, cursor)
    closeSync(fd)

    const result = await uploadChunk(cfg, {
      projectId: file.projectFolder,
      cwd,
      displayName,
      sessionId,
      filePath: file.filePath,
      fromOffset: cursor,
      currentSize,
      bytes: buf,
    })

    if (!result.ok) {
      console.error(`[agent] ${basename(file.filePath)}: upload failed — ${result.error}`)
      return totalAdded
    }

    // Trust the server's reported lastOffset (it stops at the final
    // complete newline), and persist immediately so a crash mid-stream
    // doesn't re-upload bytes we already ingested.
    cursor = result.lastOffset
    totalAdded += result.messagesAdded
    state.offsets[file.filePath] = {
      offset: cursor,
      size: currentSize,
      uploadedAt: new Date().toISOString(),
    }
    saveState(cfg.stateFile, state)

    // Server can land on an offset slightly behind `end` if the last
    // line in the chunk was truncated. If nothing advanced at all, bail
    // to avoid a busy loop.
    if (cursor <= fromOffset) break
    fromOffset = cursor
  }

  return totalAdded
}

async function fullScan(cfg: AgentConfig, state: AgentState): Promise<void> {
  let files = 0
  let messages = 0
  for (const f of scanSessionFiles(cfg.claudeDir)) {
    files++
    messages += await syncFile(cfg, state, f)
  }
  console.log(`[agent] scan complete — ${files} files checked, ${messages} new messages uploaded`)
}

async function main() {
  const cfg = loadConfig()
  const state = loadState(cfg.stateFile)

  console.log(`[agent] machine=${cfg.machineId} server=${cfg.serverUrl}`)
  console.log(`[agent] watching ${cfg.claudeDir}`)

  // Initial scan — upload anything new since last run.
  await fullScan(cfg, state)

  // Watch for new/modified .jsonl files. `chokidar` handles both
  // platforms' quirks (Windows polling, macOS fsevents).
  const watcher = chokidar.watch(`${cfg.claudeDir}${sep}**${sep}*.jsonl`, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  })

  const pending = new Set<string>()
  let flushing = false
  const flush = async () => {
    if (flushing || pending.size === 0) return
    flushing = true
    const batch = Array.from(pending)
    pending.clear()
    for (const filePath of batch) {
      const parts = filePath.split(sep)
      const idx = parts.lastIndexOf('projects')
      const projectFolder = idx >= 0 && idx + 1 < parts.length ? parts[idx + 1] : parts[parts.length - 2]
      await syncFile(cfg, state, { filePath, projectFolder })
    }
    flushing = false
    if (pending.size > 0) setTimeout(flush, 50)
  }

  watcher.on('add', (p) => { pending.add(p); flush() })
  watcher.on('change', (p) => { pending.add(p); flush() })
  watcher.on('error', (err) => console.error('[agent] watch error:', err))

  process.on('SIGINT', () => {
    console.log('\n[agent] shutting down')
    watcher.close().finally(() => process.exit(0))
  })
}

main().catch((err) => {
  console.error('[agent] fatal:', err)
  process.exit(1)
})
