# ADR-0002 — Approvers approve by replying to an email in prose, not by clicking a signed link

**Status:** accepted (decided 2026-07, during the grilling behind `finish-replacement-quoting`;
recorded 2026-10-03)

## Context

An Approver turns a Replacement Request into an Outcome. The system has to learn which Outcome they
chose, and any Confirmed Prices or Delivery Estimate that came with it.

Today the Approver replies to the email that carries the Replacement Request in their own words. A Convex cron polls the
mailbox over IMAP, and a language model reads the reply and classifies it into an Outcome with
extracted figures. It is the least deterministic path the system could have taken, and the question
a reader will ask is why a signed approval link was not used instead.

That alternative was worked through in concrete terms. Each Outcome would be a button in the
request email carrying a signed, single-use token. A price override would be a short form behind
the link. That would:

- remove the inbound-email attack surface entirely: no mailbox to poll, no sender to authenticate,
  and no untrusted text near a model;
- make classification deterministic: no confidence score, no threshold, no price bounds;
- delete roughly three hundred lines, as measured at the time: the IMAP poller, the interpreter and
  the parts of the pipeline that exist to distrust it.

## Decision

**Email replies remain the approval mechanism.** A signed link changes how sales works, and email is
what sales actually uses. Approvers already answer customers and colleagues from their mail client.
A reply fits that habit. A link to a form is another tool. Sometimes the answer is not a click at
all, like "same prices, but 20 weeks" or "we need a photo of the dataplate", and that answer would
end up in an email anyway, outside the system.

## Consequences

**Interpreting prose with a language model is the least reliable link in the chain**, and most of
the inbound pipeline exists to contain it. Each of these is a direct cost of this decision. A
signed link would need none of them:

- **Authority comes from a configured address list**, not from knowing a `REQ-` code. A sender who
  is not on the list is logged and left unread, never acted on (`convex/lib/approvers.ts`,
  `convex/lib/reply_verdict.ts`).
- **An extracted price is bounded at 0.5×–2× the Suggested Price**, which catches a peso figure read
  as dollars or a mistyped digit. A part with no Suggested Price has nothing to bound against
  (`PRICE_BAND`).
- **When the system cannot act, it tells the Approver** instead of staying silent. This covers
  confidence below `CONFIDENCE_THRESHOLD` (0.7), an out-of-bounds price, a priced Outcome that would
  leave a part without a Confirmed Price, and a reply to a Replacement Request that already has an Outcome
  (`src/lib/approver-reply.ts`, `/api/send-approver-reply`).
- **The reply body is data, never instruction.** It goes to the model as the user message and is
  never interpolated into the system prompt (`src/lib/gemini-parser.ts`). The classification enum uses
  the Outcome literals; it is a hand-written list in that file, so a new Outcome has to be added
  there too. The returned confidence is clamped to 0–1 before anyone trusts it
  (`convex/lib/reply_verdict.ts`).
- **Reaching an Outcome is one atomic Convex mutation**, because the poller runs concurrently with
  itself and the first decisive reply must win.
- **The vocabulary the email teaches and the vocabulary the interpreter reads come from one table**
  (`src/lib/reply-vocabulary.ts`). They once lived in two places and drifted apart, and a one-word
  "Aprobado" stopped classifying (ticket 28).
- **The mailbox is a dependency that can fail silently.** A message is marked seen only after
  something has been done with it (`convex/lib/inbox_seen.ts`), and a sustained polling failure
  alerts someone (`convex/lib/poller_health.ts`).

**Reversing this gets more expensive over time.** The three-hundred-line estimate predates the
hardening listed above, and switching now means deleting most of it. The interpreter, the price
bounds, the confidence threshold, the vocabulary table and the Approver-reply route would all go.
What would stay is the allowlist, as authority over who may receive a link, and the atomic Outcome
transition. Reopen this if sales stops working from their mail client, or if the interpreter's
failure rate in production makes the Approver-reply loop more work than a form would be.

**Polling, rather than an inbound webhook, is a separate and smaller choice.** The masterplan
justified IMAP polling by the lack of a verified sending domain. That reason no longer holds now
that `za.idcn.com.mx` is a verified Resend sender. Polling stays because it works and the pipeline
above is built around it, and replacing it with a webhook would leave this decision intact. That
choice is easy to reverse and does not need an ADR. It is noted here so nobody reads the old reason
as current.

## References

- `CONTEXT.md`: Approver, Outcome, Suggested Price, Confirmed Price
- `masterplan.md` §2.1, §3.3 and §4, corrected to match this decision
- Ticket 28 (`.scratch/finish-replacement-quoting/issues/28-interpreter-reply-vocabulary.md`,
  local-only), the drift between email and interpreter that the shared vocabulary table fixes
