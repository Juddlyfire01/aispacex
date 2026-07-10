import { findAndReplace } from 'mdast-util-find-and-replace'
import type { Root } from 'mdast'
import { POST_ID_RE, postHref } from './evidence'

/**
 * Remark plugin that auto-links bare X snowflake post ids (and `post:<id>`
 * forms) in markdown text — the markdown counterpart to the token-based post
 * handling used for plain text. Runs over mdast text nodes only and skips
 * existing links/code so already-linked or fenced content is untouched.
 *
 * Emits a link node with the `x-post:` sentinel scheme rather than a real URL;
 * the markdown link renderer recognises that scheme and swaps in the
 * interactive <PostLink> popover (Open in X / Add to draft).
 *
 * A fresh RegExp is created per invocation because mdast-util-find-and-replace
 * mutates `lastIndex` on the source regex.
 */
export function remarkPost() {
  return (tree: Root) => {
    findAndReplace(
      tree,
      [
        [
          new RegExp(POST_ID_RE.source, 'g'),
          (match: string, postId: string) => ({
            type: 'link' as const,
            url: postHref(postId),
            title: null,
            children: [{ type: 'text' as const, value: match }],
          }),
        ],
      ],
      { ignore: ['link', 'linkReference', 'code', 'inlineCode'] },
    )
  }
}
