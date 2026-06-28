# Capturing README assets

The README references the image/GIF files below. Capture them from the running
app (`yarn dev`) and drop them in this `assets/` folder with the **exact
filenames**. Great dogfooding angle: review **PR #4 (the review-hub PR)** with
Review Master itself, and capture that.

## Setup for clean shots

- **Theme:** pick one and use it for every shot so the set looks cohesive
  (the default **Graphite** is a safe, neutral choice; **Nocturne** if you want dark).
- **Window size:** ~1440×900. Resize the window before capturing so widths are consistent.
- **Hide clutter:** real repo + a real PR with actual commits/comments reads best.
  Avoid showing private tokens, emails, or unrelated repos.
- **Retina/DPI:** capture at native resolution, then the README scales them down — they'll look crisp.
- **macOS screenshot:** `⌘⇧4` then `Space` to grab a single window (gives a clean drop shadow), or `⌘⇧5` for a region/recording.

## Files to produce

| Filename | What to show | Suggested size |
|---|---|---|
| `assets/hero.gif` | A short (8–15s) end-to-end run: open a PR → preflight builds the review map → generate the AI review → submit. This is the headline — make it smooth. | width ~860, **< 5 MB** |
| `assets/workspace.png` | The three-panel workspace: review map (left), diff (center), PR intelligence (right). | width ~860 |
| `assets/discussion.png` | The **Discussion** tab — issue comments, a review with a body, and an inline thread in the timeline. | width ~860 |
| `assets/inline-comment.png` | The inline comment composer open on a diff line (the "+" affordance → comment box), ideally with the "N inline comments" pill visible. | width ~860 |
| `assets/merge.png` | The review action surface — the **Approve / Comment / Request changes** selector and/or the **Merge** modal (method picker). | width ~860 |

(Optional extra you can add later: `assets/themes.png` — the theme gallery.)

## Making the hero GIF

Any of these work; keep it under 5 MB so it autoplays inline on GitHub:

- **macOS built-in:** `⌘⇧5` → record region → save as `.mov`, then convert:
  ```bash
  # with ffmpeg + gifski (brew install ffmpeg gifski)
  ffmpeg -i recording.mov -vf "fps=15,scale=860:-1:flags=lanczos" frames/%04d.png
  gifski -o assets/hero.gif --fps 15 --width 860 frames/*.png
  ```
- Or a tool like **Kap** / **Gifox** (export GIF, 860px wide, ~15fps).

Trim dead air at the start/end; loop should feel intentional.

## After dropping the files in

The README image tags already point at these paths, so they'll render as soon as
the files exist. Commit them on this branch:

```bash
git add assets/*.png assets/hero.gif
git commit -m "Add README screenshots and demo recording"
```
