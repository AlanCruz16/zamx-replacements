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

**`.env.example` is the list**, variable by variable, split by which runtime owns each. This file
does not repeat it; where the two disagree, `.env.example` wins, because `src/lib/env-example.test.ts`
checks it against the source and nothing checks this paragraph.

The one variable this file adds is `CONVEX_DEPLOY_KEY`, which is required on both Vercel
environments and belongs nowhere else — in particular not in `.env.local`.

Convex-side variables live on the Convex deployment, not on Vercel, and are managed with
`npx convex env`: `APP_URL`, `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_WEBHOOK_SECRET`, `IMAP_HOST`,
`IMAP_PORT`, `IMAP_PASSWORD`, and — needed on _both_ sides, with matching values —
`INTERNAL_API_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ADMIN_EMAIL` and `IMAP_USER`.

Two corrections to what this file used to say here, both of them the kind of error ticket 22 exists
to prevent:

- **`RESEND_API_KEY` is Next.js-side, not Convex-side.** Every Resend call is in a route handler
  under `src/app/api/`; nothing under `convex/` reads it. A copy on the Convex deployment is inert.
- **`IMAP_USER` is not Convex-side only, unlike the rest of `IMAP_*`.** Next.js sets it as the
  `replyTo` on the Approver's emails (`src/app/api/chat/route.ts`,
  `src/app/api/send-approver-reply/route.ts`) so the reply returns to a mailbox that is being read.
  Set it in both places, to the same address.

## Clerk instances

**Production currently authenticates against a Clerk _development_ instance.** The keys in Vercel
Production are `pk_test_…` / `sk_test_…`, set 41 days ago and never revisited, which is why every
production request logs `Attention: Clerk collects telemetry data from its SDKs when connected to
development instances`. Nothing is broken today; what it costs is a development-tier user pool,
development session and rate limits, telemetry, and the development banner shown to real users.
Ticket 27.

**This is deferred, knowingly, as of 2026-08-10.** There is no plan to move off `*.vercel.app`, so
the prerequisite below is not arriving soon and production stays on the development instance. The
runbook further down is complete and ready to execute the day a domain exists; nothing else is
waiting on it. The one thing that changes with time: the switch orphans every `users` row, so the
cost of the cutover grows with the number of real accounts. Today they are all test accounts and the
answer is a wipe. Revisit before that stops being true.

### It cannot be fixed until there is a custom domain

Clerk will not issue a production instance for `zamx-replacements.vercel.app`. From Clerk's own Vercel
guide: "you cannot use a `*.vercel.app` domain for production. To deploy to production, you need to
set DNS records, which isn't possible with vercel.app domains." A production instance is validated by
a CNAME on a subdomain you control, and nobody controls DNS under `vercel.app`.

So the prerequisite is not a configuration step — it is **owning a domain and pointing it at the
Vercel project**. Ticket 27 describes the switch as small, and the mechanical half is; it just cannot
begin until that exists. If the domain sits behind Cloudflare, the Clerk CNAME must be "DNS only",
because Clerk's validation check fails against a proxied generic hostname.

### What is per-instance, and where it lives

Five values change together, split across two systems that are configured in different places:

| Variable                            | Set on | Read by                             |
| ----------------------------------- | ------ | ----------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Vercel | the browser                         |
| `CLERK_SECRET_KEY`                  | Vercel | Next.js server                      |
| `CLERK_JWT_ISSUER_DOMAIN`           | Convex | `convex/auth.config.ts`             |
| `CLERK_WEBHOOK_SECRET`              | Convex | `convex/http.ts:95`                 |
| The webhook endpoint URL            | Clerk  | points at the Convex `.site` origin |

`NEXT_PUBLIC_CLERK_SIGN_IN_URL` and `NEXT_PUBLIC_CLERK_SIGN_UP_URL` are in-app paths and do not
change.

