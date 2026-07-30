# Replacement Quoting

ZIEHL-ABEGG México's automated pipeline for quoting replacement parts for industrial fans: a customer describes what they need in a chatbot, the system proposes a price to a salesperson, and once that salesperson confirms it the customer receives a formal quote.

## Language

### Core

**Replacement Request**:
A Customer's ask for one or more replacement parts, captured in a single chatbot conversation. It carries the parts, quantities and destination, and it is what an Approver reviews. It exists from the moment the Customer confirms their parts, whether or not it ever becomes a Quote Document.
_Avoid_: request, order, solicitud

**Quote Document**:
The formal PDF sent to a Customer once every part on a Replacement Request has a Confirmed Price. A Replacement Request with any unpriced part has no Quote Document, and one that was found obsolete or OEM-restricted never gets one.
_Avoid_: quote, cotización, PDF

A **Replacement Request** and a **Quote Document** are different things with different lifetimes: every Quote Document belongs to exactly one Replacement Request, but most Replacement Requests spend their life without one. The single identifier `REQ-XXXXXX` names the Replacement Request; the Quote Document is identified by the same code and is not separately numbered.

### Money

**Suggested Price**:
A system-generated price proposal for one product, drawn from the range configured for its Model Prefix. It exists only to give a salesperson a starting number — it is never shown to a Customer and never appears in a Quote Document.
_Avoid_: price, estimate, random price

**Confirmed Price**:
The price for one product after a salesperson has approved or overridden the Suggested Price. It is the only price a Customer may ever see. Its absence means no price exists yet, not that the price is zero.
_Avoid_: final price, real price, approved price

**Suggested Price** and **Confirmed Price** are separate values and both are retained. Overwriting one with the other destroys the record of what sales corrected, which is the only signal available for judging whether the configured ranges are any good.

**Model Prefix**:
The leading alphanumeric segment of a fan Model (e.g. `FN050` in `FN050-VDK.4I.V7P1`) that determines which price range applies. A Model whose prefix matches no configured range cannot be priced.
_Avoid_: series, family, product code

### Delivery

**Delivery Estimate**:
A range of whole weeks, expressed as a minimum and a maximum, for how long a replacement takes to arrive. A single agreed figure is a Delivery Estimate whose minimum and maximum are equal. Like price, it exists in a suggested form and a confirmed form.
_Avoid_: lead time, ETA, delivery date

Delivery Estimates are quoted as a range because factory capacity, not the calendar, currently governs them. A single number drawn from a range is either an over-promise or arbitrary padding.

### People

**Customer**:
The person who requests a replacement part through the chatbot. Always external to ZIEHL-ABEGG, always the recipient of a Quote Document, and never permitted to see a Suggested Price.
_Avoid_: client, user, cliente

**Approver**:
A ZIEHL-ABEGG salesperson authorised to turn a Suggested Price into a Confirmed Price. Authority comes from being on the configured list of approver addresses — job title is irrelevant to the system.
_Avoid_: employee, admin, sales rep, vendedor

### Progress

**Outcome**:
What an Approver decided about a request: that it is priced as suggested, priced differently, restricted to the original equipment manufacturer, discontinued, or blocked pending more information. A request with no Outcome yet is awaiting review.
_Avoid_: status, state

**Outcome** answers "what did sales decide?" and is independent of whether the Customer has been told yet. Conflating the two is what allowed a discontinued part to be presented as a delivered quote.
