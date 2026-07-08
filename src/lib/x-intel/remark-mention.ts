import { findAndReplace } from 'mdast-util-find-and-replace'
import type { Root, PhrasingContent } from 'mdast'
import { MENTION_RE, mentionHref } from './mention'

/**
 * Remark plugin that auto-links X @mentions in markdown text — the markdown
 * counterpart to the token-based mention handling used for plain X text. Runs
 * over mdast text nodes only and skips existing links/code so already-linked or
 * fenced content is untouched.
 *
 * Emits a link node with the `x-mention:` sentinel scheme rather than a real
 * URL; the markdown link renderer recognises that scheme and swaps in the
 * interactive <MentionLink> popover (Add as intel target / Open profile on X).
 *
 * MENTION_RE captures a leading boundary char (so `@` isn't matched inside
 * emails/paths); that prefix is re-emitted as a text node before the link so no
 * character is lost.
 *
 * A fresh RegExp is created per invocation because mdast-util-find-and-replace
 * mutates `lastIndex` on the source regex.
 */
export function remarkMention() {
  return (tree: Root) => {
    findAndReplace(
      tree,
      [
        [
          new RegExp(MENTION_RE.source, 'g'),
          (match: string, username: string): PhrasingContent[] => {
            // The portion of the match before "@username" (either "" for a
            // start-of-text match or a single boundary char) is preserved.
            const prefix = match.slice(0, match.length - username.length - 1)
            const link: PhrasingContent = {
              type: 'link',
              url: mentionHref(username),
              title: null,
              children: [{ type: 'text', value: `@${username}` }],
            }
            return prefix ? [{ type: 'text', value: prefix }, link] : [link]
          },
        ],
      ],
      { ignore: ['link', 'linkReference', 'code', 'inlineCode'] },
    )
  }
}
