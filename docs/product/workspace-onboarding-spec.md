# Gwira: workspace, onboarding and Doat identity spec

Place at `docs/product/workspace-onboarding-spec.md`. Codex tasks reference one section at a time (see section 7). Follow AGENTS.md UI standards in every task.

Labels used below:
- **[local]** works in today's local-only app.
- **[cloud]** needs an account or cloud backend. Render it disabled with the reason until then. Never fake it.

---

## 0. Sidebar fixes (from review of the current build)

| # | Issue seen in the build | Fix |
|---|---|---|
| 1 | Only Projects has an icon. The other four nav rows have an empty icon slot, so labels look misaligned with the section headers | Give all five nav items a 16px icon from the existing set (closest equivalents of: layout-dashboard, inbox, square-check, folder, layers). Same stroke weight on all |
| 2 | Projects and Views both look dimmed | Dim only items that are actually disabled. Projects must use the normal text colour and weight when it works |
| 3 | The People & Doats chevron sits further left than the Pinned and Channels chevrons | In every section header, put the chevron in the same right-hand column. Reserve a 24px slot for the + button to its left in all headers, hidden when the section has no action |
| 4 | Empty states are plain text only | When the creation flows in sections 2 and 3 exist, add an inline text action to each empty state (see microcopy) |

---

## 1. Projects

**Goal.** Make "Project" mean one thing: a business initiative. The folder icon came from the Codex model, where a project is a folder the coding agent works in. Both ideas must not share the word.

**Decision.** A Gwira project groups a goal, a lead, members (people and Doats), tasks, a channel, files, and optionally a connected workspace folder. The old folder becomes the project's **Workspace**.

**Flow.**
1. Sidebar "Projects" opens the Projects page. Projects are not listed in the sidebar. A project can be pinned, which places it in Pinned.
2. The Projects page is a dense list: name, status (text plus glyph: On track, At risk, Done), lead, member avatars, "6 open" tasks, target date. Rows open the project page.
3. The project page has tabs: Overview, Tasks, Chat, Workspace, Activity.
4. "New project" is a small dialog: name, goal (one line), lead (default: me), members, optional folder.
5. Migration: existing folder-style projects keep working. List them on the Projects page under a group called "Folders your Doats work in" until they are linked to a project. Nothing is lost.

**Microcopy.**
- Empty: "No projects yet. Create a project to bring tasks, people and Doats together around a goal."
- Button: "New project"
- Folder group tooltip: "These are folders your Doats can work in. Link one to a project to track its work."

---

## 2. Channels and members

**Goal.** A new user can create a channel, add people or Doats, edit it, and archive it, all from the sidebar.

**Flow.**
1. Hover the **Channels** header: a + appears (tooltip "New channel"). Click it to open the New channel dialog.
2. Create the channel. It opens in the chat area with an empty-channel message, and it is shown in the sidebar.
3. Hover a **channel row**: an "Add people or Doats" icon and a ⋯ menu appear.
4. "Add people or Doats" opens a popover with a search field. Results are grouped People and Doats, each with its avatar. Click to add. Multiple adds are allowed without closing.
5. Adding a Doat shows a one-time confirmation (see microcopy) with a participation choice.
6. ⋯ menu: Edit channel, Members, Mute, Pin to top, Remove from sidebar, Archive, Leave.
7. The chat header shows "# sales · 4 members · + Add".

**Components.**
- **New channel dialog (480px):** Name (lowercase, hyphens, max 40 characters), Purpose (one line, optional), Visibility (two radio options). Members are added afterward, not in this dialog.
- **Edit channel:** same fields plus Archive in a separate section at the bottom.
- **Member list:** avatar, name, role (Person or Doat), remove button. Doats show their participation mode.
- **Row hover (channel):** the count is replaced by [Add people or Doats] [⋯], and the name truncates before them. On People & Doats rows the hover shows only [⋯].
- **Doat participation modes:** "Reply only when mentioned" (default) and "May post updates on its own".

**Edge cases.**
- Duplicate name: block with an inline error.
- Removing a Doat that has a task running in the channel: warn, and pause that task if confirmed.
- Last owner leaving: require choosing a new owner.
- Archiving: undo available for 10 seconds, and the channel can be restored from Inbox.
- [cloud] Adding a person who has no account: allowed as a local profile only. Invite is disabled with a reason.

