---
title: Offline-first sync in Flutter, and the bug that ate my queue
slug: offline-first-outbox
date: 2026-08-24
tags: Flutter, SQLite, offline, architecture
excerpt: An outbox is twenty lines. The interesting part is what happens on the fourth retry, when the server has moved on and the app has been killed twice.
issue: M-02
---

Every "offline-first Flutter" tutorial I have read stops at the same place: it
caches a GET, shows the cache when the network is down, and calls it offline
support. That is offline *reading*. The hard half is offline **writing**, and it
is hard for reasons that only show up on the fourth retry.

Here is the shape I settled on, and the three things that actually bit.

## The shape

Two tables. One holds the records as the device believes them. One is an
**outbox** — an append-only queue of changes that have not reached the server
yet, each with a status, an attempt count, and the record version the change was
based on.

The UI never waits for the network. A write lands in the record table and the
outbox in one transaction, the screen updates, and a drain runs whenever it can.
That is the whole idea, and it is genuinely about twenty lines.

Then reality arrives.

## Bug one: `INSERT OR REPLACE` deletes

I used the obvious upsert:

```sql
INSERT OR REPLACE INTO records (id, title, version) VALUES (?, ?, ?)
```

SQLite implements `OR REPLACE` as a **delete followed by an insert**. Not an
update — a delete. So it fires `ON DELETE CASCADE`, and every outbox row that
pointed at that record went with it. Save a record twice offline, and the first
change was gone with no error anywhere.

```sql
INSERT INTO records (id, title, version) VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET title = excluded.title, version = excluded.version
```

I now have a contract test that both my SQLite store and my in-memory store have
to pass: *write the same record twice and the queue still has both entries.*
Anything that claims to be a store runs it.

## Bug two: two offline edits fight each other

Edit a record offline. Edit it again. Both entries are in the queue, and both
carry the version they were based on — say `v3`.

The first one pushes. The server accepts it and the record becomes `v4`. The
second one pushes, still claiming `v3`, and the server correctly rejects it as
stale.

The conflict is real, but it is *my own change conflicting with my own change*,
which is not a decision any user should be asked to make. The fix is a rebase:
after a successful push, walk the rest of the queue and bump any later entry for
that record to the version the server just handed back. Genuine conflicts —
someone editing on another device — still surface. Self-conflicts do not.

## Bug three: the fake server does not survive a restart

This one is a testing bug that looks like a product bug.

SQLite outlives the process. My fake server was an in-memory map, and it did
not. So on relaunch every queued change pushed a version the "server" had never
heard of, and the app produced a conflict for every record in the database.

```
Null check operator used on a null value
  fake_sync_server.dart:80
```

The fix is two lines — treat a missing server copy as a create, and seed the
fake from the store on open — but the lesson is broader: **a fake with a
different lifetime from the real thing produces bugs that are entirely yours.**

## Backoff, and the bit people skip

Retry with exponential backoff, a ceiling, and a bounded attempt count. The
ceiling matters more than the doubling: without one you reach delays of minutes
by attempt ten, and the device has been back on wifi for most of them.

The part usually skipped is **classification**. These are not the same failure:

- the request never reached the server → retry, and it costs nothing
- the server rejected it as stale → a conflict, needs a decision
- the server rejected it as malformed → retrying forever is a bug

A queue that treats all three as "failed, try again" is a queue that will spin on
a poisoned entry until someone clears app data.

## What I would tell myself a month ago

Write the conflict rule down *before* the code. Mine is one sentence — *last
write wins, unless the base version is stale, in which case the user chooses and
their choice rebases the rest of the queue* — and having it written meant the
implementation had something to be checked against instead of being its own
specification.

And test the ugly path. Not "it syncs" — *it syncs, after the app was killed
mid-flight, with two queued edits, one of which the server has already seen.*
