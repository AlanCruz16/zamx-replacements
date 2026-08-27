# ZAMX Replacement Quoting

ZIEHL-ABEGG México's automated pipeline for quoting replacement parts for industrial fans. A
Customer describes what they need in a chatbot, the system proposes a price to a salesperson, and
once that salesperson confirms it the Customer receives a formal quote.

The words in this README are the project's own — **Customer**, **Approver**, **Replacement
Request**, **Quote Document**, **Suggested Price**, **Confirmed Price**, **Outcome**. They are
defined in [`CONTEXT.md`](./CONTEXT.md), and they are not interchangeable with the everyday words
they resemble. Read that first; a "quote" in this codebase is two different things.

## The pipeline, end to end

The system spans two runtimes that call each other, which is why so much of the setup below is
about keeping them in agreement.

1. **The Customer talks to the chatbot.** `/api/chat` (Next.js) streams a Gemini conversation that
   collects Models, quantities and destination. Convex rate-limits it at 40 messages per hour per
   Customer; the conversation is persisted to `chat_sessions` / `chat_messages` so a closed tab does
   not lose it.
2. **A Replacement Request is created.** The route calls `quotes.create` through Convex's internal
   HTTP boundary, which mints the `REQ-XXXXXX` code. Each product gets a **Suggested Price** from
   the `pricing_rules` range matching its Model Prefix, and a suggested Delivery Estimate. A Model
   whose prefix matches no rule gets no price rather than an invented one.
3. **The Approver is emailed.** Resend sends the request to `ADMIN_EMAIL`, with `replyTo` set to the
   polled mailbox (`IMAP_USER`) so the reply comes back somewhere that is being read. Suggested
   Prices appear here and nowhere a Customer can reach.
4. **The Approver replies in plain English or Spanish.** A Convex cron polls the mailbox every five
   minutes (`convex/emails.ts`). A message is considered only if its subject carries a known `REQ-`
   code _and_ its sender is on the Approver allowlist — the code travels in every email the system
   sends, so knowing one cannot be enough.
5. **The reply is interpreted.** `src/lib/gemini-parser.ts` is a thin shell around the model — it
   builds the prompt, calls, and returns what came back. No rule lives there: the decision that turns
   an interpretation into an **Outcome** (priced as suggested, priced differently, OEM-restricted,
   discontinued, or blocked pending info) is `convex/lib/reply_verdict.ts`, a pure function with no
   network and no environment, which is why it can be tested. It is also what stops the model
   inventing a price: a Confirmed Price outside `PRICE_BAND` — half to double the Suggested Price —
   is refused rather than written.
6. **The Customer is told.** A priced Outcome produces a **Quote Document** — a PDF rendered from
   the Confirmed Prices, emailed by `/api/send-client-quote`. The other three Outcomes are explained
   by `/api/send-rejection-email` with no document attached. Both are written in the language the
   Customer chose.

The **Suggested Price** and the **Confirmed Price** are both kept, permanently. Overwriting one with
the other destroys the only record of what sales corrected.

## Prerequisites

- **Node.js 24.** CI runs 24; the `npm run build` script shells out to the pinned local `convex`
  binary rather than `npx`, so the lockfile governs the Convex version.
- **A Convex account and project.** `npx convex dev` creates a development deployment on first run.
- **A Clerk application** (development instance is fine).
- **A Resend account** with a verified sending domain.
- **A Gmail mailbox with IMAP enabled and a Google app password.** This is the Approver's inbox; the
  account password will not work.
- **A Google Generative AI API key.**

## Setup

### 1. Install, and put the example in place first

```bash
npm install
cp .env.example .env.local
```

Copy before creating the deployment, not after: `npx convex dev` writes `CONVEX_DEPLOYMENT` into
`.env.local`, and copying over it afterwards replaces that real value with the placeholder.

### 2. Start Convex

```bash
npx convex dev          # creates the deployment, writes CONVEX_DEPLOYMENT to .env.local
```

Leave it running. It watches `convex/`, pushes functions and schema, and regenerates
`convex/_generated`. Nothing in the backend updates without it.

### 3. Set the environment — on both sides

Read [`.env.example`](./.env.example) rather than just filling in the blanks you copied. It is
split into three sections because **there are three places variables get set, and they are not interchangeable**:

