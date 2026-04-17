import { homedir, platform } from 'node:os'
import { join, basename, sep } from 'node:path'
import { readdirSync, statSync, readFileSync } from 'node:fs'

/**
 * Resolve the Claude Code projects directory
 */
export function getClaudeProjectsDir(): string {
  return join(homedir(), '.claude', 'projects')
}

/**
 * Extract the real cwd from any .jsonl file in the project (including subagent dirs).
 */
export function extractCwdFromSession(projectPath: string): string | null {
  // First try root-level .jsonl files
  const files = getSessionFiles(projectPath)

  // Also try .jsonl in subdirectories (subagent sessions)
  try {
    const entries = readdirSync(projectPath)
    for (const entry of entries) {
      const subPath = join(projectPath, entry)
      try {
        if (statSync(subPath).isDirectory()) {
          const subFiles = getSessionFiles(subPath)
          files.push(...subFiles)
          // Also check subagents/ subdirectory
          const subagentsPath = join(subPath, 'subagents')
          try {
            if (statSync(subagentsPath).isDirectory()) {
              files.push(...getSessionFiles(subagentsPath))
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}

  for (const file of files) {
    try {
      // Read only first 4KB to find cwd quickly
      const fd = require('node:fs').openSync(file, 'r')
      const buf = Buffer.alloc(4096)
      const bytesRead = require('node:fs').readSync(fd, buf, 0, 4096, 0)
      require('node:fs').closeSync(fd)
      const content = buf.slice(0, bytesRead).toString('utf8')
      const lines = content.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line)
          if (entry.cwd && typeof entry.cwd === 'string') {
            return entry.cwd
          }
        } catch {
          continue
        }
      }
    } catch {
      continue
    }
  }

  // Fallback: try to smart-decode the folder name by checking filesystem
  return smartDecodeFolderName(basename(projectPath))
}

/**
 * Smart decode folder name by checking which path actually exists on the filesystem.
 * e.g. "-Users-flukelaster-Desktop-Front-End-POC" -> find the real path
 *
 * On Windows, encoded names typically start with `-C-Users-...` where the
 * first single-letter segment is the drive letter. Any other first segment
 * (e.g. a project prefix) is not a drive and must stay part of the path.
 */
function smartDecodeFolderName(folderName: string): string | null {
  if (!folderName.startsWith('-')) return null

  const isWindows = platform() === 'win32'
  let remaining = folderName.slice(1) // strip leading "-"
  let currentPath: string

  if (isWindows) {
    const driveMatch = remaining.match(/^([A-Za-z])(?:-(.*))?$/)
    if (driveMatch) {
      currentPath = `${driveMatch[1].toUpperCase()}:\\`
      remaining = driveMatch[2] ?? ''
    } else {
      // No detectable drive letter — fall back to current drive root.
      currentPath = '\\'
    }
  } else {
    currentPath = '/'
  }

  const parts = remaining ? remaining.split('-') : []
  let i = 0

  while (i < parts.length) {
    // Try progressively longer segment names (to handle hyphens in folder names)
    let found = false
    for (let j = parts.length; j > i; j--) {
      const segment = parts.slice(i, j).join('-')
      const candidate = join(currentPath, segment)
      try {
        statSync(candidate)
        currentPath = candidate
        i = j
        found = true
        break
      } catch {}
    }
    if (!found) {
      // Can't resolve further, just join remaining with -
      currentPath = join(currentPath, parts.slice(i).join('-'))
      break
    }
  }

  return currentPath
}

/**
 * Extract display name from a real cwd path.
 * Uses the last meaningful segment(s) of the path.
 */
export function getDisplayName(cwd: string): string {
  const home = homedir()
  // Remove home prefix for cleaner display
  let relative = cwd
  if (cwd.startsWith(home)) {
    relative = cwd.slice(home.length + 1) // remove /Users/xxx/
  }
  // Use last 1-2 segments for a meaningful name
  const segments = relative.split(/[/\\]/).filter(Boolean)
  if (segments.length <= 1) return segments[0] || cwd
  // Return last 2 segments joined with /
  return segments.slice(-2).join('/')
}

/**
 * Scan all project folders under ~/.claude/projects/
 * Returns: { id, cwd, displayName, path }[]
 */
export function scanProjectFolders(): Array<{
  id: string
  cwd: string | null
  displayName: string
  path: string
}> {
  const projectsDir = getClaudeProjectsDir()

  let entries: string[]
  try {
    entries = readdirSync(projectsDir)
  } catch {
    return []
  }

  return entries
    .filter((name) => {
      try {
        return statSync(join(projectsDir, name)).isDirectory()
      } catch {
        return false
      }
    })
    .map((name) => {
      const fullPath = join(projectsDir, name)
      const cwd = extractCwdFromSession(fullPath)
      return {
        id: name,
        cwd,
        displayName: cwd ? getDisplayName(cwd) : name,
        path: fullPath,
      }
    })
}

/**
 * Find all .jsonl session files in a project folder (non-recursive, skip subdirs)
 */
export function getSessionFiles(projectPath: string): string[] {
  try {
    const entries = readdirSync(projectPath)
    return entries
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => join(projectPath, name))
  } catch {
    return []
  }
}

/**
 * Extract session ID from file path.
 * Files are named like: <uuid>.jsonl
 */
export function extractSessionId(filePath: string): string {
  return basename(filePath, '.jsonl')
}
