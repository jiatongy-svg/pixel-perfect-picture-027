# TripMatch

TripMatch is a private travel-matching app for USC Marshall MSBA students. Each student saves a **travel profile** (who they are as a traveler, whether they can drive, what group size they like) and one or more **plans** (a long break or a few weekends, where, budget, vibe). There are two ways in:

- **Match** — "I have a plan, find me people." Pairs and groups of 3–4 come back in one anonymous list, best first. When everyone taps **Interested**, a group chat opens, names appear, and the group locks in a final plan together.
- **Discover** — "Show me what's out there." Confirmed trips with open spots (join instantly, leave any time), plus every classmate's plan, anonymous.

Notifications are in-app only (the **My trips** page). There are no payments.

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
- **Demo sign-in (for presenting without signal):** set `DEMO_SIGNIN_EMAILS` (comma-separated) and `DEMO_SIGNIN_CODE` (8 digits) in Vercel and redeploy. Only those accounts can sign in with that fixed code, and no email is sent to them. Everyone else still gets an emailed code. Delete both variables afterwards to switch it off.
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
| `src/lib/matching.ts` | Trip score (pairs and groups in one list), reasons, hints, ranking |
| `src/lib/groupsize.ts` | Group-size preferences (2 / 3–4 / 5–6 / any), strict vs flexible |
| `src/lib/discover.ts` | Open trips on Discover: spots left, style signal, strict-size check |
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

**Hard rules.** A potential trip is not shown if any of these fail:

1. **Dates:** at least 2 shared days (or 1, if someone only wants a 1-day trip) inside everyone's free windows. Exact ("fixed") dates are never moved.
2. **Destination:** at least one place must work for everyone. "Only these" means only places on the list. "Or nearby" also accepts places within 250 km. "Anywhere" accepts everything. Two picks within 30 km count as the same place.
3. **Budget:** the ranges must overlap (touching counts).
4. **Group size (strict only):** if someone marked their group size as *Strict*, trips outside it are never shown to them. *Flexible* only lowers the score.

**Score (0–100):** dates 45 + destination 20 + group size 15 + budget 10 + style 10 (all in `constants.ts`).

- Dates: shared days divided by the shorter maximum trip length.
- Destination: 100% for a place everyone listed, 60% if it's "nearby" for someone, 40% if someone is "open".
- Group size: full points if the trip's size is in everyone's preferred range (2 / 3–4 / 5–6 / any), 40% if it's one step off. Each plan can override the profile's default (weekend vs long break).
- Budget: the overlap divided by the narrowest range.
- Style: shared vibes (half), similar pace (a quarter), and whether the trip can actually get there — a car, someone with a license who can rent, or a flight (a quarter).

Matches need **40+**. Groups of 3–4 are built from people who each fit you, and every pair inside must also score 40+. One list, sorted by score, then by the weakest pair, then smaller groups first. Hints say what someone would need to change ("shift your dates a bit"). Match never shows names.

## Trips (Match → chat → final plan)

1. Each person taps **Interested** on a match. When everyone has, the trip room opens with a group chat (it refreshes every few seconds) and conversation starters.
2. One person fills in the **final plan** checklist: exact dates and place, whether to open it to more people (how many, and when sign-ups close — default 48 h before the trip). Sending it counts as their acceptance.
3. Everyone else taps **Accept**. When everyone has accepted the same version, the trip is **confirmed**: contacts (email + optional phone/WeChat) are shared with members only, and there's an **Add to my calendar** (.ics) button.
4. If the group wanted more people, the trip appears on **Discover → Open trips**. Classmates join the plan as it is, up to the cap and before the deadline. Strict group-size users can't see or join trips beyond their limit. Flexible members get a "the group grew — stay or leave?" notice.
5. Once confirmed, everyone's plan for this trip is **booked**: it isn't matched again until they leave the trip. A plan can be in several trips that are still being worked out, but only one can be confirmed: the others show whose plan is already booked and refuse a final plan or accept.
6. Anyone can **leave** at any time. If a 2-person match loses a member before it's confirmed, it ends.
7. **No match after 24 h?** On a plan with no matches, you can end the search or tap **Still go** to post your own trip to Discover. You can also post a plan straight to Discover when you create it ("I'm going no matter what").

