# Session Protocol

**Status:** Active, written 2026-05-XX
**Author:** Thiago + Claude
**Purpose:** End the "I forget where everything is when I come back to this project" friction. This is the answer to "how do I get going in 90 seconds when I open my laptop?"

## Why this exists

The Continue Leads project moves slowly because every session starts with re-discovery:
- "Where do I log in again?"
- "Wait, what was the project directory?"
- "Are there open PRs?"
- "What was I doing last?"
- "What's the staging password?"

Each gap is small individually. Together they cost 15-30 minutes per session — sometimes more — and they make every restart feel discouraging. The fix is a fixed protocol that removes the cognitive load.

This doc is the protocol.

## The 60-second session opener

When you sit down to work on Continue Leads, do these five things in this order. Should take under 90 seconds.

### 1. Open the project

```bash
cd ~/Downloads/continue-leads
```

> **Why this path?** `~/Downloads/continue-leads` is the active repo. NOT `~/Desktop/continue-leads-cms/` (deprecated prototype). NOT `~/Desktop/OpenClaw (Claude Code)/` (that's where Claude Code's session metadata lives, not the project).

### 2. Sync with the remote

```bash
git fetch origin
git status
git log --oneline -5
```

This tells you: what branch you're on, whether you have uncommitted work, and the last 5 commits.

### 3. Check for open PRs

```bash
# Until gh CLI is installed, use the URL:
open "https://github.com/davincidevllc/continue-leads/pulls"
```

If PRs are sitting open, decide: merge them, abandon them, or leave them for the session.

### 4. Read the "Last Session" block in CLAUDE.md

```bash
# Quick way: open the file in default editor
open CLAUDE.md
```

Scroll to the **Last Session** section at the bottom. This tells you what the previous session did, where things stopped, and what was next.

### 5. Start the Claude Code session

```bash
claude
```

Then drop a one-line prompt: "Read CLAUDE.md in full. Tell me what was in flight last session and what's next."

I'll read it and give you a clean status in 30 seconds.

**Total time: 60-90 seconds. You're now oriented and can start working.**

## Where everything lives — the master map

### Local filesystem (on this Mac)

| What | Where | Note |
|---|---|---|
| **Active repo** | `~/Downloads/continue-leads` | The actual project |
| Deprecated prototype | `~/Desktop/continue-leads-cms/` | DO NOT EDIT — old experiment |
| Claude Code session metadata | `~/Desktop/OpenClaw (Claude Code)/` | NOT the project, just where Claude stores session files |
| Claude config | `~/.claude/` | settings, MCP configs |
| Git config | `~/.gitconfig` | user.name = Thiago DeSouza, user.email = thiago@continueleads.com |

### Cloud / web

| What | Where | Login lives at |
|---|---|---|
| GitHub repo | https://github.com/davincidevllc/continue-leads | iCloud Keychain → GitHub |
| AWS console | https://console.aws.amazon.com/ — region us-east-1 | iCloud Keychain → AWS |
| Cloudflare DNS | https://dash.cloudflare.com/ | iCloud Keychain → Cloudflare |
| Name.com (domain registrar) | https://www.name.com/account | iCloud Keychain → Name.com |
| Staging admin | https://admin.continueleads.com/login | iCloud Keychain → Continue Leads Admin |
| Anthropic console | https://console.anthropic.com/ | iCloud Keychain → Anthropic |
| Telegram BotFather | https://web.telegram.org → @BotFather | (when we set up Telegram bot in Phase 0) |
| Voyage AI (embeddings) | https://www.voyageai.com/ | (when we set up duplicate detection) |
| Black Forest Labs (Flux images) | https://blackforestlabs.ai/ | (tenants set this up per their own account) |

### Key URLs to bookmark

These should be browser bookmarks under a "Continue Leads" folder:

- GitHub repo
- GitHub open PRs
- AWS Console — ECS service: `https://us-east-1.console.aws.amazon.com/ecs/v2/clusters/cl-stg-cluster/services/cl-stg-admin`
- AWS Console — Secrets Manager: `https://us-east-1.console.aws.amazon.com/secretsmanager/listsecrets?region=us-east-1`
- AWS Console — ACM (certificates): `https://us-east-1.console.aws.amazon.com/acm/home?region=us-east-1`
- AWS Console — CloudShell: `https://us-east-1.console.aws.amazon.com/cloudshell/`
- Cloudflare DNS for continueleads.com
- Staging admin login

## Credentials cheat sheet (iCloud Keychain organization)

You use **iCloud Keychain** (per the locked decision). Here's how to structure it for Continue Leads.

