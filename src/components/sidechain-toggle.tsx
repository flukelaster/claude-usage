import { useAppSettings, useSetIncludeSidechain } from '~/hooks/useAppSettings'

/**
 * Pill-style toggle that tells the server whether analytics queries
 * should include sidechain (subagent) messages. Flips the global app
 * setting and fans out an invalidation to every data query.
 */
export function SidechainToggle() {
  const { data } = useAppSettings()
  const mutate = useSetIncludeSidechain()

  const enabled = data?.includeSidechain ?? false

  return (
    <label
      className="inline-flex items-center gap-2 cursor-pointer select-none text-xs"
      style={{ color: 'var(--color-muted-foreground)' }}
    >
      <span>Include sidechain</span>
      <span
        className="relative inline-block"
        style={{
          width: 32,
          height: 18,
          backgroundColor: enabled ? 'var(--color-primary)' : 'var(--color-secondary)',
          borderRadius: 9999,
          transition: 'background-color 120ms',
        }}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={enabled}
          disabled={mutate.isPending}
          onChange={(e) => mutate.mutate(e.target.checked)}
        />
        <span
          className="absolute top-0.5"
          style={{
            left: enabled ? 16 : 2,
            width: 14,
            height: 14,
            borderRadius: 9999,
            backgroundColor: '#ffffff',
            transition: 'left 120ms',
            boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
          }}
        />
      </span>
    </label>
  )
}