**Microcopy.**
- New channel tooltip: "New channel"
- Row icon tooltip: "Add people or Doats"
- Dialog title: "New channel"
- Name placeholder: "e.g. sales" / helper: "Lowercase, no spaces. You can rename it later."
- Purpose placeholder: "What is this channel for? (optional)"
- Visibility: "Everyone in the workspace can join" / "Only people you add"
- Buttons: "Create channel", "Cancel"
- Toast: "Created #sales. Add people or Doats to get started."
- Empty channel: "This is the start of #sales. Add people or Doats, or write the first message."
- Doat confirmation: "{Doat} will be able to read messages in #sales." Options: "Reply only when mentioned (recommended)" / "May post updates on its own". Button: "Add {Doat}"
- Duplicate error: "A channel named #sales already exists. Open it or choose another name."
- Doat removal: "{Doat} has a task running in #sales. Remove it anyway? The task will be paused."
- Archive toast: "Archived #sales. **Undo**"
- Empty state in sidebar: "No channels yet. **New channel**"

---

## 3. People & Doats: create, edit, assign

**Goal.** A new user can add a person, create a Doat, and give either of them work without leaving the sidebar and Dashboard.

**Flow: the + menu.** The + on the People & Doats header opens a menu:
- "Add a person". [local] creates a profile (name, title, department, optional email or phone). [cloud] "Invite by email" is disabled with: "Inviting people needs a connected account. You can add them as a local profile for now."
- "Create a Doat". Opens the 3-step dialog below.

**Create a Doat (3 steps, 560px dialog, "Step 1 of 3", Back and Next).**
1. **Role.** Cards for Customer support, Marketing, Research, Sales follow-ups, Bookkeeping, Coding, Custom. A role fills in sensible defaults for the next steps.
2. **Make it yours.** Name, personality (section 6), and an avatar with Shuffle. The voice preview updates live as the sliders change.
3. **Set limits.** Autonomy: "Suggest only", "Ask before acting (recommended)", "Act within limits". Tools it may use. Anything external (sending messages, spending money) always asks first unless the user changes that.

On Create, the Doat appears in the sidebar and its chat opens. The Doat's first message is in its own voice.

**Row menu ⋯.**
- Person: Message, Assign a task, Add to channel, Edit, Remove from sidebar.
- Doat: Message, Assign a task, Add to channel, Pause (only while working), Edit, Remove from sidebar, Retire.

**Assign a task.**
- Quick dialog: Title, Assignee (prefilled), Due (optional), Project (optional). Create.
- From chat: if a message to a Doat reads like a job, the Doat replies "I'll treat this as a task: '{title}'. Start now?" with [Start] [Edit]. Nothing starts without that confirmation.
- The Ask bar on the Dashboard can also create tasks ("Tell {Doat} to…") and always shows what it will create before confirming.
- Tasks assigned to a person [local] are tracked but not notified until a cloud account exists.

**Edit.**
- Person: name, title, contact, department.
- Doat: name, role, personality, look ("Edit look"), autonomy, tools, channels.
- Doats are **retired**, not deleted. Retired Doats keep history and cannot receive work.

**Microcopy.**
- Menu items: "Add a person", "Create a Doat"
- Step 1 title: "What should this Doat do?"
- Step 2 title: "Give it a name and a personality"
- Step 3 title: "What may it do on its own?"
- Step 3 helper: "You can change this any time. Anything external, like sending messages or spending money, always asks you first unless you turn that off."
- Toast: "Meet {name}. Say hello."
- Task dialog title: "Assign a task"
- Retire confirm: "Retire {name}? Its history is kept, but you can't assign it new work."
- Empty state in sidebar: "No people added yet. **Add a person**" and "No Doats yet. **Create a Doat**"

---

## 4. Sidebar visibility: Inbox vs sidebar

**Goal.** Inbox is the complete index. The sidebar is the short list of what the user cares about.

**Rules.**
- Inbox lists every channel, person and Doat conversation, with filters: All, Unread, Channels, People, Doats.
- Sidebar Channels and People & Doats show only items with **Show in sidebar** turned on.
- Defaults: channels the user creates are on. Conversations the user is added to, or that message them first, are off.
- **Arrivals.** A new unread message in an off conversation adds a temporary row at the top of its section. Maximum 3 per section. Beyond that, show a row "2 more in Inbox" that opens Inbox filtered to Unread.
- A temporary row looks like a normal row. Its hover action is "Keep in sidebar". It never disappears while unread, hovered or focused. It is removed 60 seconds after the conversation has been read and left, unless kept.
- **Pinned** stays as a separate, optional "pin to top". Only items shown in the sidebar can be pinned. Removing an item from the sidebar also unpins it.
- Persist per user with the existing persistence utility. If a conversation is deleted, remove its entry.

