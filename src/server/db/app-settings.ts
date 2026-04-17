import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { getDb } from './client'
import { syncState } from './schema'

/**
 * Lightweight key-value settings store. Reuses the `sync_state` table
 * (which is already a KV store) with a "setting:" prefix so settings
 * don't collide with sync bookkeeping keys like `lastSyncAt`.
 */

const PREFIX = 'setting:'

export type SettingKey =
  | 'includeSidechain'
  | 'monthlyBudgetUsd'
  | 'billingCycleStartDay'
  | 'subscriptionPlan'
  | 'customFiveHourInput'
  | 'customFiveHourOutput'
  | 'customWeeklyInput'
  | 'customWeeklyOutput'
  | 'ingestApiKey'

function prefixed(key: SettingKey): string {
  return `${PREFIX}${key}`
}

export function readSettingRaw(key: SettingKey): string | null {
  const db = getDb()
  const row = db
    .select({ value: syncState.value })
    .from(syncState)
    .where(eq(syncState.key, prefixed(key)))
    .get()
  return row?.value ?? null
}

export function writeSettingRaw(key: SettingKey, value: string | null): void {
  const db = getDb()
  const now = new Date().toISOString()
  if (value === null) {
    db.delete(syncState).where(eq(syncState.key, prefixed(key))).run()
    return
  }
  db.insert(syncState)
    .values({ key: prefixed(key), value, updatedAt: now })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { value, updatedAt: now },
    })
    .run()
}

export function readBooleanSetting(key: SettingKey, fallback: boolean): boolean {
  const raw = readSettingRaw(key)
  if (raw === null) return fallback
  return raw === '1' || raw === 'true'
}

export function readNumberSetting(key: SettingKey, fallback: number): number {
  const raw = readSettingRaw(key)
  if (raw === null) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function writeBooleanSetting(key: SettingKey, value: boolean): void {
  writeSettingRaw(key, value ? '1' : '0')
}

export function writeNumberSetting(key: SettingKey, value: number): void {
  writeSettingRaw(key, String(value))
}

/**
 * Returns true when sidechain (subagent) messages should be included in
 * analytics. Defaults to false, matching historical behavior.
 */
export function shouldIncludeSidechain(): boolean {
  return readBooleanSetting('includeSidechain', false)
}

/**
 * Bearer token that `/api/ingest` requires. Auto-generated on first read
 * if none has been set, so a fresh install is usable without a setup
 * step. Regenerating in the UI invalidates all agents until their
 * `.env` files are updated.
 */
export function getOrCreateIngestApiKey(): string {
  let key = readSettingRaw('ingestApiKey')
  if (key && key.length >= 32) return key
  key = generateApiKey()
  writeSettingRaw('ingestApiKey', key)
  return key
}

export function setIngestApiKey(key: string): void {
  writeSettingRaw('ingestApiKey', key)
}

function generateApiKey(): string {
  // 32 bytes of randomness, base64url-encoded — same rough strength as
  // a typical platform PAT.
  return randomBytes(32).toString('base64url')
}
