# The viewports this app is checked against

There is no automated layout test in this repo. jsdom has no layout engine — geometry is zero and
media queries never evaluate — so an overlap, a clipped header or a control hidden under the browser
toolbar cannot be asserted anywhere in the suite. That trade is recorded in
`.scratch/usable-on-a-phone/spec.md`; the consequence is that **the layout of the Customer's screens
is verified by hand and can silently regress.**

This file exists so that the manual check is repeatable: the same sizes every time, not whatever
window the developer happened to have open.

## The set

| Viewport | Orientation | What it stands for                                     |
| -------- | ----------- | ------------------------------------------------------ |
| 390×844  | portrait    | A current iPhone — the reference phone for this work   |
| 360×640  | portrait    | The most common Android size there is                  |
| 320×568  | portrait    | The smallest screen still worth supporting             |
| 844×390  | landscape   | The reference phone turned sideways — a short viewport |

Each of them in **both themes**, light and dark. The theme follows the device
(`defaultTheme="system"` in `src/app/layout.tsx`), so switching the OS appearance is the switch.

## The screens

Three, and all three are the Customer's:

1. Sign-in and onboarding — `src/app/(auth)/`
2. The chat — `src/app/page.tsx`
3. The list of Replacement Requests — `src/components/layout/QuotesModal.tsx`

## What to look for

- Nothing is painted over anything else: the wordmark clear of the card, the message composer clear
  of the page content behind it.
- Nothing that does not fit is unreachable — if it overflows, it scrolls.
- Nothing runs under the notch, the rounded corners or the home indicator, in either orientation.
- Every control a thumb has to hit is at least 44px.
- The header keeps its height when a navigation control is tapped.

## Measuring honestly

Chrome will not size a window below roughly 500px wide, so the numbers above cannot be reproduced by
resizing the browser. Two ways that do work:

- **Device emulation** in DevTools, which is the easy one and is enough for width.
- **A real device**, which is the only way to see the safe-area insets and the iOS browser toolbar at
  all. Anything expressed in `dvh` or in `--safe-*` is invisible everywhere else: a desktop browser
  answers `0px` to every `env(safe-area-inset-*)` and `100dvh` equals `100vh` there.

Do not measure with CSS zoom. It reproduces width faithfully but distorts every viewport-relative
height, which is exactly the class of thing this list is here to check. One finding was withdrawn
from the original investigation for that reason.
