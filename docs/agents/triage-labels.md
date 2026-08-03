# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual strings used in this repo's issue tracker.

Because this repo tracks issues as **local markdown** (see `issue-tracker.md`), these strings are the values of the `Status:` line near the top of each issue file — not labels applied through a tracker API.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |
| —                          | `resolved`           | Delivered and committed                  |

`resolved` has no counterpart in the five canonical roles, which describe only who should pick a ticket up next. It is added here because `issue-tracker.md` computes blocking from it — "a ticket is unblocked when every file it lists is `resolved`" — so without a done state nothing ever becomes unblocked. It reuses the string the Wayfinding section of that same file already uses, rather than introducing a second word for the same idea.

A resolved ticket records where it landed under `## Comments`:

```markdown
## Comments

Resolved by `596259a` (2026-08-03).
```

That pointer matters more than it looks: `.scratch/` is gitignored, so the `Status:` line is a local working note while the commit is the only record that survives a fresh clone.

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding string from this table — for example:

```markdown
# 03-validate-inbound-email-sender

Status: ready-for-agent
```

Edit the right-hand column to match whatever vocabulary you actually use.
