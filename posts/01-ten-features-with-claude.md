---
title: I built a ten-feature Flutter app with an AI. Here is what it actually cost.
slug: ten-features-with-claude
date: 2026-08-28
tags: AI, Flutter, Claude, engineering
excerpt: The demo videos show a prompt and a finished app. What they leave out is the four hours I spent on a socket table, the crash that only happened on a real phone, and the accessibility bug the AI wrote and then caught.
issue: M-01
---

I spent a few weeks building **Cadence**, a Flutter app with ten features in it —
offline-first sync, BLE, a server-driven UI, an LLM agent loop, an accessibility
audit, a screen embedded in native Kotlin and Swift hosts. Most of it was
written with Claude sitting in the loop.

I want to write down what that was actually like, because the demo videos are
all prompt-in, app-out, and that is not the job.

## The part that works better than I expected

Volume. Not quality — volume.

There is a category of work in Flutter that is *entirely* mechanical and
*entirely* necessary: the immutable state class with its `copyWith` and its
`operator ==` and its `hashCode`; the sealed event hierarchy; the four
`AnimatedContainer` properties that need the same duration. It is not hard. It
is just long, and being bored while writing it is how you end up with a
`hashCode` that forgot a field.

An AI writes that correctly and instantly, every time. That alone moved my
throughput more than any editor plugin I have installed in five years.

The second thing is the one nobody mentions: **it writes the test you were
going to skip**. Not the happy path — you would have written that. The one
where the payload is truncated, the one where the network dies between the
write and the acknowledgement. I would ask for "tests for this parser" and get
back a case for a two-byte packet that claims to be four bytes long, which is a
real thing a Bluetooth strap does and which I had not thought about at 11pm.

## The part that does not work

It cannot see.

I built four consecutive rounds of visual redesign — a whole design system, a
board of feature tiles, photo frames, entrance animations — verified entirely by
`flutter analyze` and a passing test suite, and every one of those rounds had
something visibly wrong in it that no test could catch. The frames were
positioned by hand and I had no idea whether they overlapped. I found out when I
finally opened the thing.

The corollary: **a passing test suite is not a rendered screen**, and an AI that
tells you "270 tests, analyze clean" is telling you the truth about something
that is not the question you asked.

It also cannot feel a device. Two bugs from this project:

- A `DbCard` with a coloured left edge crashed on Impeller. `Border` refuses a
  `borderRadius` unless every side shares a colour, and Impeller asserts on it
  during paint. The web build rendered it happily. It only died on a real
  Android phone.
- A performance demo that was supposed to show jank measured **27 microseconds**
  of work per row. Twenty rows was 0.5 ms — three percent of a frame. The demo
  proved the opposite of its own claim, and it took a screenshot from a real
  device to notice.

## The bugs it wrote, and one it caught

Both worth recording honestly.

**It wrote this one.** Every entrance animation on the site faded content in
with `Opacity`. `Opacity` at exactly `0` **drops its subtree from the semantics
tree** — so for as long as the fade ran, a screen-reader user had nothing there
at all, and a staggered list appeared to them one item at a time. In an app
whose sixth feature is a WCAG audit. The fix is one property,
`alwaysIncludeSemantics: true`, and the lesson is that the fade is decoration
and has no business gating what gets announced.

**It caught this one**, and I would not have. Writing an offline outbox, I used
`INSERT OR REPLACE` to upsert a row. SQLite implements that as a *delete*
followed by an insert — so it fires `ON DELETE CASCADE`, and every queued change
attached to that row silently vanished. The fix is
`ON CONFLICT(id) DO UPDATE`. That is a genuinely obscure piece of SQLite
behaviour and it came up because the AI wrote a test that pushed two edits to
one record and watched the first disappear.

## The four hours I will not get back

At one point `flutter test` started failing with
`SocketException: Can't assign requested address` on `127.0.0.1`. Not one
test — every test, on load.

It was not the code. Running the full suite takes loopback `TIME_WAIT` from 43
to **16,309** sockets against a 16,384-port ephemeral range, and with an
emulator and `adb` running it never drains. I had exhausted the machine's ports
by running the tests too many times.

No amount of prompting finds that. You find it with `netstat`, and you find it
by being suspicious that "all 25 test files fail identically at load" is not
what a code bug looks like.

## What I actually changed about how I work

1. **Ask for the seam, not the feature.** "Write me a BLE screen" gets you
   something coupled to hardware. "Write me a `BleRadio` interface, a fake that
   speaks the real GATT wire format, and the screen on top" gets you something
   that runs in CI. The second prompt is barely longer and the output is a
   different category of thing.
2. **Make it write the limitation down.** Every security control in Cadence has
   a `limitation` field, and a test fails if one is empty. Certificate pinning
   does not stop a rooted device. A biometric gate is authorisation, not
   encryption. A model will happily describe what a control does; you have to
   ask what it does not.
3. **Verify at the right altitude.** Analyzer for syntax. Tests for logic.
   *Your own eyes* for anything a person will look at. I collapsed the third
   category into the second for four rounds and paid for it.

The honest summary: it made me roughly twice as fast at the parts of Flutter
that are typing, roughly no faster at the parts that are judgement, and
noticeably better at the part I used to skip, which is testing the ugly case.
