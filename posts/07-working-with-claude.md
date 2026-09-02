---
title: How I actually work with Claude on production Flutter
slug: working-with-claude
date: 2026-08-02
tags: AI, Claude, Flutter, workflow
excerpt: Not prompt tricks. The three habits that changed my output, and the one place I stopped trusting it entirely.
issue: M-07
---

I have shipped a lot of Flutter with an AI in the loop over the last year —
production work across 34 app flavours, and a ten-feature reference app built
almost entirely that way. What follows is not a prompt library. It is the small
number of habits that actually changed the output.

## Ask for the seam, not the feature

The single highest-leverage change I made.

> "Write me a BLE screen that shows heart rate."

gets you a widget with `flutter_blue_plus` calls inside it. It works on your
desk and is untestable forever.

> "Write me a `BleRadio` interface — scan, connect, discover, notifications,
> close. Then a fake that speaks the real 0x2A37 wire format, a real one over
> flutter_blue_plus, and the screen on top of the interface."

gets you something that runs in CI, where "what happens on the third dropped
connection" is a two-line test setup instead of an afternoon with a strap and a
microwave oven.

Same feature. Barely longer prompt. Completely different category of artefact.
Models are extremely good at producing whatever *shape* you name, and most
people name the feature when they could name the architecture.

## Make it write down what it does not do

Ask a model what a control does and it will tell you enthusiastically. Ask what
it does not cover and you get the sentence that actually matters.

Every security control in my reference app carries a `limitation` field, and a
test fails if one is empty:

- **Encrypted storage** — nothing survives a jailbroken or rooted device.
- **Certificate pinning** — a rotation hazard; a pin that outlives its key
  bricks the client.
- **Biometric gate** — authorisation, not encryption. The OS still holds the key.

A control described only by what it stops reads as a guarantee, and a team that
believes the wrong thing about a control stops looking for the gap it leaves.
This habit has caught more real design problems for me than any code review
checklist.

## Let it write the test you were going to skip

You would have written the happy path. You would not, at 11pm, have written the
one where the packet claims four bytes and carries two.

This is where the leverage is highest, because it is the work most likely to be
skipped under deadline and the work where skipping is most expensive. Some real
ones from the last month, all of which found something:

- A truncated GATT payload **throws** rather than inventing a value.
- Two offline edits to one record, where the server has already accepted the
  first.
- A denied biometric prompt **never touched the vault** — asserting the *order*
  of the gate and the read, not just the outcome.
- Every declared image asset is really in the bundle.

That last one is a two-line test that turns a typo into a red build instead of a
blank square someone notices in a screenshot three weeks later.

## The place I stopped trusting it

**It cannot see.**

I did four consecutive rounds of visual redesign verified entirely by the
analyzer and a passing test suite, and every round had something visibly wrong
in it. Frames positioned by hand that I could not tell overlapped. A set of
generated avatars where half the faces were, frankly, miserable — the default
expression range includes `concerned`, `tired` and `veryAngry`, and nothing in a
test suite has an opinion about that.

Two device-only bugs from the same project:

- A card with a coloured left edge crashed on Impeller and rendered fine on web.
- A performance demo that measured 27 **microseconds** of work and therefore
  proved the opposite of its own claim.

So the rule I now hold: **analyzer for syntax, tests for logic, my own eyes for
anything a person will look at.** I collapsed that third category into the
second for a month and paid for it in rework.

## The unglamorous one: make it explain the decision, not the code

Comments that restate the code are noise. The comment worth having says why the
obvious thing is wrong:

```dart
// Pop, don't go. `go` replaces the stack, which tears the list down and
// rebuilds it — losing the reader's scroll position every time they open a
// feature and come back.
onTap: () => context.canPop() ? context.pop() : context.go('/'),
```

I ask for that explicitly, every time, and it does two things. It makes the code
readable by someone who was not there. And it makes the model commit to a
*reason*, which is the fastest way to find out that it does not have one.

When it cannot produce a reason, that is my signal to go and look properly.
