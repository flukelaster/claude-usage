import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),                    // encoded folder name e.g. "-Users-flukelaster-Desktop-ProjectName"
  cwd: text('cwd'),                               // decoded path
  displayName: text('display_name').notNull(),     // last path segment
  firstSeenAt: text('first_seen_at'),              // ISO string
  lastActiveAt: text('last_active_at'),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),                     // session UUID
  projectId: text('project_id').notNull().references(() => projects.id),
  machineId: text('machine_id').default('local'),  // origin host, 'local' = server's own files
  filePath: text('file_path').notNull(),
  title: text('title'),                            // from ai-title or custom-title
  slug: text('slug'),                              // human-readable slug
  entrypoint: text('entrypoint'),                  // 'cli' or 'claude-vscode'
  startedAt: text('started_at'),                   // ISO string
  endedAt: text('ended_at'),
  messageCount: integer('message_count').default(0),
  totalInputTokens: integer('total_input_tokens').default(0),
  totalOutputTokens: integer('total_output_tokens').default(0),
  totalCacheCreationTokens: integer('total_cache_creation_tokens').default(0),
  totalCacheReadTokens: integer('total_cache_read_tokens').default(0),
  totalCost: real('total_cost').default(0),
  lastParsedOffset: integer('last_parsed_offset').default(0),
  fileSize: integer('file_size').default(0),
}, (table) => [
  index('idx_sessions_project').on(table.projectId),
  index('idx_sessions_started').on(table.startedAt),
  index('idx_sessions_machine').on(table.machineId),
])

export const messages = sqliteTable('messages', {
  uuid: text('uuid').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  timestamp: text('timestamp').notNull(),          // ISO string
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  cacheCreationTokens: integer('cache_creation_tokens').default(0),
  cacheReadTokens: integer('cache_read_tokens').default(0),
  cacheEphemeral5mTokens: integer('cache_ephemeral_5m_tokens').default(0),
  cacheEphemeral1hTokens: integer('cache_ephemeral_1h_tokens').default(0),
  estimatedCostUsd: real('estimated_cost_usd').default(0),
  stopReason: text('stop_reason'),
  durationMs: integer('duration_ms'),
  isSidechain: integer('is_sidechain', { mode: 'boolean' }).default(false),
}, (table) => [
  index('idx_messages_session').on(table.sessionId),
  index('idx_messages_timestamp').on(table.timestamp),
  index('idx_messages_model').on(table.model),
])

export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at'),
})

/**
 * One row per tool_use block encountered inside an assistant message.
 * Populated on parse; older messages that were synced before this table
 * existed will be backfilled by future syncs (parser is idempotent via
 * onConflictDoNothing on the primary key).
 */
export const toolUses = sqliteTable('tool_uses', {
  id: text('id').primaryKey(),                       // tool_use id, e.g. "toolu_..."
  messageId: text('message_id').notNull().references(() => messages.uuid),
  sessionId: text('session_id').notNull(),
  timestamp: text('timestamp').notNull(),
  toolName: text('tool_name').notNull(),
  inputSize: integer('input_size').default(0),       // length of serialized input JSON
}, (table) => [
  index('idx_tool_uses_message').on(table.messageId),
  index('idx_tool_uses_session').on(table.sessionId),
  index('idx_tool_uses_name').on(table.toolName),
  index('idx_tool_uses_timestamp').on(table.timestamp),
])

/**
 * User-defined labels that can be attached to projects or sessions.
 * `color` is a hex string (e.g. "#c96442") used by the UI; null means
 * "pick from the default palette".
 */
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),              // slug, e.g. "client-acme"
  name: text('name').notNull(),
  color: text('color'),
  createdAt: text('created_at').notNull(),
})

/**
 * Join table mapping tags to either a project or a session. We use a
 * single table with an `entity_type` discriminator instead of two tables
 * so queries like "every tagged entity" stay simple.
 */
export const entityTags = sqliteTable('entity_tags', {
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),    // 'project' | 'session'
  entityId: text('entity_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_entity_tags_tag').on(table.tagId),
  index('idx_entity_tags_entity').on(table.entityType, table.entityId),
])

/**
 * Outbound webhooks the dashboard can fire when something interesting
 * happens (budget crossed, subscription quota crossed, anomaly detected,
 * sync error). One row per configured endpoint; the events array is
 * stored as a JSON string column.
 */
export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  label: text('label'),
  events: text('events').notNull(), // JSON: array of event ids the hook listens to
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  secret: text('secret'),            // optional shared secret for HMAC sig
  createdAt: text('created_at').notNull(),
  lastDeliveredAt: text('last_delivered_at'),
  lastError: text('last_error'),
})

/**
 * Per-attempt delivery log. Used by the UI to render recent attempts so
 * the operator can debug a misconfigured endpoint.
 */
export const webhookDeliveries = sqliteTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  webhookId: text('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  attemptedAt: text('attempted_at').notNull(),
  status: integer('status'),         // HTTP status code, null on transport error
  ok: integer('ok', { mode: 'boolean' }).default(false),
  durationMs: integer('duration_ms'),
  error: text('error'),
}, (table) => [
  index('idx_webhook_deliveries_hook').on(table.webhookId),
  index('idx_webhook_deliveries_time').on(table.attemptedAt),
])

/**
 * Per-event "watermark" — the last value we saw the user notified about.
 * Lets us fire webhooks only when a threshold is *crossed* on this sync,
 * not every single time a sync runs while the threshold remains tripped.
 */
export const webhookState = sqliteTable('webhook_state', {
  key: text('key').primaryKey(),     // e.g. "budget" or "subscription:5h"
  lastFiredAt: text('last_fired_at'),
  lastValue: text('last_value'),     // JSON-encoded last snapshot
})
