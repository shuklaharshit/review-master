import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/DropdownMenu'
import { CopyIcon, LinkIcon, MessageIcon, MoreHorizontalIcon, PencilIcon } from '../ui/icons'
import { useAppStore } from '../../stores/appStore'

/** GitHub-style blockquote: prefix every line with `> `, then a blank line. */
export function quoteMarkdown(body: string): string {
  const quoted = body
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  return `${quoted}\n\n`
}

/**
 * The "…" overflow menu shown on a comment. Copy actions are client-side; Quote
 * reply and Edit are delegated to the host (which owns the composer / mutation).
 * An action is hidden when its callback/data is absent.
 */
export function CommentActionsMenu({
  htmlUrl,
  body,
  onQuoteReply,
  onEdit
}: {
  htmlUrl?: string
  body: string
  /** Omit to hide "Quote reply" (e.g. nowhere to reply). */
  onQuoteReply?: () => void
  /** Omit to hide "Edit" (e.g. not the viewer's own comment). */
  onEdit?: () => void
}): JSX.Element {
  const pushToast = useAppStore((s) => s.pushToast)
  const hasBody = body.trim().length > 0

  async function copy(text: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      pushToast('success', label)
    } catch {
      pushToast('error', 'Could not copy to clipboard.')
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Comment actions"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted outline-none hover:bg-background-panel-hover hover:text-text-primary data-[state=open]:bg-background-panel-hover data-[state=open]:text-text-primary"
        >
          <MoreHorizontalIcon className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        // Quote reply / Edit move focus into the composer; stop Radix from
        // restoring focus to the trigger on close, which would steal it back.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {htmlUrl && (
          <DropdownMenuItem onSelect={() => void copy(htmlUrl, 'Link copied.')}>
            <LinkIcon className="h-4 w-4" /> Copy link
          </DropdownMenuItem>
        )}
        {hasBody && (
          <DropdownMenuItem onSelect={() => void copy(body, 'Markdown copied.')}>
            <CopyIcon className="h-4 w-4" /> Copy Markdown
          </DropdownMenuItem>
        )}
        {onQuoteReply && hasBody && (
          <DropdownMenuItem onSelect={onQuoteReply}>
            <MessageIcon className="h-4 w-4" /> Quote reply
          </DropdownMenuItem>
        )}
        {onEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onEdit}>
              <PencilIcon className="h-4 w-4" /> Edit
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
