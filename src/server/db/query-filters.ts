import { eq, sql } from 'drizzle-orm'
import { messages } from './schema'
import { shouldIncludeSidechain } from './app-settings'

/**
 * Sidechain filter shared by analytics queries. When the user opts in to
 * including sidechain (subagent) messages, the filter becomes a no-op;
 * otherwise it excludes rows where `isSidechain = true`. The return type
 * is compatible with `and(...)` from drizzle-orm.
 */
export function buildSidechainFilter() {
  return shouldIncludeSidechain() ? sql`1=1` : eq(messages.isSidechain, false)
}
