---
title: Add-to-app — one Flutter screen inside Kotlin and Swift
slug: add-to-app-pigeon
date: 2026-08-16
tags: Flutter, add-to-app, Pigeon, Kotlin, Swift
excerpt: Nobody rewrites twelve years of native code for one screen. The interesting question is what it costs to drop Flutter into an app that already exists — and the answer is one number.
issue: M-04
---

An airline's app is native and always will be. Twelve years of Kotlin and Swift
do not get rewritten because the new boarding pass would be nicer in Flutter. So
the realistic question is not *migrate or not* — it is **what does it cost to
put one Flutter screen inside the app they already have.**

I built exactly that: a Flutter module, a plain Kotlin host, a plain UIKit host,
and a generated bridge. Both hosts build. Here is what mattered.

## The engine is the entire performance story

Starting a `FlutterEngine` costs a few hundred milliseconds. That is the whole
reputation problem — paid on tap, it is a blank screen the user watches, and
embedded Flutter feels bolted on. Paid once at launch, it is invisible.

So both hosts warm one engine and hand it to every Flutter route after that:

```kotlin
override fun onCreate() {
  super.onCreate()
  Handler(Looper.getMainLooper()).post { warmEngine() }
}

private fun warmEngine() {
  val engine = FlutterEngine(this)
  engine.dartExecutor.executeDartEntrypoint(
    DartExecutor.DartEntrypoint.createDefault()
  )
  FlutterEngineCache.getInstance().put(CACHED_ENGINE_ID, engine)
}
```

Note where it is **not**: inside `Application.onCreate` itself. That runs on
every cold start, including the launches that never open the Flutter route at
all, and paying for an engine those users never see is how a native app gets
slower by adopting Flutter. Posting it puts the work after the first native
frame.

iOS is the same decision with one extra line — `GeneratedPluginRegistrant`
registers against the **engine**, not the app. A cached engine that skips it
looks fine until the first plugin call quietly returns nothing.

I put both paths in the demo, cached and cold, so the difference is something
you can feel rather than something a README asserts. It is roughly 780 ms
against 40 ms.

## Generate the bridge; do not hand-write it

A `MethodChannel` puts every method name and every field name somewhere the
compiler cannot see:

```dart
await channel.invokeMethod('getProfile');  // typo → null, at runtime, on a device
```

Rename one side and the other returns `null` — in a build you already shipped.

[Pigeon](https://pub.dev/packages/pigeon) takes one Dart schema and generates
the Dart, the Kotlin **and** the Swift:

```dart
@HostApi()
abstract class SessionHostApi {
  @async HostProfile getProfile();
  void logEvent(String name, Map<String, String> parameters);
  void dismiss();
}
```

The same rename is now a compile error in three languages. The generator writes
straight into both host projects, which is deliberate — a generated file that
has to be copied by hand is a generated file that drifts.

One detail worth stealing: mark anything that touches a keychain or a database
`@async` in the schema even if your first implementation answers immediately.
Otherwise you have taught every future implementer that blocking the platform
thread is fine here.

## Ownership is the actual hard part

The plumbing is a weekend. Agreeing which side owns what is what costs a team a
month when it is discovered late.

**The host owns navigation.** Flutter calls `dismiss()` and *asks*. A module
that pops native screens itself breaks the next time the host reorganises them —
and it will.

**The host owns identity.** The embedded screen reads a profile over the bridge
rather than running a second login. Two session stores for one user is a support
ticket generator.

**The host owns analytics.** Two SDKs pointed at one backend means two session
ids and two sets of consent state to keep in step, and one of them will drift.

**The look is shared, and that is the point.** My module depends on the same
design-token package the standalone app uses. Embedded Flutter is only worth its
integration cost if it shares something real with the app it came from, and it is
the only reason the screen does not announce itself as a foreign body the moment
it appears.

## One Android trap

`FlutterActivity.withCachedEngine()` builds an intent targeting
`FlutterActivity` **itself**. Subclass it, use the inherited helper, and you
launch the base activity — none of your engine configuration runs, and the
screen comes up empty with no error. Construct the builder against your own
class:

```kotlin
CachedEngineIntentBuilder(InsightsActivity::class.java, CACHED_ENGINE_ID)
  .build(context)
```

Two hours, that one.