All of this runs through locked-down database functions (`start_trip`, `submit_final_plan`, `accept_proposal`, `join_trip`, `leave_trip`, …), so the rules hold even if someone skips the screens.

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
- Chat checks for new messages every 4 seconds rather than using live updates.
- Joining an open trip is instant (no host approval yet); the code is structured so approval can be added later.
- The "suggested plan" in the trip room is rules-based, not AI.

## Changelog

- **2026-10-22 (demo)** Optional fixed sign-in code for a few named demo accounts (`DEMO_SIGNIN_EMAILS` / `DEMO_SIGNIN_CODE`), for presenting where emails can't arrive. Off unless both are set.
- **2026-10-22 (fixes 2)** One plan, one confirmed trip: if the same plan is in two pending trips and one confirms, the other can't be confirmed (the trip room says whose plan is booked). Database: `migrations/007_one_trip_per_plan.sql`.
- **2026-10-22 (fixes)** A plan in a confirmed trip is now **booked**: it isn't matched again and isn't listed on Discover (no double-booking the same break); My plans shows a "Booked" badge, and leaving the trip frees the plan. The final-plan checklist now checks against the trip's own plans (older trips were compared with each member's newest plan). Calendar files escape semicolons correctly. Database: `migrations/006_booked_plans.sql`.
- **2026-10-22 (late night)** Match / Discover redesign. Pairs and groups in one anonymous list; new score (dates 45, destination 20, group size 15, budget 10, style 10). Profile: driver's license, "can rent a car", travel vibe, preferred group size for weekends and long breaks (strict or flexible), and an optional contact. Plans: "I'm willing to drive", per-plan group size, "going no matter what" publishing. Proposals/counters are replaced by **My trips**: mutual Interested → group chat → final-plan checklist → everyone accepts → contacts + calendar export. Discover (formerly Explore) gains **Open trips** you can join or leave. No-match plans can end the search or post their own trip. Database: `migrations/005_trips_chat_groups.sql`.

- **2026-10-22 (night)** Several plans per student (up to 5, "My plans"); each plan is matched on its own and proposals are tied to specific plans (`plan_key`), so the same people can have a winter and a spring proposal. Every Explore plan is clickable (`/explore/[planId]`) and shows a score for each of your plans with a breakdown; plans that don't line up show a "% fit" instead of "% match". Fixed: Explore reasons no longer include the classmate's name. Database: `migrations/004_multiple_plans.sql`.

- **2026-10-22 (evening)** Explore page (all classmates' plans, anonymous, best match first); filters (when, vibe, max budget, destination) on Explore and Matches; matches grouped by Thanksgiving / Winter / Spring / Weekends; profile shows as a short summary after saving; destinations can be any city worldwide (Open-Meteo city search) plus popular quick picks, with "nearby" = within 250 km; destination photos (Wikipedia, credited) and Google Maps links, and optional MBTI (from Steven's prototype; MBTI never affects the score); green + cream palette. Database: `migrations/003_places_and_mbti.sql`.

- **2026-10-22** Opened sign-in to every @usc.edu address (`allowed_domains` + `email_allowed()`, migration `002_open_to_usc.sql`). Email links are now scanner-safe (USC Outlook pre-opens links), and the 6-digit code is the main sign-in path. Email is sent through Brevo SMTP.

- **2026-10-21** First real build (replaces the Lovable prototype, which had no real sign-in or shared data):
  - Next.js and Supabase, with verified email sign-in and an allowlist enforced in the database.
  - Travel profile kept separate from the one current plan. Students can join with no destination ("open to anywhere") and pick one of three breaks or several weekends.
  - Pair and group matching, versioned proposals with atomic accept/counter/decline, a rules-based merge with cost estimates, and optional AI.
  - Unit tests and database RLS tests.