### Naming convention

Every Continue Leads credential goes under a name prefixed `CL — `. Examples:

- `CL — AWS Console (root)`
- `CL — GitHub davincidevllc`
- `CL — Cloudflare`
- `CL — Name.com`
- `CL — Continue Leads Admin (staging)`
- `CL — Anthropic Console`

This makes them searchable in one place — type "CL —" in Safari's keychain search and they all surface.

### Items to store

| Credential | What to store | Where you'll find it from |
|---|---|---|
| AWS Console root | email + password | aws.amazon.com login |
| AWS CLI access keys | Access Key ID + Secret Access Key | IAM → Users → your-user → Security credentials |
| GitHub | email + password OR personal access token | github.com login (eventually 2FA recovery codes too) |
| Cloudflare | email + password | dash.cloudflare.com login |
| Name.com | username + password | name.com login |
| Continue Leads Admin (staging) | URL: https://admin.continueleads.com/login, password: `ContinueLeads2026Staging` | Until secrets migration; will rotate to new value after Phase 0 Burst 0a |
| Anthropic Console | email + password | console.anthropic.com (when we set up account) |
| Anthropic API key | the key itself, project-tagged | console.anthropic.com → API keys |
| GitHub PAT | personal access token (for `gh` CLI when installed) | github.com → Settings → Developer settings → Personal access tokens |

### Items NOT to store in iCloud Keychain

These go in AWS Secrets Manager (NOT in your password manager):

- Database credentials
- Service-to-service API keys (Voyage, Flux when platform-paid, etc.)
- Any secret used by the running application

The split: **iCloud Keychain = things THIAGO needs to log in. Secrets Manager = things the APP needs to operate.**

### When secrets rotate

Whenever a credential rotates (you change your AWS password, regenerate a token, etc.):

1. Update iCloud Keychain immediately — don't rely on memory
2. If the rotation affects the running app, follow the secrets migration flow in `multi-tenancy-spec.md`
3. Document the rotation in CLAUDE.md "Last Session" block

## Common gotchas runbook

Things discovered the hard way. Read these once; refer back when something feels off.

### Git identity

- `~/.gitconfig` should set `user.name = "Thiago DeSouza"` and `user.email = "thiago@continueleads.com"`
- If you see commits authored by `Thiago DeSouza <thiagodesouza@Thiagos-MacBook-Pro-2.local>`, it means the global config wasn't set when that commit was made. Past merged commits with the wrong identity stay as-is (history rewrite not worth it); just make sure the current `git config --global user.email` is correct before committing.

### DNS is at Cloudflare, NOT Route 53

- `continueleads.com` is REGISTERED at name.com but DNS is at Cloudflare. All DNS record changes go in Cloudflare, never Route 53.
- ACM validation CNAMEs must have **proxy OFF (gray cloud)** in Cloudflare. Orange cloud breaks ACM validation silently.
- Email (Google Workspace MX) and admin subdomain are both in Cloudflare's zone.

### ECS task def has secrets in plaintext (until Burst 0a migration)

