import { describe, expect, it } from 'vitest'
import { parseEntry } from '~/server/claude-logs/parser'

function baseAssistant(overrides: Record<string, unknown> = {}) {
  return {
    type: 'assistant',
    uuid: 'msg-1',
    timestamp: '2026-04-15T12:00:00Z',
    sessionId: 'sess-1',
    isSidechain: false,
    message: {
      model: 'claude-sonnet-4-6',
      role: 'assistant',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      ...(overrides.message as Record<string, unknown> ?? {}),
    },
    ...overrides,
  }
}

describe('parseEntry', () => {
  it('emits a message result for a well-formed assistant entry', () => {
    const result = parseEntry(baseAssistant())
    expect(result.type).toBe('message')
    if (result.type !== 'message') return
    expect(result.data.inputTokens).toBe(100)
    expect(result.data.outputTokens).toBe(50)
    expect(result.data.estimatedCostUsd).toBeGreaterThan(0)
    expect(result.data.toolUses).toEqual([])
  })

  it('extracts tool_use blocks from message content', () => {
    const entry = baseAssistant({
      message: {
        model: 'claude-sonnet-4-6',
        role: 'assistant',
        usage: {
          input_tokens: 10,
          output_tokens: 10,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        content: [
          { type: 'text', text: 'ok' },
          { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } },
          { type: 'tool_use', id: 'toolu_2', name: 'Read', input: { file: 'x.ts' } },
        ],
      },
    })
    const result = parseEntry(entry)
    if (result.type !== 'message') throw new Error('expected message')
    expect(result.data.toolUses).toHaveLength(2)
    expect(result.data.toolUses[0].toolName).toBe('Bash')
    expect(result.data.toolUses[1].toolName).toBe('Read')
    expect(result.data.toolUses[0].inputSize).toBeGreaterThan(0)
  })

  it('skips synthetic model entries', () => {
    const result = parseEntry(
      baseAssistant({
        message: {
          model: '<synthetic>',
          role: 'assistant',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      }),
    )
    expect(result.type).toBe('skip')
  })

  it('skips zero-token entries with no ephemeral cache activity', () => {
    const result = parseEntry(
      baseAssistant({
        message: {
          model: 'claude-sonnet-4-6',
          role: 'assistant',
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      }),
    )
    expect(result.type).toBe('skip')
  })

  it('keeps cache-only entries even with zero input/output tokens', () => {
    const result = parseEntry(
      baseAssistant({
        message: {
          model: 'claude-sonnet-4-6',
          role: 'assistant',
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation: {
              ephemeral_5m_input_tokens: 500,
              ephemeral_1h_input_tokens: 0,
            },
          },
        },
      }),
    )
    expect(result.type).toBe('message')
  })

  it('parses turn_duration entries', () => {
    const result = parseEntry({
      type: 'system',
      subtype: 'turn_duration',
      uuid: 'td-1',
      sessionId: 'sess-1',
      timestamp: '2026-04-15T12:00:00Z',
      parentUuid: 'msg-1',
      durationMs: 1234,
    })
    expect(result.type).toBe('turn_duration')
    if (result.type !== 'turn_duration') return
    expect(result.data.parentUuid).toBe('msg-1')
    expect(result.data.durationMs).toBe(1234)
  })

  it('prefers custom titles over AI titles', () => {
    const ai = parseEntry({
      type: 'ai-title',
      sessionId: 'sess-1',
      aiTitle: 'auto title',
    })
    const custom = parseEntry({
      type: 'custom-title',
      sessionId: 'sess-1',
      customTitle: 'custom title',
    })
    expect(ai.type).toBe('title')
    expect(custom.type).toBe('title')
    if (custom.type !== 'title') return
    expect(custom.data.isCustom).toBe(true)
  })
})
