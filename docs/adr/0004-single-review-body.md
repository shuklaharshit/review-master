# 0004 — Submit review as one PR review body, no inline comments (MVP)

**Status:** Accepted

## Context
GitHub reviews can be a single body or many inline comments anchored to lines. Inline comments require precise, correct line mapping and more complex submission/state handling.

## Decision
For MVP, submit the generated (and user-edited) markdown as **one GitHub PR review body**, event `COMMENT` by default. No inline comments. The markdown still includes exact file/line references in its text.

## Consequences
- Much simpler, robust submission; the human edits one document before sending.
- The draft is saved locally and preserved on submit failure (retry / copy markdown).
- Inline comments and `REQUEST_CHANGES`/`APPROVE` flows are future work that would extend, not replace, this.
