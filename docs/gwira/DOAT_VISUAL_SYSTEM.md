# Doat visual system

## Deterministic local avatar system

V1 uses a procedural SVG avatar, not AI image generation. A saved visual specification contains a stable seed, shape, palette, expression style, tone, accessories, and revision. Rendering that specification always produces the same base avatar and never calls a network provider.

This is intentionally honest: “Regenerate appearance” produces a new local procedural candidate. It does not claim an image model generated an asset.

## Design rules

- Abstract geometric/robotic forms, never copied characters or animal mascots.
- Compact forms with restrained Gwira palette pairings; readable operational text always accompanies an expression.
- Operational expressions are derived: idle, working, waiting for approval, blocked, completed, failed, paused, unavailable.
- Motion is optional and suppressed by `prefers-reduced-motion`; expression change never implies sentience.
- A candidate revision is previewed. Only explicit acceptance changes the active visual specification; a bounded revision history remains available locally.

## Status mapping

| Operational fact | Expression |
|---|---|
| active task / run | focused |
| pending approval | alert |
| blocked / error | concerned |
| completed task | bright |
| paused | resting |
| unavailable provider | dimmed |
| otherwise | calm |
