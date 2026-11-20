# ADR-0004 — A conversation's state lives on its row; the transcript is for display only

**Status:** accepted (2026-11-20)

## Context

A chat conversation that has produced its Replacement Request is read-only: the screen replaces
the composer with "Start new conversation" and shows the folio (`REQ-…`).

Until ticket 05 of `submitted-chat-reloads-open`, the screen learned that from one place only: the
`submit_quote_request` tool part inside the saved transcript (`findSubmission(messages)`). That
transcript was written by `persistTurn` when the model's stream ended. Tickets 01–04 each closed
one timing window of the same bug, and each left another one open, because the root cause stayed:

- Since ticket 03 the `chat_sessions` row is closed (`submittedAt`, `submittedQuoteId`) in the same
  transaction that creates the Replacement Request, mid-stream. The transcript only caught up when
  the stream ended, or never, if the stream died.
- Before ticket 05 nothing of the turn was saved until the stream ended, so a reload mid-stream
  showed an empty chat, or the conversation without the Customer's last message.

## Decision

**Whether a conversation is submitted, and which Replacement Request it produced, is read from its
`chat_sessions` row. The transcript is what gets drawn, not where state is decided.**

- `chat.currentConversation` returns `{ messages, submission: { requestId } | null }`. `submission`
  comes from `submittedQuoteId`, and only if that quote belongs to the same Customer.
- The screen treats the conversation as submitted if `submission` is set **or** the live transcript
  has the tool part (the live session sees the part before Convex reports the row). With a
  `submission` but no tool part, it draws the folio card from `requestId`, using the same card as
  the tool part.
- The route saves the Customer's incoming messages (`chat.saveCustomerMessages`) **before** calling
  the model. `persistTurn` then only adds the model's reply. Losing it (a crashed stream) costs the
  reply text, not the conversation's state.
- In the first turn this means the conversation row already exists, with the Customer's message,
  when `quotes.create` looks for it. Ticket 04's reservation stays as the fallback for when nothing
  is saved. The first-turn race guarantee still holds, because both racing requests write into, and
  then close, the same row.

## Consequences

- A reload at any point after the Replacement Request exists shows the folio and the read-only composer, even
  if the transcript never gets its final reply.
- After "Start new conversation" the row still reports the old submission until the Customer says
  something in the new conversation (which opens a new row). The screen remembers which Replacement Request
  it left and stops counting it.
- The route makes one more Convex call per turn, and fails closed (503) if it can't save, like
  its other Convex checks.
- The transcript's tool part is still saved and still drawn. It is no longer the authority.
