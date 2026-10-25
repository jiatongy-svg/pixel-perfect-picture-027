# Manual multi-user test script

Run this on the **deployed** URL with 2–6 real pilot students, each on their own phone or laptop. Mark each step Pass, Fail, or Skipped, and note what you saw. It takes about 30 minutes with 3 people.

People: **A** (you), **B**, **C**. Use the real pilot accounts. Don't invent extra users.

## Part 1 — Sign-in and the empty states

| # | Who | Do this | Expected |
|---|---|---|---|
| 1 | A | Open the URL and enter an email that is **not** in the pilot | "This pilot is private". The page doesn't say who is on the list. |
| 2 | A | Sign in with A's pilot email; type the code | Lands on "Welcome to TripMatch" (profile step) |
| 3 | A | Save a profile, then click **Skip for now** on the plan step | Matches says "Add your plan to see matches" *(acceptance test 9, case c)* |
| 4 | A | Save a plan: Thanksgiving break, any days, 3–4 days, Joshua Tree, budget $150–$400, outdoors + food | Matches says "Waiting on classmates — 1 of 6 have joined" *(acceptance test 9)* |

## Part 2 — Two people match

| # | Who | Do this | Expected |
|---|---|---|---|
| 5 | B | On B's own device: sign in, save a profile, save a **different** plan: Thanksgiving, exact dates Nov 26–28, Joshua Tree **or nearby**, $200–$500, outdoors, bring car with 3 seats | Saves without errors *(acceptance test 1)* |
| 6 | A, B | Each opens Matches | Each sees the other with a score and at least 2 reasons. Nobody sees themselves. No unfamiliar names. *(acceptance tests 2 and 3)* |
| 7 | B | Sign out (Profile → Sign out), then sign in on a **different** device or browser | B's profile and plan are still there *(acceptance test 4)* |

## Part 3 — Proposals, counters, confirmation

| # | Who | Do this | Expected |
|---|---|---|---|
| 8 | A | On B's card, **double-click** "Propose a trip" quickly | Exactly one proposal opens. A shows as "Accepted" for v1. |
| 9 | B | Open **Proposals** | The proposal is under "Needs your response" as Pending, with A accepted *(acceptance test 5)* |
| 10 | B | **Counter**: change the end date to one day earlier, add a note, send | Version 2 appears. **Nobody** is marked accepted anymore, including A. *(acceptance test 6)* |
| 11 | A | Without refreshing the page from step 8, click **Accept v1** | "This proposal changed. Refresh to see the latest version." *(stale-version test)* |
| 12 | A | Refresh, then **Accept v2** | A is accepted; still Pending |
| 13 | B | **Accept v2** | Status becomes Confirmed. Both A and B can open the confirmed trip page. *(acceptance test 7)* |

## Part 4 — Conflicts and passes

| # | Who | Do this | Expected |
|---|---|---|---|
| 14 | C | Save a plan with **exact dates** Nov 25–26 and Joshua Tree **only** | — |
| 15 | B | Change B's plan to exact dates Nov 28–29 | — |
| 16 | B | Open Matches | C is **not** listed for B (their dates can't overlap) |
| 17 | A | Click **Pass** on C | C disappears for A only. C still sees A. |
| 18 | A | Open a proposal with C (if one exists), click **Counter**, and pick dates outside C's fixed dates | A plain message that names C and the conflict, e.g. "… is outside C's availability" *(fixed-constraint test)* |

## Part 5 — Groups (needs 3+ people with compatible plans)

| # | Who | Do this | Expected |
|---|---|---|---|
| 19 | A | Matches → **Groups** tab | Groups of 3–4 with "All three of you can travel …" style reasons |
| 20 | A | Propose a group trip; B and C each accept the same version | Confirmed only after **all three** accept |

## Part 6 — Database-level security (owner only, laptop)

| # | Do this | Expected |
|---|---|---|
| 21 | `npm run rls-check` (needs `.env.local` with the real keys) | Every line says `PASS` *(acceptance test 8)* |
| 22 | `npm test` | All unit and database tests pass |

## Part 7 — All 6 users *(acceptance test 10)*

Once all 6 students have saved plans, each person opens Matches and Proposals. Expected: everyone sees real classmates only, the header says "6 of 6 pilot classmates have joined", and nothing errors.
