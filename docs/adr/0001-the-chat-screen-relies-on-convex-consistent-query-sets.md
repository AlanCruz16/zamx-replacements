# ADR-0001 — The chat screen relies on Convex's consistent query set, and that is sound

**Status:** accepted (2026-08-27)

## Context

`src/app/page.tsx` reads two Convex queries, `users.current` and `chat.currentConversation`, and
decides from them whether to mount `ChatDashboard`. `ChatDashboard` seeds `useChat` with
`initialMessages` exactly once, at mount — deliberately, because re-seeding from the reactive query
would overwrite whatever the Customer is typing.

Since the cold-load fix (ticket 01 of `usable-on-a-phone`), both queries answer `null` to a caller
with no identity rather than throwing. That removed the crash but made `null` ambiguous: it now
means both "nobody is signed in yet" and "this Customer has no conversation."

A review raised the consequence. If the screen ever mounted the chat while `currentConversation`
was still reporting the unauthenticated `null` — that is, if `users.current` could report a real
Customer row in an _earlier_ client update than `currentConversation` reported the conversation —
the saved transcript would be dropped for that session, silently, with no error anywhere. Before
ticket 01 that ordering was impossible, because the unauthenticated answer was an exception rather
than a plausible-looking empty one.

The proposed remedy was a discriminated result (`{ status: 'unauthenticated' }` vs
`{ status: 'ready', conversation }`) so the query would say _which_ nothing it meant. That is a
change to a public query's shape, so it was worth establishing first whether the ordering it guards
against can actually occur.

## Decision

**It cannot. We keep the plain `null`, and rely on the guarantee — now written down here rather
than assumed.**

Read against `convex@1.40.0`:

- A client's subscribed queries form **one query set at one version**, and that version is the
  triple `{ querySet, ts, identity }` — a single identity for the whole set, not one per query
  (`browser/sync/remote_query_set.js`). There is no state in which some queries are answering under
  the old identity and others under the new one.
- A `Transition` moves the entire set from `startVersion` to `endVersion`, and
  `RemoteQuerySet.transition()` **throws** if `startVersion` does not match the current version
  exactly. Transitions cannot be applied out of order or partially.
- Every modification in a transition is applied to the result map _before_ anything is announced,
  and `notifyOnQueryResultChanges` then fires **one** `handleTransition` carrying every changed
  query token together (`browser/sync/client.js`, the `"Transition"` case).
- The authentication change lands in exactly one transition:
  `AuthenticationManager.onTransition` returns early unless
  `endVersion.identity > startVersion.identity`, so precisely one transition carries the identity
  bump (`browser/sync/authentication_manager.js`).

So when the identity changes, both queries' new values are computed at the same timestamp under the
same identity, applied atomically, and announced in the same notification. `users.current` becomes a
Customer row at the same instant `currentConversation` becomes the conversation. The feared gap does
not open.

Two mechanics sit below that and are worth stating, because they are the parts a reader would
reasonably doubt:

1. Each `useQuery` builds its **own** `QueriesObserver` and its own subscription
   (`react/client.js` → `useQueries` → `queries_observer.js`), so this really is two React state
   updates, not one. They are both dispatched synchronously inside the same `handleTransition`, in
   the WebSocket message handler, and React 19 batches automatically everywhere — so they flush in
   a single render.
2. `authenticationManager.onTransition` fires `onAuthChange(true)` _before_ the new query results
   are ingested, so `useConvexAuth()` flips a step earlier than the query values do within that
   handler. Same batch, so no separate render — but see below for why this does not matter even if
   it were not batched.

## Consequences

The screen's ordering guard is no longer an accident of how the two queries happen to be
subscribed; it is a documented property of the client, and this ADR is where to look when a future
change makes someone doubt it.

**What actually protects the screen is a belt-and-braces pair, and both halves must survive:**

- The transition atomicity above, which stops the gap from opening; and
- the guard added in commit `8498827`: the screen takes its "still waiting" cue from
  `useConvexAuth().isLoading`, and — crucially — renders `<Loading />` rather than mounting the chat
  when it is authenticated but `users.current` is still `null`. That branch means that even in a
  hypothetical render where auth has flipped but the query values have not, the chat does not mount
  and no transcript can be lost.

Do not collapse that `user === null` branch back into "not signed in, render nothing." It is the
half of the protection that does not depend on the client's internals.

**This reasoning holds only while both queries are subscribed from the same component tree at the
same time.** If `currentConversation` moves to a component that mounts later than the one reading
`users.current`, the second query joins the query set after the identity transition and answers
`undefined` first — a different situation from the one analysed here, and one the `undefined` guard
already covers, but re-check this ADR before assuming so.

`quotes.getUserQuotes` has the same ambiguity in its empty list and needs nothing: `QuotesModal`
renders an empty state rather than seeding one-shot state, so there is no transcript-shaped thing to
lose.

## References

- `.scratch/usable-on-a-phone/issues/13-nothing-does-not-say-which-nothing.md` (the ticket this
  settles — local-only, hence this ADR)
- Commit `10096b2` (ticket 01, the cold-load fix that made `null` ambiguous)
- Commit `8498827` (the `useConvexAuth` guard, the second half of the protection)
