# ADR 0003: The payout forecast, for BudgetMint

- **Status:** accepted (2026-11-10)
- **Scope:** what TaskMint publishes for other apps, the rules for
  BudgetMint's data, and what deleting the account deletes

## Context

BudgetMint is a bill tracker and cash-flow forecast that plans around the
withdrawals TaskMint says are coming. It runs on the same Firebase project
(`taskmint-f9a05`) and signs in with the same account, so it can read the
user's data under `users/{uid}`. But TaskMint stores only past withdrawals:
what the next ones take is worked out live, in TypeScript
(`usePayoutData` → `payoutCalculator` → `withdrawals`), from the ledger, the
sessions, the tasks and the settings. BudgetMint shouldn't copy that math,
or read TaskMint's sync documents, which are TaskMint's own business.

## Decisions

1. **TaskMint publishes a forecast**, `users/{uid}/published/payoutForecast`
   ([the contract](../contracts/payout-forecast.md)). It's a sibling of
   `data`, not a document in it: sync listens to all of `data`, and every
   TaskMint device would read every write.
2. **It's the withdrawable curve**, not the upcoming releases. What a
   withdrawal takes depends on the statuses and the last withdrawal
   (`withdrawableAt`); as a curve, `carried` plus a step per release time,
   it's what any later withdrawal takes, and the next one takes what the
   curve adds after it. `withdrawableAt` is now that curve
   (`withdrawableCurve`, `curveAt`), so Payouts and the forecast can't
   disagree; a seeded test checks it against the math it replaced.
3. **It doesn't depend on the clock.** Open timers are measured as of the
   latest moment one of them changed (and their steps say so, with their
   rate); steps released by the time the data was last written are folded
   into `carried`. So every device with the same data builds the same bytes,
   it's written only when the data changes, and it stays small.
4. **Any linked device publishes**, once it has the cloud's data and none is
   held for a newer TaskMint, 5 seconds after its forecast changes, in a
   transaction that writes only when the cloud's hash differs and its
   contract isn't newer. Devices and tabs with the same data write it once.
   A failure (an older ruleset, offline) is quiet and tried again in 5
   minutes: it isn't sync's.
5. **BudgetMint's data is `budgetmint/{uid}`**: an `{epoch}` document and
   `data/{kind~id}` documents of BudgetMint's own JSON (kinds `settings`,
   `item`, `occ`), laid out and guarded like TaskMint's. Its model can change
   without a rules change; a new kind needs one, here.
6. **The rules stay here**, and TaskMint's release deploys them. BudgetMint
   keeps a copy pinned to a TaskMint commit to test against, and its deploys
   can't touch the rules.
7. **Deleting:** Delete cloud data deletes the forecast with the rest (and
   BudgetMint keeps its data). Delete account deletes BudgetMint's data
   first, since without the account nobody could reach it.

## Consequences

- The forecast exists only while some TaskMint device syncs. It goes stale
  when none does; `asOfMs` and `lastImportMs` say how old it is.
- Writes: one per change of the payout data (timer starts and stops,
  imports, withdrawals), plus a read for the transaction. Well inside Spark's
  quotas.
- The contract is versioned (`schema`): a change a reader would misread
  bumps it, and the rules refuse writing an older one over a newer one.
- A known inaccuracy carries over: an entry re-imported unchanged keeps its
  `updatedAt` (since eadfc95), so an Untransferred one re-imported after a
  withdrawal looks taken by it, in Payouts and the forecast alike.
