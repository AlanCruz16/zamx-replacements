# ADR-0003 — Groq is a failover for Gemini, not a replacement

**Status:** accepted (decided 2026-11-18, in the grilling before the first real-customer deploy)

## Context

Both language-model calls in the system — the Customer chat (`streamText`, two tools, up to five
steps) and the interpreter of Approver replies (`generateObject`, `temperature: 0`) — go to Gemini
(`gemini-3.5-flash-lite`). The failure we are trying to survive is `503 UNAVAILABLE`: Google's
capacity, not our quota, so retrying Gemini harder only makes the wait longer. In the chat that
wait is a Customer staring at an error; in the interpreter it is an unread email that the next
poll picks up again.

The same problem was solved in another project (BeefJerky_Admin, ADR-0010, "A second Interpreter
is a failover, not a replacement"). This decision follows that precedent, including its model:
`qwen/qwen3.8-27b` on Groq, which passed a Spanish gate there where `openai/gpt-oss-120b` failed.

## Decision

**Gemini answers first; Groq answers only when Gemini fails for a reason time could fix.**

- **Both call sites get the failover.** The chat-only alternative was weighed: the interpreter
  already recovers by re-polling, and a different model classifying a reply that moves money is a
  risk. It was rejected in favour of not letting an outage stall approvals, with the gate below as
  the guard.
- **What switches:** 429, 5xx (the 503 above), timeouts and network errors. **Never a 4xx other
  than 429** — that is a bug or a refused request, and a second provider would fail the same way
  or hide it.
- **Gemini gets `maxRetries: 0`**; the switch to Groq is immediate. Groq keeps one retry.
- **Chat switches only before the first chunk.** Once anything has streamed — or
  `submit_quote_request` has run, which creates the Replacement Request and emails the Approver —
  the failure surfaces as it does today. Restarting on Groq could duplicate a Replacement Request.
- **Chat is sticky within one request.** Once a turn falls to Groq, its remaining steps stay on
  Groq: a Gemini step after a Groq tool call would lack Gemini's thought signature and be rejected
  with a 400. The next Customer message tries Gemini first again.
- **The order is an env var, `AI_PROVIDER_ORDER`** (default `gemini,groq`), shared by both call
  sites. It lets the backup be exercised on purpose (`groq` first) and swapped without a deploy.
- **A missing `GROQ_API_KEY` does not throw.** The chat runs on Vercel and the interpreter on
  Convex, so the key lives in two places; a preview without it must still work while Gemini does.
  Every Gemini failure with no backup to fall to is logged with `console.error`.
- **Which provider answered is logged, not stored.**

## Gates

- **The interpreter's Groq does not go live until it passes `npm run check:vocabulary`**, the same
  set Gemini passes. If it fails, a Groq-only prompt rule (as BeefJerky's `GROQ_RULE`) is the
  next step, and Gemini's prompt stays untouched.
- **The chat's Groq is checked by hand** with `AI_PROVIDER_ORDER=groq`: a full quote, incomplete
  data, a request for prices, and a question about the data plate.

## Consequences

- **Groq runs on the free plan: 8,000 tokens a minute**, shared by chat and interpreter. A chat
  turn that ends in `submit_quote_request` is roughly 4–6K tokens, so during an outage Groq
  carries about one or two chat turns a minute in total. The backup covers short outages with
  little traffic. If more capacity is ever paid for, it goes to Gemini first, not to the backup.
- **Prompt changes must be re-measured on both models.**
- **Customer conversations and Approver replies may be processed by Groq.** The owner judged this
  needs no notice to ZAMX.