**Where the user manages it.**
- Sidebar row ⋯: "Remove from sidebar".
- Inbox row hover: "Add to sidebar" or "Remove from sidebar" (a switch).
- Section header ⋯: "Choose what shows…". A popover with a search field, one switch per conversation of that type, and Done.

**Microcopy.**
- Header ⋯ item: "Choose what shows…"
- Popover title: "Show in sidebar"
- Temporary row hover: "Keep in sidebar"
- Overflow row: "2 more in Inbox"
- Toast: "Removed #sales from the sidebar. It's still in Inbox. **Undo**"

---

## 5. Onboarding and engagement

**Goal.** A new user sees a Doat do real work and approves it in their first session, and never feels lost or lectured.

**Principles.**
- The first minutes are a task, not a tour. No pop-over sequences.
- Everything can be skipped. Skipping never blocks the app.
- All progress shown is real. No fake business activity, ever.
- Warm, brief and plain, with light humor. Nothing childish.

### 5.1 First-run flow

| Step | What happens | Skippable |
|---|---|---|
| 1 | A one-screen setup dialog with three questions: business name; what takes most of your time (choose up to 3: customer messages, sales follow-ups, bookkeeping, marketing, scheduling, other); team size (just me, 2–5, 6–20, 20+). Answers are used to suggest a first Doat and first tasks | Yes |
| 2 | The user lands on the Dashboard. A **#welcome** channel exists, is shown in the sidebar and is open in the inspector. The only member is Gwira | n/a |
| 3 | Gwira posts its intro messages (see 5.2), paced about 700ms apart with a typing indicator | Yes |
| 4 | The user creates their first Doat. The role is pre-selected from step 1 | Yes |
| 5 | The new Doat greets the user in its own voice and offers tailored first jobs as clickable suggestions | Yes |
| 6 | The Doat does the job. The result arrives as an item that needs the user's approval. Gwira explains the loop once | n/a |
| 7 | The checklist continues: add a teammate, create a channel, connect WhatsApp or Slack when those exist | Yes |

On later launches, messages appear instantly with no typing animation. Respect reduced motion.

### 5.2 Gwira's welcome script

Gwira is a system guide. It is not a Doat. Its avatar is the Gwira mark, and its name carries a "Getting started" label so it is never confused with the user's own Doats.

1. "Hi, I'm Gwira. This is your workspace, where you, your team and your Doats get work done together."
2. "A Doat is an AI worker. You give it a job, it does the work, and you stay in charge. It asks before anything important."
3. "The quickest way to see how it works is to try it. Want to meet your first Doat?"
   Buttons: **Create my first Doat** · Show me around · Not now
4. "Show me around" posts three short lines: "Inbox is every conversation." / "Dashboard shows what's happening and what needs you." / "My Work is your tasks." Each ends with an Open link.
5. After the first Doat is created: "{Doat} is ready. Say hello or give it a first job."
6. After the first approval: "That's the loop: you asked, {Doat} worked, you approved. Everything in Gwira is a bigger version of this."
7. When the checklist is complete: "You're set up. I'll step back now. You can ask me anything from the Dashboard whenever you like."

