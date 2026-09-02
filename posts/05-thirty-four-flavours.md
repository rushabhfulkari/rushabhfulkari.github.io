---
title: 34 app flavours, 60 million users — what actually breaks at scale
slug: thirty-four-flavours
date: 2026-08-10
tags: Flutter, scale, CI/CD, monetisation, compliance
excerpt: At one app, a hardcoded value is a shortcut. At thirty-four, it is thirty-four releases. Everything I learned rebuilding ad monetisation across a portfolio.
issue: M-05
---

I work on a portfolio of dating apps — 34 flavours from one Flutter codebase,
60M+ registered members, 180 countries, 43 languages. Most of what I have
learned there is not about Flutter. It is about what stops being true when you
multiply by thirty-four.

## A hardcoded value is thirty-four releases

The single most useful thing I built was not a feature. It was making ad
placements, refresh rates and ad-unit IDs **remote-configurable**.

At one app, hardcoding an ad unit is a shortcut you regret mildly. At
thirty-four it is a store review, a staged rollout and a week of waiting —
multiplied by every experiment anyone wants to run. Once the values move to
config, an experiment is a toggle and the release train stops being the
bottleneck for the growth team.

The general rule I now apply early: **anything a non-engineer will want to
change more than twice does not belong in a build.**

## Empty ad slots are a systems problem

The naive integration requests an ad when a screen appears. That gives you empty
slots on slow networks, wasted requests on screens the user leaves immediately,
and a fill rate that looks like a mediation problem and is not.

What fixed it was unglamorous:

- **session-aware prefetch** — request ahead of where the user is going, not
  where they are
- **request throttling with retry tracking** — a failed request that retries
  immediately, forever, is a spend problem and a battery problem
- **fallback handling** across seven mediation networks, so a network that is
  slow today degrades to the next one instead of leaving a hole

None of that is Flutter. All of it is the difference between an integration that
technically works and one that earns.

## Compliance is a feature with a deadline you do not control

Age verification across Texas, Utah, Louisiana and Brazil, on Google Play Age
Signals and Apple's Declared Age Range API. Two platform APIs with different
shapes, different availability, and different failure modes, behind one Flutter
plugin.

The design decision that mattered: **fail open**. If the signal is unavailable —
old OS, API not rolled out, network down — the user is not locked out of the
app. A compliance control that bricks the product for people it was never
about is a worse outcome than the thing it was guarding against, and legal
agreed faster than I expected.

## Crash noise is a classification problem

We migrated to Sentry for error tracking and performance monitoring. The
immediate win was not the tool — it was being forced to **classify** errors on
the way in.

Sign-in crash reports dropped 40% not because sign-in got 40% more reliable, but
because "user cancelled the Google sign-in sheet" stopped being reported as a
crash. It never was one. It was noise sitting on top of the real failures and
making them impossible to see.

Then the profiling and tracing overhead itself showed up in Play vitals as ANR
risk, and stripping it cut that too. Observability is not free, and on a
mid-range Android device in a country with 43 supported languages, "not free" is
measurable.

## What the flavour count really teaches

Every shortcut is multiplied. Every manual step is multiplied. The 80% cut in
deployment time from Bitrise automation is not a productivity stat — it is the
difference between shipping bi-weekly and shipping when someone has a free
afternoon.

And the thing I did not expect: **the codebase gets better because it has to.**
You cannot special-case one flavour thirty-four times. The pressure to find the
one abstraction that covers all of them is constant, and it produces cleaner
code than any style guide I have worked under.