- The running ECS task definition `cl-stg-admin:51` has `ADMIN_AUTH_SECRET`, `DB_PASSWORD`, `PII_ENCRYPTION_KEY` as plaintext env vars, not Secrets Manager references.
- Anyone with ECS Console read access can see them.
- The `cl-stg-app-secrets` Secrets Manager entry exists but is NOT read by the app. It's orphaned.
- The working admin password is `ContinueLeads2026Staging` — NOT the `BasilioDeSouza12!` shown in Secrets Manager (that's the DB password).
- This entire situation gets fixed by Phase 0 Burst 0a (secrets migration).

### gh CLI is NOT installed

- All PR creation requires opening compare URLs in the browser
- Installation is on the to-do list; should happen at the start of a future session
- Until then: open `https://github.com/davincidevllc/continue-leads/compare/main...{branch-name}` and use GitHub's web UI

### `Open Claw` is not the project

- The path `/Users/thiagodesouza/Desktop/OpenClaw (Claude Code)/` shows up in Claude Code session paths
- It is NOT the project; it's where Claude Code stores its own session metadata
- The project is at `~/Downloads/continue-leads`
- If you see "Open Claw" anywhere in a tool path, it's a session-tracking artifact, ignore it

### Tenant access in multi-tenant world

After Phase 0 Burst 0b (multi-tenancy) ships, there are two login URLs:

- `https://admin.continueleads.com/login` — YOUR platform admin login (sees across all tenants)
- `https://leadsquad.continueleads.com/login` — LeadSquad users' login
- `https://boston-co.continueleads.com/login` — Boston Co users' login

Each has a separate session and separate password.

### Cost monitoring before action

Before triggering anything that costs money (Claude API content batch, image generation batch, etc.):

1. Look at the cost preview in the admin UI
2. Confirm cost in your head — does this match what you expected?
3. Type the confirmation amount (typed-confirmation flow)
4. Only then proceed

This is built into the platform per the hard-rule list. Don't bypass it.

## End-of-session wrap-up protocol

When you stop working for the day, do these in order. Takes 5-10 minutes.

### 1. Commit any open work

```bash
git status
git add <files>
git commit -m "<scope>: <short description>"
```

If work is mid-flight and not ready to commit, at minimum: `git stash save "WIP: <description>"` so the working tree is clean.

### 2. Push your branch

```bash
git push origin <branch-name>
```

If `gh` is installed:
```bash
gh pr create  # or update existing PR
```

If not, open the compare URL in your browser to create the PR.

### 3. Update the Last Session block in CLAUDE.md

This is the most important step. Update the bottom of `CLAUDE.md` with:

- **What was completed** — concrete deliverables, file paths, PR numbers
- **What's in progress** — exact state, what file/line, what's blocking
- **Decisions made** — anything worth remembering, no matter how small
- **What's next** — the single most important task to pick up
- **Open questions / blockers** — anything you'd want to ask Future-You

The point: when you (or Claude) read this next session, you should be able to resume in 90 seconds without re-discovery.

### 4. Commit the CLAUDE.md update

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): session N wrap-up"
git push
```

### 5. Tell Claude to stop

In the Claude Code session, just say "Stopping for the day. Bye." Claude will give a clean closeout summary.

### 6. Close the laptop

Done. You should feel: no loose ends, no "I forgot to commit X," no "wait, what was that thing." Tomorrow's session starts with a clean opener.

## When something breaks unexpectedly

This is the troubleshooting protocol — when you discover something doesn't work like you expected.

### Step 1: Don't fix it yet. Document it.

- Open CLAUDE.md
- Add a row to the "Known Issues / Tracked Cleanup" section describing the symptom
- Include: when discovered, the symptom in plain language, suspected cause (if any), severity (blocker / nice-to-fix)

### Step 2: Decide — fix now, or defer?

Ask yourself:
- Does this BLOCK my current task? → fix now
- Could a future me forget about this? → if yes, the tracked-issue entry is essential
- Is this a 5-minute fix? → just fix it
- Is this a 60-minute side quest? → defer

### Step 3: If fixing now, branch + PR

Even small fixes get their own branch + PR. The branch policy is: any change touching 2+ files or production paths goes through a PR.

### Step 4: If deferring, the tracked-issue entry IS the work

A well-written tracked issue (symptom + cause + severity + relevant file paths) is 80% of the work of fixing it. Future-you (or future-Claude) can pick it up cold.

## Quick reference card

For when you just want the essential commands without the explanation:

```bash
# ===== START OF SESSION =====
cd ~/Downloads/continue-leads
git fetch origin
git status
git log --oneline -5
open "https://github.com/davincidevllc/continue-leads/pulls"
open CLAUDE.md   # read Last Session block
claude            # start Claude Code

# ===== DURING SESSION =====
git checkout -b <branch>           # new feature branch
git add <files>
git commit -m "<scope>: <message>"
git push origin <branch>
open "https://github.com/davincidevllc/continue-leads/compare/main...<branch>"  # open PR in browser

# ===== END OF SESSION =====
# 1. Commit + push everything
# 2. Update Last Session block in CLAUDE.md
# 3. Commit + push the CLAUDE.md update
# 4. Tell Claude "Stopping for the day"
# 5. Close laptop
```

## Things this doc deliberately doesn't try to solve

- **Build / deploy commands** — those live in CLAUDE.md "Key Commands" section
- **Architecture decisions** — those live in the spec docs and decisions log in CLAUDE.md
- **Phase plans** — those live in `docs/phase-N-plan.md`
- **How to use git** — assumes basic familiarity

This doc is narrowly about: "how do I get going when I sit down, and how do I leave cleanly when I get up?"

## When this doc itself needs updating

Update this doc when:
- A new credential gets added that should be in the cheat sheet
- A new gotcha surfaces (after the second time it bites you)
- The session-opener flow itself changes (new tools, new URLs, etc.)
- A new tenant gets added (add their subdomain to the URL list)

Commit changes to this doc just like any other code change — branch + PR if substantial, direct push if tiny.