| Section                | Set with                                    | Read by                          |
| ---------------------- | ------------------------------------------- | -------------------------------- |
| `## Next.js-side`      | `.env.local` locally, `vercel env add` live | Next.js routes and components    |
| `## Convex-side`       | `npx convex env set NAME value`             | Convex functions, actions, cron  |
| `## Vercel build only` | the Vercel dashboard                        | `convex deploy` during the build |

Copying `.env.example` to `.env.local` sets up only the first column. The Convex-side lines have to
be run separately:

```bash
npx convex env set APP_URL http://localhost:3000
npx convex env set INTERNAL_API_SECRET "$(openssl rand -hex 32)"
# …and the rest of the ## Convex-side section
```

Four variables are needed on **both** sides, with the same value: `INTERNAL_API_SECRET`,
`GOOGLE_GENERATIVE_AI_API_KEY`, `ADMIN_EMAIL` and `IMAP_USER`.

### 4. Verify the two sides agree

Do this every time you touch either environment. A variable present on one side and absent on the
other is not a hypothetical failure mode here — it is the one that has actually fired, twice, and
both times it produced no error at all:

- On 2026-08-02 `INTERNAL_API_SECRET` was set on Vercel but never on production Convex. A real string
  was compared against `undefined`, every `quotes.create` threw `No autorizado`, and the chatbot told
  every Customer their request could not be registered. It read as an authorisation bug.
- On 2026-08-05 an expired `IMAP_PASSWORD` was replaced on Vercel, where nothing reads it. The
  mailbox poller is a Convex action. The fix looked applied and changed nothing.

```bash
npx convex env list                    # the Convex side
grep -oE '^[A-Z_]+' .env.local | sort  # the Next.js side
```

Compare them against the two sections of `.env.example`. The four shared variables must match
character for character. `src/lib/env-example.test.ts` keeps `.env.example` honest about _which_
variables exist and which runtime owns each, but it cannot see your deployment's values — that
comparison is yours to make.

### 5. Seed the pricing rules

An empty `pricing_rules` table means every Model Prefix matches nothing and no Suggested Price is
ever produced. Seed it:

```bash
npx convex run init:seedData
```

`convex/init.ts` clears the table and reinserts the ranges, so it is safe to re-run after editing
them. Preview deployments seed themselves — `npm run build` passes `--preview-run init:seedData`.

### 6. Run the frontend

```bash
npm run dev
```

Two processes, then: `npx convex dev` and `npm run dev`. Open http://localhost:3000.

## Tests

```bash
npm test          # the full suite
npm run typecheck
npm run lint
```

The suite has two projects, because the code splits cleanly in two (`vitest.config.mts`):

- **`convex`** — Convex functions against an in-memory database via `convex-test`, on the
  `edge-runtime` environment.
- **`web`** — everything that imports React, including the route handlers that render email and PDF
  components, on `jsdom`.

Run one file with `npx vitest run path/to/file.test.ts`, or watch with `npm run test:watch`.

Separately, `npm run check:vocabulary` calls the real model to check that the interpreter still
understands the phrasings an Approver actually uses. It is slow, costs money and needs the network,
so it is deliberately outside the suite and outside CI — run it by hand when you change the
interpreter prompt or the Approver email. It reads `.env.local` directly.

CI (`.github/workflows/ci.yml`) runs typecheck, lint and the suite on every push.

## Verifying the inbound email path

The Approver reply path is the half that cannot be exercised by clicking through the app, and it is
the half that has broken silently. To check it end to end:

1. Get a Replacement Request created — talk to the chatbot until it confirms, and note the
   `REQ-XXXXXX` code.
2. Confirm the Approver email arrived at `ADMIN_EMAIL`.
3. Reply to it **from an address on the allowlist** (`APPROVER_EMAILS`, or `ADMIN_EMAIL` if that is
   unset), leaving the `REQ-` code in the subject. Say something a salesperson would say — "confirmo
   los precios", "está descontinuado".
4. Don't wait five minutes for the cron. Force a poll:

   ```bash
   npx convex run emails:checkInbox
   ```

5. Check the Outcome landed on the request, and that the Customer email went out — a Quote Document
   for a priced Outcome, an explanation without one otherwise.