**Checklist** (pinned at the top of #welcome, updated by real events only; "2 of 5 done"):
1. Create a Doat
2. Give it a task
3. Approve its work
4. Add a teammate
5. Create a channel

Items for features that are not built yet are not shown.

### 5.3 The Doat's first message

The Doat's voice follows its personality settings (section 6).

| Humor setting | Example |
|---|---|
| Playful | "Hi! I'm {name}. I'm good with {role}, and a little too proud of my spreadsheets. What's the first job?" |
| Dry | "{name} here. Ready when you are. What's the first job?" |
| None | "Hello, I'm {name}. What is the first job?" |

First-job suggestions depend on the role chosen. They are clickable and create a real task after the confirmation described in section 3. Examples: Customer support: "Draft replies to today's customer messages". Marketing: "Draft this week's social posts". Research: "Summarize what our top three competitors charge".

### 5.4 Engagement rules

- **In-app only** for now. No email or push.
- **One nudge a day at most.** Gwira posts it in #welcome or Inbox, only after 24 hours of inactivity, and only if it contains something real (what Doats did) or one concrete suggestion. After 3 ignored nudges, stop. A setting turns them off entirely.
- **Feature hints appear once.** The first time the user hovers a channel: "Add people or Doats here." They are dismissed permanently on interaction, and at most one appears per session.
- **Milestone moments.** First Doat, first approval, first teammate and first channel each get one line from Gwira or the Doat and a small check animation. No confetti and no sound.
- **Doat personality moments.** Doats with a playful setting may use light phrasing in activity lines ("Done! Three drafts, one favorite."). They never joke about failures, money, or anything customer-facing.
- **No dark patterns.** No streaks, no guilt copy, no fake urgency, no fake activity.

### 5.5 Data and behavior rules

- Seeding is a single idempotent function. Reopening the app never duplicates #welcome or its messages.
- Onboarding messages are real system messages from Gwira. They do not count toward the Dashboard briefing or any work metrics. The "Getting started" channel can be muted.
- #welcome is archived, not deleted. It leaves the sidebar 24 hours after the checklist is complete and stays in Inbox.
- **Sample data** is opt-in only. Gwira offers "Add sample data to explore" once. Every sample row is labelled "Sample" and one action ("Remove sample data") deletes all of it. Never create it automatically.
- Do not add a telemetry dependency. If an event system already exists, record these: setup completed or skipped, first Doat created, first task, first approval, teammate added, channel created, nudge muted, D1 and D7 return.

---

## 6. Doat identity: avatar, mood, personality

**Goal.** Each Doat feels like its own character, while the interface stays calm and trustworthy. The Doats are the only colour in the sidebar, which becomes a deliberate part of Gwira's look.

### 6.1 Avatar generator

- Deterministic SVG generated from the Doat's id. The same Doat always looks the same.
- Traits: **silhouette** (8 organic, asymmetric shapes), **eyes** (6 styles), **accessory** (none, antenna, ear, spot, stripe, tuft), **palette** (12 muted but distinct hues).
- Flat fills only. No gradients and no outlines.
- Abstract creatures, not people, animals or robots.
- At creation the user can Shuffle (up to 10 times). Afterward the look is locked, with an "Edit look" action. Identity must stay recognizable, so base shape and base colour never change from mood or task.
- Doats must stay distinguishable from people without relying on colour: people are circles, Doats are never circles.

Render sizes:

| Size | Where | Detail |
|---|---|---|
| 20–24px | Sidebar rows | Silhouette, base colour and eyes only. Static |
| 40px | Lists, task rows | Adds accessory |
| 64–96px | Inspector, profile | Full detail. Gentle idle animation: transform only, loop of 4s or more, off under reduced motion |

### 6.2 Mood comes from real state

Mood is how the avatar's eyes express a **real** state. It never replaces the status glyph.

| Real state | Expression |
|---|---|
| Working | Focused (eyes narrowed toward the task) |
| Waiting for approval | Expectant (eyes lifted, slight lean) |
| Idle | Relaxed. Eyes closed after 30 minutes idle |
| Paused | Still, eyes open, no motion |
| Failed | Sheepish (eyes down). Playful Doats add a sweat drop at 64px and above. Serious ones stay neutral |
| Completed (since last viewed) | Pleased (crescent eyes) |

A Doat must never look happy while its run has failed. Personality changes how an expression is drawn, never which state is shown.

### 6.3 Personality

| Setting | Options |
|---|---|
| Tone | Formal ↔ Casual (5 steps) |
| Humor | None, Dry, Playful |
| Verbosity | Terse, Normal, Chatty |
| Initiative | Waits for instructions, Suggests, Proactive |

- Stored as structured settings and used only as style guidance for the Doat's own messages and status phrases.
- Personality never changes accuracy, permissions or risk behavior.
- No humor in failures, approvals involving money, or any external message. External messages use the workspace's brand voice, never the Doat's personality.
- The creation dialog shows three sample lines ("Task finished", "I need approval", "Something went wrong") in the chosen voice before the user commits.

### 6.4 Accessibility

- Avatars are decorative. Their accessible name is the Doat's name, and state is conveyed by the status text and glyph.
- No flashing. Motion respects `prefers-reduced-motion`.
- Avatar colours must keep at least 3:1 contrast against the sidebar background.

---

## 7. Suggested Codex task order

Each prompt is short because AGENTS.md carries the standing rules.

1. **Sidebar fixes.** "Read section 0 of docs/product/workspace-onboarding-spec.md and implement it. Do only that section."
2. **Channels and members.** "Implement section 2. If no channel or member model exists, add the smallest local data model and report it."
3. **People & Doats create, edit, assign.** "Implement section 3. Reuse the existing agent records for Doats."
4. **Sidebar visibility.** "Implement section 4, after Inbox lists all conversations."
5. **Doat avatar generator.** "Implement section 6.1 and 6.2 as a standalone component with a dev-only gallery page showing every trait and every mood at every size." (Can run in parallel with 2 to 4.)
6. **Onboarding.** "Implement section 5, after tasks 2, 3 and 5 are merged."
7. **Projects.** "Implement section 1."

After each task, run the review prompt from the prompt kit in a new task.