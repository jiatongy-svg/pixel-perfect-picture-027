# TripMatch

TripMatch is a private travel-matching app for USC Marshall MSBA students. Each student saves a **travel profile** (who they are as a traveler) and **one current plan** (a long break or a few weekends, where, budget, vibe, and what they can bring). The app shows which classmates (or groups of 3–4) actually line up, and why. Two or more students can then turn a match into a merged trip, counter it, and confirm it once everyone accepts the same version.

This is a pilot for 6 real students. There's no chat, no payments, and no notifications: students check **Proposals** in the app.

- **Setting it up?** Follow [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md).
- **Testing with real people?** Follow [MANUAL_TEST_SCRIPT.md](MANUAL_TEST_SCRIPT.md).

---

## How it works

```
Phone/laptop ──HTTPS──> Next.js on Vercel ──> Supabase (sign-in + Postgres)
                          │                     │
                          │ pages & server      │ Row Level Security on every table
                          │ actions run here    │ proposal changes via locked-down functions
                          └ matching + merge    └ private photo storage
                            are plain code (no AI)
```

- **Sign-in:** the student types their email and gets a one-time code (or link). Who may sign in is decided in the database: individual emails in `allowed_emails`, plus whole domains in `allowed_domains` (currently `usc.edu`, so any USC student can join). The server checks this *before* sending a code, and RLS checks it again on every read and write.
- **Access modes:** to go back to a closed pilot, run `delete from public.allowed_domains where domain = 'usc.edu';` and turn off "Allow new users to sign up" in Supabase. To reopen, run `supabase/migrations/002_open_to_usc.sql` again.
- **Who sees what:** you can read and edit only your own profile and plan. Classmates see your profile and the matching-relevant parts of your plan through the `plan_cards` view. They never see your email or your private notes. Only a proposal's members can see that proposal.
- **No stale data:** every page is rendered fresh (`force-dynamic`), so matches always use the latest saved plans.

## Where things are

| Path | What it is |
|---|---|
| `src/lib/constants.ts` | **Every tunable number:** score weights, thresholds, group size, cost ranges |
| `src/lib/catalog.ts` | Breaks, vibes (with descriptions), equipment, popular destinations |
| `src/lib/places.ts` | Places anywhere in the world: distance, labels, world city search, trip details for any city |
| `src/lib/filters.ts` | The filter bar on Explore and Matches |
| `src/lib/feasibility.ts` | Hard checks: dates, destination, budget (works for 2–4 people) |
| `src/lib/matching.ts` | Pair score, group score, reasons, ranking |
| `src/lib/merge.ts` | Rules-based merged trip, transport, gear, outline, cost estimate |
| `src/lib/ai-merge.ts` | Optional AI polish (off by default), re-checked by the rules |
| `src/lib/validation.ts` | Server-side input checks with friendly messages |
| `src/app/actions.ts` | Every button that changes data |
| `src/app/(app)/…` | Pages: matches, proposals, trips, plan, profile, onboarding |
| `supabase/schema.sql` | Tables, RLS policies, proposal functions, photo storage rules |
| `scripts/seed-pilot-users.ts` | Creates the 6 accounts and fills the allowlist |
| `scripts/rls-check.ts` | Proves the security rules on the real project |
| `tests/` | Unit tests and database tests |

## Matching, in plain English

**Hard rules.** A pair is not shown if any of these fail:

1. **Dates:** there must be at least 2 shared days (or 1, if someone only wants a 1-day trip) inside both people's free windows. Exact ("fixed") dates are never moved.
2. **Destination:** at least one place must work for both. "Only these" means only places on the list. "Or nearby" also accepts places within 250 km of one on the list. "Anywhere" accepts everything. Two picks within 30 km count as the same place.
3. **Budget:** the ranges must overlap (touching counts).

**Score (0–100):** dates 35 + destination 30 + budget 20 + vibes 15.

- Dates: shared days divided by the shorter of the two maximum trip lengths.
- Destination: 100% for a place you both listed, 60% if it's "nearby" for one of you, 40% if one of you is "open".
- Budget: the overlap divided by the narrower range.
- Vibes: shared tags divided by all tags picked.

Matches need **40+**. The page shows the top 5, ties sorted by user id.

**Groups (3–4 people):** every pair must pass on its own *and* the whole group must share a date window, a destination, and a budget range. The group score is the average of all pair scores. Ties go to the stronger weakest pair, then to sorted ids. Passing on a person also hides groups that include them.

## Proposals

- **Propose** saves everyone's plan snapshot and the merged trip as **version 1**. It also records the proposer's acceptance of v1; the card says so before you click.
- **Counter** creates version N+1 with a new destination and/or dates. All earlier acceptances stop counting, including the counterer's, who must click Accept again.
- **Accept** applies to one specific version. If the version changed in the meantime, the database refuses with "This proposal changed. Refresh to see the latest version."
- The trip is **confirmed** only when every member has accepted the same current version.
- **Decline** ends the proposal for everyone. **Pass** on a match hides it only for you.
- Only one open proposal can exist per group of people, and a double-click returns the same one.

## Commands

```bash
npm install        # once
npm run dev        # local app at http://localhost:3000
npm test           # unit + database tests (no internet or keys needed)
npm run typecheck  # TypeScript check
npm run seed       # create/sync the 6 pilot accounts (needs .env.local)
npm run rls-check  # security checks against the real Supabase project
```

## Known gaps

- Rate limiting relies on Supabase Auth defaults (about 1 sign-in email per address per minute, plus a low project-wide cap with the built-in email sender). There is no extra app-level rate limit on server actions. For 6 known users, this is acceptable.
- Cost numbers are broad ranges from `constants.ts`, not live prices.
- `superseded` exists as a proposal status but isn't used yet.

## Changelog

- **2026-10-22 (night)** Several plans per student (up to 5, "My plans"); each plan is matched on its own and proposals are tied to specific plans (`plan_key`), so the same people can have a winter and a spring proposal. Every Explore plan is clickable (`/explore/[planId]`) and shows a score for each of your plans with a breakdown; plans that don't line up show a "% fit" instead of "% match". Fixed: Explore reasons no longer include the classmate's name. Database: `migrations/004_multiple_plans.sql`.

- **2026-10-22 (evening)** Explore page (all classmates' plans, anonymous, best match first); filters (when, vibe, max budget, destination) on Explore and Matches; matches grouped by Thanksgiving / Winter / Spring / Weekends; profile shows as a short summary after saving; destinations can be any city worldwide (Open-Meteo city search) plus popular quick picks, with "nearby" = within 250 km; destination photos (Wikipedia, credited) and Google Maps links, and optional MBTI (from Steven's prototype; MBTI never affects the score); green + cream palette. Database: `migrations/003_places_and_mbti.sql`.

- **2026-10-22** Opened sign-in to every @usc.edu address (`allowed_domains` + `email_allowed()`, migration `002_open_to_usc.sql`). Email links are now scanner-safe (USC Outlook pre-opens links), and the 6-digit code is the main sign-in path. Email is sent through Brevo SMTP.

- **2026-10-21** First real build (replaces the Lovable prototype, which had no real sign-in or shared data):
  - Next.js and Supabase, with verified email sign-in and an allowlist enforced in the database.
  - Travel profile kept separate from the one current plan. Students can join with no destination ("open to anywhere") and pick one of three breaks or several weekends.
  - Pair and group matching, versioned proposals with atomic accept/counter/decline, a rules-based merge with cost estimates, and optional AI.
  - Unit tests and database RLS tests.