Three things to know while debugging this:

- **`APP_URL` must be set Convex-side and reachable.** It is how Convex calls back into Next to send
  the Customer's email. Unset, the poller logs a warning and skips the webhook, and the pipeline
  stops right here with no error anywhere else. Convex Cloud cannot reach your `localhost`; that now
  fails as a logged fetch error rather than silently.
- **A message is marked `\Seen` only once the poller has done something with it**, so replies that
  arrive during an outage are picked up by the first healthy run rather than lost.
- **The poller reports its own failures.** Every run is recorded in `poller_health`, and after more
  than twenty minutes without a successful read one email goes to `ADMIN_EMAIL` through Resend — a
  different credential from IMAP, so the alert survives exactly the failure that breaks the poller.
  `GET /api/debug-imap` checks the IMAP credentials directly in development; it returns 404 in
  production.

## Deploying

See [`docs/deployment.md`](./docs/deployment.md). The short version: `npm run build` runs
`convex deploy` _first_ and only then `next build`, so the two halves ship together and a failed
Convex push takes the whole build down rather than shipping a mismatched pair. Preview deployments
get their own branch-named Convex deployment.

If you find the earlier decision to "leave Preview pointed at production for now" written down
anywhere, it is **obsolete, not still-accepted**. Preview once shared `NEXT_PUBLIC_CONVEX_URL` with
Production and so read and wrote production data. It no longer does: `convex deploy
--cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL` overwrites that variable at build time with the
deployment it just pushed to, so the stored Vercel value is ignored on Preview and a preview build
targets its own branch-named deployment.

## Known deferred items

Recorded here so they are not rediscovered as bugs:

- **The sender addresses point at a development domain.** `src/lib/addresses.ts` sends from
  `@za.idcn.com.mx`: `QUOTE_SENDER` and `SUPPORT_SENDER`, two constants in one file. Moving to
  `@ziehl-abegg.com.mx` is editing those two lines — it used to be three hardcoded copies scattered
  across the route handlers. Note that `QUOTE_CONTACT`, the address _printed inside_ the Quote Document, is
  already the real one: the document outlives the email that carried it and gets forwarded inside the
  Customer's company, so it has to stand on its own.
- **Production authenticates against a Clerk _development_ instance.** Clerk will not issue a
  production instance for a `*.vercel.app` domain, so this is blocked on owning a domain, and that is
  not planned. Nothing is broken; the costs are development-tier limits, telemetry, and a banner.
  The cutover runbook is written and ready in `docs/deployment.md`.
- **`NEXT_PUBLIC_APP_URL` and `APP_URL` name the same thing for two runtimes.** They were not
  consolidated. They are read by different processes and set in different places, so one variable
  would have to be readable from both — see the table in `.env.example`.

## Where things live

| Path                 | What                                                                                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTEXT.md`         | The domain language. Start here.                                                                                                                                                                                                                                       |
| `docs/deployment.md` | How a deploy works, which deployment a build targets, the Clerk runbook                                                                                                                                                                                                |
| `docs/agents/`       | The local issue tracker, triage labels, and domain-doc conventions                                                                                                                                                                                                     |
| `AGENTS.md`          | Version warnings for Next.js, Convex and the AI SDK                                                                                                                                                                                                                    |
| `AI_SDK_V6_GUIDE.md` | AI SDK v6 breaking changes — read before touching `useChat` or `tool()`                                                                                                                                                                                                |
| `convex/`            | Schema, queries, mutations, actions, the cron, the HTTP boundary                                                                                                                                                                                                       |
| `convex/lib/`        | The pure logic — pricing, outcomes, reply verdicts, rate limits                                                                                                                                                                                                        |
| `src/app/api/`       | Next.js route handlers: `chat`, `send-client-quote`, `send-rejection-email`, `send-approver-reply`, `send-poller-alert`, `download-quote`, and `debug-imap` (404 in production)                                                                                        |
| `src/lib/`           | Shared between both runtimes. `internal-secret.ts` and `gemini-parser.ts` are imported _and executed_ by `convex/`, which is why `INTERNAL_API_SECRET` and `GOOGLE_GENERATIVE_AI_API_KEY` are needed on both sides; `approver-reply.ts` is imported for its type only. |
