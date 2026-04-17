import {
  AssistantEntrySchema,
  TurnDurationSchema,
  AiTitleSchema,
  CustomTitleSchema,
  type AssistantEntry,
} from '~/lib/schemas'
import { calcCost, type TokenUsage } from '~/lib/pricing'

export interface ParsedToolUse {
  id: string
  messageId: string
  sessionId: string
  timestamp: string
  toolName: string
  inputSize: number
}

export interface ParsedMessage {
  uuid: string
  sessionId: string
  timestamp: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  cacheEphemeral5mTokens: number
  cacheEphemeral1hTokens: number
  estimatedCostUsd: number
  stopReason: string | null
  isSidechain: boolean
  toolUses: ParsedToolUse[]
}

export interface ParsedTurnDuration {
  parentUuid: string
  durationMs: number
}

export interface ParsedTitle {
  sessionId: string
  title: string
  isCustom: boolean
}

export interface SessionMeta {
  entrypoint: string | null
  slug: string | null
  cwd: string | null
  startedAt: string | null
  endedAt: string | null
}

export type ParseResult =
  | { type: 'message'; data: ParsedMessage }
  | { type: 'turn_duration'; data: ParsedTurnDuration }
  | { type: 'title'; data: ParsedTitle }
  | { type: 'meta'; data: SessionMeta & { sessionId: string } }
  | { type: 'skip' }

/**
 * Parse a single JSONL entry into a typed result.
 */
export function parseEntry(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object') return { type: 'skip' }

  const entry = raw as Record<string, unknown>
  const type = entry.type

  // Assistant entry — primary data source
  if (type === 'assistant') {
    const parsed = AssistantEntrySchema.safeParse(raw)
    if (!parsed.success) return { type: 'skip' }

    const data = parsed.data
    const model = data.message.model

    // Filter out synthetic/empty entries
    if (model === '<synthetic>') return { type: 'skip' }
    const usage = data.message.usage
    const ephemeral5m = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0
    const ephemeral1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
    if (
      usage.input_tokens === 0 &&
      usage.output_tokens === 0 &&
      usage.cache_creation_input_tokens === 0 &&
      usage.cache_read_input_tokens === 0 &&
      ephemeral5m === 0 &&
      ephemeral1h === 0
    ) {
      return { type: 'skip' }
    }

    const tokenUsage: TokenUsage = {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationTokens: usage.cache_creation_input_tokens,
      cacheReadTokens: usage.cache_read_input_tokens,
      cacheEphemeral5mTokens: ephemeral5m,
      cacheEphemeral1hTokens: ephemeral1h,
    }

    const toolUses = extractToolUses(
      (entry.message as { content?: unknown })?.content,
      data.uuid,
      data.sessionId,
      data.timestamp,
    )

    return {
      type: 'message',
      data: {
        uuid: data.uuid,
        sessionId: data.sessionId,
        timestamp: data.timestamp,
        model,
        ...tokenUsage,
        estimatedCostUsd: calcCost(model, tokenUsage),
        stopReason: data.message.stop_reason ?? null,
        isSidechain: data.isSidechain,
        toolUses,
      },
    }
  }

  // System turn_duration — for session duration tracking
  if (type === 'system' && entry.subtype === 'turn_duration') {
    const parsed = TurnDurationSchema.safeParse(raw)
    if (!parsed.success) return { type: 'skip' }
    return {
      type: 'turn_duration',
      data: {
        parentUuid: parsed.data.parentUuid,
        durationMs: parsed.data.durationMs,
      },
    }
  }

  // AI-generated title
  if (type === 'ai-title') {
    const parsed = AiTitleSchema.safeParse(raw)
    if (!parsed.success) return { type: 'skip' }
    return {
      type: 'title',
      data: {
        sessionId: parsed.data.sessionId,
        title: parsed.data.aiTitle,
        isCustom: false,
      },
    }
  }

  // Custom title (overrides AI title)
  if (type === 'custom-title') {
    const parsed = CustomTitleSchema.safeParse(raw)
    if (!parsed.success) return { type: 'skip' }
    return {
      type: 'title',
      data: {
        sessionId: parsed.data.sessionId,
        title: parsed.data.customTitle,
        isCustom: true,
      },
    }
  }

  // Extract metadata from user/assistant entries (first seen)
  if (type === 'user' || type === 'assistant') {
    const sessionId = entry.sessionId as string | undefined
    if (sessionId) {
      return {
        type: 'meta',
        data: {
          sessionId,
          entrypoint: (entry.entrypoint as string) ?? null,
          slug: (entry.slug as string) ?? null,
          cwd: (entry.cwd as string) ?? null,
          startedAt: (entry.timestamp as string) ?? null,
          endedAt: (entry.timestamp as string) ?? null,
        },
      }
    }
  }

  return { type: 'skip' }
}

/**
 * Pick `tool_use` blocks out of the assistant message content. Anthropic
 * sends content as an array of blocks with `type: "tool_use" | "text"`.
 * Input size is the length of the serialized input JSON — a cheap proxy
 * for how much context the tool consumed.
 */
function extractToolUses(
  content: unknown,
  messageId: string,
  sessionId: string,
  timestamp: string,
): ParsedToolUse[] {
  if (!Array.isArray(content)) return []
  const out: ParsedToolUse[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as Record<string, unknown>
    if (b.type !== 'tool_use') continue
    const id = typeof b.id === 'string' ? b.id : null
    const name = typeof b.name === 'string' ? b.name : null
    if (!id || !name) continue
    let inputSize = 0
    try {
      inputSize = b.input === undefined ? 0 : JSON.stringify(b.input).length
    } catch {
      inputSize = 0
    }
    out.push({ id, messageId, sessionId, timestamp, toolName: name, inputSize })
  }
  return out
}
