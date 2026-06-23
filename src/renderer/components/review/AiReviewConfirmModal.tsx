import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Dialog, DialogContent, DialogFooter, DialogHeader } from '../ui/Dialog'

export function AiReviewConfirmModal({
  open,
  onOpenChange,
  loading,
  onGenerate
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  loading?: boolean
  onGenerate: (notes: string) => void
}): JSX.Element {
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) setNotes('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader title="Generate AI review?" />
        <div className="space-y-3 px-5 py-4">
          <p className="text-[13px] leading-relaxed text-text-secondary">
            Before generating, please go through the changes once. You can also add any extra context, concerns, or
            instructions you want the AI reviewer to consider.
          </p>
          <p className="text-[13px] leading-relaxed text-text-secondary">
            This may use your Codex quota. The generated markdown will be saved locally as a draft.
          </p>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-text-secondary">Additional context / reviewer notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Example: Focus on database safety and backwards compatibility. Ignore formatting-only issues."
              className="w-full resize-none rounded-md border border-border-strong bg-background-panel px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={loading} onClick={() => onGenerate(notes.trim())}>
            Generate Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
