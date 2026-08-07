# Deployment

The app has two halves and they must ship together: the Next.js frontend on Vercel, and the Convex
functions and schema on the Convex deployment that frontend talks to. Before this was wired up they
drifted — Vercel shipped on every push to `main` while Convex kept running whatever someone had last
pushed by hand, and nothing reported the gap.

## How a deploy works

Vercel runs `npm run build`, which is:

```
convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --preview-run init:seedData --cmd 'next build'
```

`convex deploy` runs **first**. It typechecks the Convex functions, regenerates `convex/_generated`,
and pushes the functions, indexes and schema. Only then does it run `next build`, with
`NEXT_PUBLIC_CONVEX_URL` set to the deployment it just pushed to.

That ordering is the whole point. The frontend is never built against a URL whose backend does not
yet have the functions the frontend calls. If any step fails the next ones do not run, so a Convex
push that fails takes the whole Vercel build down with it rather than shipping a mismatched pair.

`convex` is invoked as the local binary rather than through `npx`, so the build always uses the
version pinned in `package-lock.json`.

## Which deployment a build targets

`convex deploy` picks its target from `CONVEX_DEPLOY_KEY`. Both Vercel environments have one, and
they are **different kinds of key**:

| Vercel environment | Key type               | Target                                               |
| ------------------ | ---------------------- | ---------------------------------------------------- |
| Production         | Production deploy key  | `colorless-chinchilla-754`                           |
| Preview            | **Preview** deploy key | A fresh Convex deployment named after the Git branch |

A preview deploy key does not point at a deployment; it grants the right to create one. Each branch
gets its own, created on first build and reused on later pushes to the same branch. This is why
Preview must never be given the production key: from ticket 24 onward a build _pushes schema_, and
tickets 03–07 rewrite that schema and delete `delivery_seasons`. A production key on Preview would
let any open PR reshape production.

Generate both in the Convex dashboard under **Settings → Deploy keys**, and set each as
`CONVEX_DEPLOY_KEY` on the matching Vercel environment only.

## Preview deployments

A preview Convex deployment starts with an **empty database**. `--preview-run init:seedData` seeds
`pricing_rules` immediately after the push, so a preview can produce Suggested Prices at all; the
flag is ignored when deploying to production.

Two things to know about previews:

- **No Customer rows.** `users` is populated by the Clerk webhook, which points at the production
  Convex `.site` URL. A preview deployment receives no webhook, so a Customer who signs in on a
  preview URL has no row until one is created another way. The Customer-facing path is not testable
  end to end on a preview without pointing a Clerk webhook at it.
- **Convex-side environment variables are per-deployment.** A preview deployment gets the project's
  default environment variables, not production's. `IMAP_HOST`, `IMAP_USER` and `IMAP_PASSWORD` must
  be left **out** of those defaults: `convex/emails.ts` returns early when they are unset, which is
  what stops every open branch from polling the one shared Gmail inbox and racing production for the
  Approver's replies.

`NEXT_PUBLIC_CONVEX_SITE_URL` is deliberately not set on Vercel. `src/lib/internal-api.ts` derives
it from `NEXT_PUBLIC_CONVEX_URL` by swapping `.convex.cloud` for `.convex.site`, so it follows
whichever deployment the build targeted. Setting it explicitly would pin every preview at production's
HTTP boundary.

## Environment variables

Vercel-side variables are listed in the environment documentation (ticket 22). The one this file
adds is `CONVEX_DEPLOY_KEY`, which is required on both Vercel environments and belongs nowhere else —
in particular not in `.env.local`.

Convex-side variables (`APP_URL`, `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_WEBHOOK_SECRET`,
`GOOGLE_GENERATIVE_AI_API_KEY`, `IMAP_*`, `INTERNAL_API_SECRET`, `RESEND_API_KEY`) live on the Convex
deployment, not on Vercel, and are managed with `npx convex env`.

## When the inbox poller stops working

`IMAP_HOST`, `IMAP_USER` and `IMAP_PASSWORD` are read by `convex/emails.ts`, which is a Convex
action. **The same variables set on Vercel do nothing** — no Next.js route polls the mailbox — and
that trap has cost a day of silent downtime once already.

Since ticket 25 the poller no longer fails silently. Every run is recorded in the `poller_health`
table, and once the mailbox has gone more than twenty minutes (four cron ticks) without a successful
read, one email goes to `ADMIN_EMAIL` through Resend — a separate credential from IMAP, so the
notification path survives exactly the failure that breaks the poller. A credential rejection and a
connection failure say different things, because only the first needs a new Google app password in
`IMAP_PASSWORD`.

It is one email per outage, and an outage is not over until the poller has gone a full thirty
minutes without a single failure — the August incident flapped, and a first success ending the
outage would have meant one email per flap. The alert is sent by a Next.js route
(`/api/send-poller-alert`), so `ADMIN_EMAIL` and `RESEND_API_KEY` must be set **on Vercel**, and
`APP_URL` on Convex must point at it. If the email cannot be sent, the "already alerted" mark is
withdrawn and the next tick tries again rather than swallowing the whole outage.

Three variables unset (`IMAP_HOST`, `IMAP_USER`, `IMAP_PASSWORD` all missing) is still a silent
no-op, not an alert: that is how preview deployments are kept from polling the shared mailbox.

Replies that arrive during an outage are not lost. A message is marked `\Seen` only once the poller
has done something with it, so the first healthy run picks up everything that queued up.

## Building locally

`npm run build` now deploys. Run from a checkout with `CONVEX_DEPLOYMENT` set in `.env.local`, it
targets the project's production deployment and the Convex CLI prompts before pushing. To typecheck
and build the frontend alone without touching any deployment, run `npm run typecheck` and
`npx next build`.