Two traps live in that table. **`CLERK_WEBHOOK_SECRET` is also set on Vercel, where it does
nothing** — the only reader is `convex/http.ts`, a Convex action, exactly like the `IMAP_*` variables
below. Changing the Vercel copy and stopping there leaves the webhook broken. And
`convex/auth.config.ts` reads `process.env.CLERK_JWT_ISSUER_DOMAIN || ''`, so a missed or stale
issuer domain does not throw: `getUserIdentity()` simply returns null and every signed-in Customer
looks signed out. That is a silent failure, not a loud one.

If the sign-in screen offers any social connection, it needs one more thing. Development instances
use Clerk's shared OAuth credentials; production instances require your own, registered with each
provider.

### Switching orphans every existing user

Clerk IDs are per-instance. `users.clerkId` (`convex/schema.ts:29`) is the join between a Clerk
account and everything in this system, and `users.current` (`convex/users.ts:41`) resolves the signed-in
Customer by `identity.subject` through the `by_clerk_id` index. After a switch those IDs no longer
match, so a returning Customer is a new person to the app, with none of their Replacement Requests.

"Clear the rows and let the webhook repopulate" is only half a plan: `convex/http.ts:104` upserts on
`user.created` and `user.updated` only, and a plain sign-in fires neither. An existing Clerk account
signing in to the production instance for the first time gets no row until it signs _up_ or edits its
profile.

Deleting `users` also strands its dependents, because Convex does not cascade. `quotes.userId`,
`chat_sessions.userId` and `chat_messages.sessionId` are all `v.id(...)` references, so a wipe must go
in dependency order: `chat_messages`, `chat_sessions`, `quotes`, then `users`.

### Cutover runbook

Written for the case where production holds **only test accounts**, which is what makes the wipe
acceptable. Confirm that is still true before starting — if any real Customer has Replacement
Requests worth keeping, stop and remap `users.clerkId` by email instead of deleting.

1. Acquire the domain and add it to the Vercel project. Nothing below is possible first.
2. In the Clerk dashboard, create the production instance for that domain and add the CNAME records
   it asks for. Allow up to 48h for propagation; the dashboard shows the domain as verified.
3. Re-register any social connections against the production instance with your own OAuth
   credentials.
4. Create the webhook endpoint on the **production** instance, pointed at
   `https://colorless-chinchilla-754.convex.site/clerk`, subscribed to `user.created` and
   `user.updated`. Copy its signing secret.
5. Set the Convex side first, so the backend is ready before the frontend starts issuing new tokens:
   `npx convex env set CLERK_JWT_ISSUER_DOMAIN … --prod` and
   `npx convex env set CLERK_WEBHOOK_SECRET … --prod`.
6. Wipe the orphaned rows in dependency order (step 5 has already made the old tokens useless, so
   there is no window where a stale session sees a half-empty database).
7. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` on Vercel Production to the
   `pk_live_…` / `sk_live_…` pair. Remove the dead `CLERK_WEBHOOK_SECRET` from Vercel while you are
   there.
8. Redeploy. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is inlined at build time, so an env change alone
   does nothing until a build runs.
9. Update `NEXT_PUBLIC_APP_URL` and Convex's `APP_URL` to the new domain, and the hardcoded
   `za.idcn.com.mx` sender addresses if the domain change reaches email too (ticket 22).

Verify: the telemetry line is gone from the production logs, a fresh sign-up creates a `users` row
via the webhook, and that account reaches its own Replacement Requests.

Leave Preview alone. It keeps the development instance, which is what a development instance is for.

## When the inbox poller stops working

`IMAP_HOST`, `IMAP_USER` and `IMAP_PASSWORD` are read by `convex/emails.ts`, which is a Convex
action. **`IMAP_HOST` and `IMAP_PASSWORD` set on Vercel do nothing** — no Next.js route polls the
mailbox — and that trap has cost a day of silent downtime once already. `IMAP_USER` is the exception:
Next.js needs its own copy as the `replyTo` on the Approver's emails, so it is the one `IMAP_*`
variable that must be set on both sides, with the same value.

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
