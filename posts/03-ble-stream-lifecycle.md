---
title: BLE in Flutter: the reconnect bug you are going to ship
slug: ble-stream-lifecycle
date: 2026-08-20
tags: Flutter, BLE, streams, Dart
excerpt: Every packet arriving twice is not a radio problem. It is a subscription you forgot to cancel, and the third reconnect is where you find out.
issue: M-03
---

Bluetooth Low Energy in Flutter looks easy for about a day. You scan, you
connect, you subscribe to a characteristic, values arrive. Then a real device
walks into a lift, and you discover that everything interesting about BLE is in
the failure paths.

Three things, all of which I got wrong first.

## 1. Discovery is a state, not a spinner

Characteristic handles do not exist until the client has walked the
peripheral's attribute table. Subscribe before discovery finishes and you get an
error that reads like a hardware fault.

So the connection is a state machine with a real `discovering` state in it, not
a boolean and a loading indicator:

```
idle → scanning → connecting → discovering → live
live → dropped → reconnecting → connecting → …
```

`connecting` and `reconnecting` run the same code, and I still keep them
separate — one is something the user asked for and the other is the app
recovering from something they did not, and those deserve different words on
screen.

## 2. The reconnect that doubles every packet

This is the one.

The link drops. You reconnect. You subscribe to the characteristic again. Now
there are **two** live subscriptions to one characteristic, because nothing
cancelled the first — and every notification arrives twice. Drop three times and
every packet arrives four times.

It does not throw. It does not log. Your chart just gets noisy and your
battery gets worse, and it took me an embarrassingly long time to work out that
the strap was fine.

The fix is trivial once you see it: cancel before you re-subscribe, on every
path. The reason it is hard to see is that the bug lives in the *ownership* of a
subscription rather than in any line of logic.

So I put the count on screen:

> **SUBSCRIPTIONS   1**

A number a demo can print is a number a test can assert. Mine asserts it stays
at `1` across a drop and a recovery, and that a recovered packet lands once
rather than twice. That single assertion is worth more than the rest of the
suite.

## 3. `await sub.cancel()` can hang forever

This one is pure Dart and it cost me an afternoon.

`StreamSubscription.cancel()` returns whatever the stream's `onCancel` callback
returns. If that callback returns `void`, on a single-subscription controller
that was **never closed**, you get back a future that never completes.

```dart
// Deadlocks. Forever. No error.
await _notificationSubscription?.cancel();
```

My disconnect path awaited exactly that, so disconnecting silently did nothing —
the handler stopped mid-teardown and the state machine never advanced. I found
it by bisecting the handler with print statements, which is not a proud story.

Two fixes, and I applied both:

- Any stream source I own returns a real future from `onCancel` — `() async {}`
  rather than `() {}`. The `async` is the whole point, so it carries a comment
  saying so, because a linter will tell you it is unnecessary.
- Teardown paths **do not await cancels they do not own.** The callback still
  runs synchronously, which is what the bookkeeping depends on; only the future
  is dropped, and nothing needs it.

## The seam that makes all of this testable

None of the above is testable against real hardware in CI. So the radio is an
interface — `scan`, `connect`, `discoverServices`, `notifications`, `close` —
with two implementations: the real one over `flutter_blue_plus`, and a fake.

The fake is the interesting one. It **speaks the real wire format**. Heart Rate
Measurement, characteristic `0x2A37`, is not a number — it is a flags byte that
says whether the value is 8- or 16-bit and which optional fields follow, so
every field's offset depends on the flags. RR intervals are in units of
1/1024 s, not milliseconds; read them as milliseconds and you get a 2.4% error
that quietly corrupts every HRV figure downstream.

If the fake just emitted an integer, the parser — the part that actually breaks
in the field — would be covered by nothing. Because it encodes real packets, a
test can assert that a truncated payload throws instead of inventing a value.

Everything with a decision in it lives above the radio interface. The part that
needs hardware has no decisions in it at all.
