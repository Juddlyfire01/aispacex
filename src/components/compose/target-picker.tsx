import { useComposeStore } from '../../stores/compose-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import type { PostTarget } from '../../lib/compose/types'

// Sets what the draft is: a standalone post, a reply, or a quote. Reply/quote
// need a target handle + post id. Quotes are always copy-out on pay-per-use;
// replies post via API only when the target post summons you (ComposeActions).

interface TargetPickerProps {
  threadId: string
  target: PostTarget
}

export function TargetPicker({ threadId, target }: TargetPickerProps) {
  const setTarget = useComposeStore((s) => s.setTarget)
  const targets = useXIntelStore((s) => s.targets)

  const onKind = (kind: PostTarget['kind']) => {
    if (kind === 'original') setTarget(threadId, { kind: 'original' })
    else if (kind === 'reply') setTarget(threadId, { kind: 'reply', toPostId: '', toUsername: targets[0] ?? '' })
    else setTarget(threadId, { kind: 'quote', postId: '', username: targets[0] ?? '' })
  }

  const username = target.kind === 'reply' ? target.toUsername : target.kind === 'quote' ? target.username : ''
  const postId = target.kind === 'reply' ? target.toPostId : target.kind === 'quote' ? target.postId : ''

  const setUsername = (value: string) => {
    if (target.kind === 'reply') setTarget(threadId, { ...target, toUsername: value })
    else if (target.kind === 'quote') setTarget(threadId, { ...target, username: value })
  }
  const setPostId = (value: string) => {
    if (target.kind === 'reply') setTarget(threadId, { ...target, toPostId: value })
    else if (target.kind === 'quote') setTarget(threadId, { ...target, postId: value })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={target.kind}
        onChange={(e) => onKind(e.target.value as PostTarget['kind'])}
        className="bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1 text-[11px] text-white/70 outline-none"
      >
        <option value="original">Original post</option>
        <option value="reply">Reply</option>
        <option value="quote">Quote</option>
      </select>

      {target.kind !== 'original' && (
        <>
          <span className="text-[11px] text-white/30">@</span>
          <input
            list="compose-target-usernames"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/^@/, ''))}
            placeholder="handle"
            className="w-28 bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1 text-[11px] text-white/70 outline-none focus:border-[var(--color-border-strong)]"
          />
          <datalist id="compose-target-usernames">
            {targets.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <input
            value={postId}
            onChange={(e) => setPostId(e.target.value)}
            placeholder="post id"
            className="w-32 bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1 text-[11px] text-white/70 outline-none focus:border-[var(--color-border-strong)]"
          />
        </>
      )}
    </div>
  )
}
