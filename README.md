# ⏳ Time Estimate

**A live countdown for Claude Code.** While Claude works on your request, a small box above the prompt tells you how much longer it's likely to take, ticking down one second at a time:

```
  ╭──────────────────────╮
  │  ⏳ 4m 12s left       │
  ╰──────────────────────╯
```

No more guessing whether to grab a coffee or stay at the keyboard.

---

## What you see

| The box shows | Meaning |
| --- | --- |
| `⏳ 4m 12s left` | Estimated time until Claude finishes. Counts down every second. |
| `⏳ estimating…` | The mod is still learning your pace (fewer than 5 finished responses recorded). |
| `⏳ longer than usual` | This response has already outlasted every response it has on record. |

Background agents (sub-agents, `/code-review` runs, forks) get their own line under the countdown, with elapsed time, sub-agent progress (`sub-agents 2/5`) and their own estimate. Those lines show even while the main session is idle.

The box disappears as soon as Claude is done.

## How the estimate works

Time Estimate uses the best signal it has:

1. **Task progress (preferred).** When Claude works through a task list (`TaskCreate` / `TaskUpdate` / `TodoWrite`), the mod measures the time per finished task and multiplies it by the tasks still open.
2. **Your history (fallback).** Otherwise it looks at how long your past responses took (the last 50, kept across sessions). It keeps only the ones that ran longer than the current response has so far, and uses their median. Short past responses say nothing about a request that's already taken five minutes.

To keep the countdown steady, the mod fixes an **end time** and counts down to it. A new end time is set only when there's new information (a task finishes) or the countdown reaches zero, so the number never jumps around from one second to the next.

Background agents are estimated the same way, from the history of agents with the same label.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install time-estimate --marketplace TomerBenShimol/claude-time-estimate
```

Answer `y` to add the marketplace, pick a scope (user scope loads it in every session), and the mod is active right away. No reload needed.

Or from your shell:

```
claude plugin install time-estimate --marketplace TomerBenShimol/claude-time-estimate
```

## Develop

Run a session with the mod loaded straight from a local clone. Edits hot-reload when the turn ends:

```
claude --plugin-dir ./claude-time-estimate
```

Check and test:

```
claude plugin validate ./claude-time-estimate
claude plugin test ./claude-time-estimate
```

Type-check (the engine writes the API types into `.claude-plugin/types/` the first time it loads the mod):

```
npx tsc -p ./claude-time-estimate --noEmit
```

## Layout

```
claude-time-estimate/
├── .claude-plugin/
│   ├── plugin.json        # mod manifest
│   └── marketplace.json   # lets others install it from this repo
├── hooks/
│   ├── hooks.json         # points the engine at register.tsx
│   ├── register.tsx       # hooks: turn timing, task tracking, the band above the prompt
│   ├── estimate.ts        # estimate, countdown and formatting logic (pure functions)
│   └── agents.ts          # background-agent tracking
├── types/index.d.ts       # the mod's state contract
└── tests/                 # claude plugin test suites
```

## Privacy

Everything stays on your machine. The mod stores only a list of response durations (numbers in milliseconds) in Claude Code's local plugin store. It reads no files and makes no network calls.
