---
title: Accessibility is a testable property, not a checklist
slug: accessibility-is-testable
date: 2026-08-06
tags: Flutter, accessibility, WCAG, testing
excerpt: "Is it accessible?" has no answer. "Does this text clear 4.5:1 against the surface it is on?" has exactly one, and you can assert it.
issue: M-06
---

Most accessibility work I have seen goes: someone adds `Semantics` widgets until
the warnings stop, ships, and never thinks about it again. The reason is not
laziness. It is that "make it accessible" is not a task with a definition of
done.

So I stopped treating it as a checklist and started treating it as a set of
properties a test can check. Four that earned their place.

## 1. Contrast is arithmetic, so compute it

WCAG contrast is not a vibe. It is a ratio of relative luminances, and relative
luminance is a defined function — linearise each channel, weight them
`0.2126 / 0.7152 / 0.0722`, and divide.

I wrote it once, ran my own palette through it, and found **six failures in a
palette I had designed by eye and was rather pleased with:**

| token | was | now |
|---|---|---|
| `inkFaint` | 3.69:1 | 4.73:1 |
| white on `primary` | 4.23:1 | 4.68:1 |
| `accent` | 3.35:1 | 4.70:1 |
| `success` | 4.26:1 | 4.67:1 |

It also surfaced a design bug rather than a colour bug: one token was serving as
both a decorative border and a control boundary. Those have different thresholds
— 3:1 for a control, and decoration has none — so they needed to be two tokens.
I would not have found that by squinting.

Every colour I ship is now solved rather than picked. When I built a set of
per-destination accents, I wrote a script that walks lightness until each one
clears 4.5:1 against *its own surface in its own theme* — which is also why
light and dark are separate values rather than one colour lightened at runtime.
A single mid-tone that passes on white cannot also pass on near-black. One of
them is failing.

## 2. A tooltip is not a name

This one is a genuine Flutter trap.

```dart
IconButton(
  tooltip: 'Back to the list',   // ← not the accessible name
  icon: Icon(Icons.arrow_back),
)
```

`tooltip` populates the semantics **tooltip**, not the label. TalkBack announces
"button". The fix is a `semanticLabel` on the icon, or a `Semantics` wrapper —
and the way to stop it regressing is to find the control in tests by
`find.bySemanticsLabel(...)` rather than `find.byTooltip(...)`. If the test can
only find it the wrong way, so can only the sighted user.

## 3. A field with a separate error announces neither

A label `Text`, a `TextField`, and an error `Text` are three sibling nodes. A
screen reader user focusing the field hears the field — not the label, not the
error, and gets no hint that anything went wrong.

`MergeSemantics`, one composed label, `ExcludeSemantics` on the visible pieces
so nothing is read twice, and `liveRegion: true` on the error so it is
*announced* when it appears rather than merely drawn. A sighted user sees red.
Without a live region nobody else learns anything changed.

## 4. The bug I wrote in the app that has an accessibility demo in it

Best lesson of the project, and it is embarrassing.

I added entrance animations everywhere — content fades and lifts in as it
arrives. Standard, tasteful, tested.

`Opacity` at exactly `0` **removes its subtree from the semantics tree.**

So for the duration of every fade, the content did not exist for a screen reader
at all. On a staggered list it was worse than that — items appeared to them one
at a time, in sequence, because that is what the stagger was doing to the
opacity values. Shipped in an app whose sixth feature is a WCAG audit.

```dart
Opacity(
  opacity: value,
  alwaysIncludeSemantics: true,   // the fade is decoration
  child: child,
)
```

A test now asserts that a `DbInViewFade` at opacity `0` is still findable by its
semantics label. It caught the regression the same afternoon I wrote it — which
is the entire argument for this post. **The animation is decoration. It has no
business gating what gets announced.**

## The bit that made it stick

I put a **live audit in the app**, rendering the actual computed ratios for the
actual palette, so a failure is visible rather than filed. And reduce-motion
lands every animation on its *end state* rather than on nothing — the content
still has to be there, it just does not travel.

Accessibility stopped being a thing I remembered to do and became a thing that
breaks the build. That is the only version of it I have seen survive contact
with a deadline.
