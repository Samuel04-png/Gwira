## UI work standards (apply to every UI task)

### Before you write code
- Read the existing shell, sidebar, token and icon files first. Reuse components, tokens, icons, menu primitives and persistence utilities. Do not create parallel systems.
- Post a short plan: files you will touch, components you will reuse, anything ambiguous. If an ambiguity changes the design, stop and ask. Otherwise pick the simplest option and record the decision in the final report.

### Definition of done
A UI task is not done until all of these are true:
1. Every visible control works or is not rendered. No dead buttons, no placeholder text, no TODO comments, no lorem ipsum, and no new console errors or warnings.
2. A feature that depends on something unbuilt is rendered disabled with a tooltip that says exactly what is missing, or it is not rendered. "Coming soon" alone is not acceptable.
3. Every interactive element has default, hover, focus-visible, pressed, selected and disabled states. Every list also has loading, empty, error and overflow states (long text, 50+ items).
4. Everything is reachable by keyboard: Tab / Shift+Tab to move, Enter / Space to activate, Esc to close popovers, arrow keys inside menus and lists. Focus returns to the trigger after a menu or dialog closes.
5. You have taken screenshots from the running app at 1280x800, 1440x900 and the minimum window size, covering default, hover, focus, selected, empty and overflow states. Look at them and fix what is wrong before reporting.
6. Typecheck, lint and existing tests pass. New tests cover logic (sorting, counts, persistence), not markup.

### Visual rules
- One type scale: 11 / 12 / 13 / 15 / 20 px. Body text is 13px. Use tabular numerals for counts and times.
- Spacing on a 4px grid, taken from tokens. If no token exists, add one. Do not inline arbitrary pixel values.
- Colour is near-monochrome. The accent is for links and selection only. Red means failed or destructive. Amber means waiting on a human. Never convey state by colour alone.
- Secondary text must have at least 7:1 contrast against its background.
- No gradients, glows, shadow cards, emoji, decorative illustrations or sparkle icons.
- Borders are 1px hairlines. Separate groups with space first and dividers second.
- Icons: the existing icon set at 16px with a 1.5px stroke. Prefer text labels for primary actions.
- Radii: reuse existing tokens. Interactive rows use 8px.
- Motion: 150ms or less, ease-out, for hover and expand. No motion for data updates. Respect prefers-reduced-motion.

### Interaction rules
- Hover reveals secondary actions, and their space is always reserved so nothing shifts.
- Lists never reorder under the pointer. Re-sort only on explicit events, and queue any other reorder until the pointer leaves the list.
- Destructive or irreversible actions need a confirmation or an undo window of at least 10 seconds.
- Every async action gives immediate feedback, then either success or a specific error with a next step.
- Write plain language: say what happened and what to do next. Never show a raw error code as the only message.

### Data rules
- Production UI renders real data only. Never hardcode names, counts, messages or states.
- For visual verification, use dev-only fixtures behind a flag that is excluded from production builds. Fixtures must cover: empty, one item, 50+ items, very long names, unread, failed, and offline.

### Final report (required)
List: files changed; every new control and its status (working / disabled with reason / not built); decisions you made on ambiguities; known gaps; screenshot paths; commands run and their results.

## UI work standards (apply to every UI task)

Before coding
- Restate the task in 5 lines and list every state and flow involved.
- If a reference screenshot is attached, describe in 3 lines what you will borrow and what you will not.
- Reuse existing components and tokens. Add a dependency only if the task names it.

A UI task is not done until all of these are true
1. Every interactive element works or is not rendered. No disabled "coming soon" controls, TODOs, lorem ipsum or empty handlers. Before finishing, grep changed files for TODO|FIXME|lorem|coming soon|console.log and remove them.
2. Every component has default, hover, focus-visible, active, selected, disabled, loading, empty and error states. Build a dev-only state gallery route that shows each one, and screenshot it.
3. Every flow has an exit (Esc, close, back), and focus returns to the element that opened it.
4. Every async view has loading, empty, and error-with-retry. An error is never shown as an empty state.
5. Test text at 0, 1 and many items, and with a 60-character name. Truncate with an ellipsis and put the full text in a tooltip. Nothing clips.
6. Everything is reachable by keyboard in a logical tab order, with a visible 2px focus ring.
7. Text contrast is at least 4.5:1. Status is never shown by color alone.
8. Hover, selection and loading cause no layout shift.
9. No fabricated data in production paths. Fixtures exist only behind a dev flag.

Visual standards (use existing tokens first)
- 4px spacing grid. Body 13px, metadata 12px, titles 13px medium. One font family.
- 1px borders, 8px radius, no gradients, glows or colored headers. Shadow only on floating panels.
- One icon set at one stroke weight and size.

Verification (required, in order)
1. Launch the real Electron app and open the actual route. Capture screenshots at 1440x900, 1280x800 and 1024x768. Confirm each shows the intended page.
2. View each screenshot and write a defect list: alignment, spacing, clipping, contrast, icon inconsistency, wrong sizes. Fix and recapture. Do at least two passes and report what you found and fixed.
3. Write interaction tests for the task's "Interaction contract". Run typecheck, lint and tests.

Final report: files changed, components added, states covered, interaction tests added and their results, defects found and fixed, anything not done and why. Do not claim anything you did not verify.