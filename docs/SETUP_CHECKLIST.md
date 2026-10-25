# TripMatch setup checklist

Follow these steps in order. Each one ends with **How to know it worked**. If a step fails, check the troubleshooting list at the bottom before moving on.

You'll need about an hour, a laptop, and:

- the 6 pilot email addresses
- a GitHub account
- Node.js 22 or newer (download the "LTS" version from nodejs.org). To check, open Terminal and type `node -v`.

---

## 1. Create the Supabase project (database + sign-in)

1. Go to **supabase.com**, then **Start your project**, and sign in with GitHub.
2. Click **New project**.
   - Name: `tripmatch`
   - Database password: click **Generate a password**, then save it in your password manager. You won't need it day to day.
   - Region: **West US (North California)** (closest to USC).
3. Click **Create new project** and wait about 2 minutes.
4. Open **Project Settings** (gear icon) → **API Keys** (on some projects, **API**). Copy these into a private note:
   - **Project URL**: looks like `https://abcd1234.supabase.co`
   - **anon / public key** (newer projects call it the **publishable** key, `sb_publishable_…`). This one is safe to put in the browser.
   - **service_role key** (newer projects call it the **secret** key, `sb_secret_…`). **This is a master key.** It skips every security rule. Never paste it into chat, email, GitHub, or any variable whose name starts with `NEXT_PUBLIC_`.

**How to know it worked:** the project dashboard opens, and you have three values saved.

## 2. Set up sign-in

1. Go to **Authentication → Sign In / Providers**.
   - Under **Email**, make sure **Enable Email provider** is on.
   - Turn **off** **Allow new users to sign up**. This is what keeps the pilot private: only the 6 accounts the seed script creates can sign in.
2. Go to **Authentication → URL Configuration**.
   - **Site URL:** `http://localhost:3000` for now. You'll change it to the Vercel URL in step 7.
   - **Redirect URLs:** add `http://localhost:3000/**`. You'll add the Vercel one in step 7.
3. **Set up custom SMTP first.** Supabase only lets you edit email templates once custom SMTP is on, and its built-in sender allows just a few emails an hour. We use **Brevo** (free, 300 emails/day):
   - Sign up at brevo.com. A @usc.edu address works for the account itself.
   - In Brevo, go to **Senders** and add a sender whose address is **not** @usc.edu (for example a 163, Gmail or Outlook address), then verify it. Sending "as" @usc.edu from Brevo gets silently quarantined by USC's mail filter.
   - In Brevo, go to **SMTP & API → SMTP**, note the **Login** (`…@smtp-brevo.com`), and click **Generate a new SMTP key**.
   - In Supabase, go to **Authentication → Emails → Set up SMTP** and fill in: sender email = the verified non-USC address, sender name `TripMatch`, host `smtp-relay.brevo.com`, port `587`, username = the Brevo Login, password = the SMTP key.
   - Later, for a full-cohort launch, buy a domain and authenticate it in Brevo so emails reliably reach the inbox.
4. Go to **Authentication → Emails → Magic Link**. Set the subject to `Your TripMatch sign-in code`, switch the body to **Source**, and replace it with the contents of `supabase/email-template.html`:

   ```html
   <h2>Your TripMatch sign-in code</h2>
   <p style="font-size:24px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
   <p>Or tap to sign in on this device:
     <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in to TripMatch</a></p>
   <p>If you didn't ask for this, you can ignore it.</p>
   ```

   Then scroll down and click **Save changes**. Students type the code on any device. If they tap the link instead, they land on a "Finish signing in" page with a button. That extra step is deliberate: USC's Outlook "Safe Links" opens every link to scan it, which would otherwise use up the one-time link before the student clicks it.

**How to know it worked:** "Allow new users to sign up" shows as off, and the template preview shows `{{ .Token }}`.

## 3. Create the database tables and security rules

1. In Supabase, open **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this project. Copy **all** of it, paste it into the editor, and click **Run**.

Already set up before? Run only the newest files in `supabase/migrations/` that you haven't run yet, in order (`002` … `007`). Each one is safe to run twice.

**How to know it worked:** you see "Success. No rows returned". **Table Editor** lists `allowed_emails`, `profiles`, `travel_plans`, `match_passes`, `proposals`, `proposal_members`, `proposal_versions`, `proposal_approvals`, and `confirmed_itineraries`. Each one has a shield icon showing **RLS enabled**. **Storage** shows a private bucket called `avatars`.

## 4. Run the app on your laptop

1. Open Terminal in the project folder and run:

   ```bash
   npm install
   ```

2. Copy `.env.example` to a new file named `.env.local`, then fill it in:
   - `NEXT_PUBLIC_SUPABASE_URL`: the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the anon/publishable key
   - `SUPABASE_SERVICE_ROLE_KEY`: the service_role/secret key
   - `PILOT_ALLOWLIST`: the 6 emails, separated by commas, for example `a@usc.edu,b@usc.edu,…`
   - `ENABLE_AI_MERGE=false`

   `.env.local` is listed in `.gitignore`, so git will never upload it.

**How to know it worked:** `.env.local` exists and has no empty values, except `ANTHROPIC_API_KEY`.

## 5. Create the 6 pilot accounts

```bash
npm run seed
```

**How to know it worked:** it prints `Done. Allowlist has 6 emails. Created 6 new account(s)…`. In Supabase, **Authentication → Users** shows 6 users, and **Table Editor → allowed_emails** shows 6 rows. Running it again is safe: it will say `0 new`.

## 6. Try it locally

```bash
npm run dev
```

Open http://localhost:3000, enter your own pilot email, and type the code from the email.

**How to know it worked:** you land on "Welcome to TripMatch". Now try an email that is **not** on the list: you should see "This pilot is private".

Optional security check, after at least 2 pilot users have saved a profile:

```bash
npm run rls-check
```

Every line should say `PASS`.

## 7. Put it online (GitHub + Vercel)

1. On **github.com**, click **New repository**. Name it `tripmatch`, choose **Private**, and click **Create**.
2. In Terminal, in the project folder, save everything as a first commit. `.env.local` is ignored automatically, so your keys stay local.

   ```bash
   git add -A && git commit -m "TripMatch pilot" && git branch -M main
   ```

   Then run the commands GitHub shows under "…push an existing repository". They look like this:

   ```bash
   git remote add origin https://github.com/<you>/tripmatch.git
   git push -u origin main
   ```

3. Go to **vercel.com** and sign in with GitHub. Click **Add New… → Project**, then **Import** the `tripmatch` repo.
4. Before clicking Deploy, open **Environment Variables** and add every variable from your `.env.local` **except** `PILOT_ALLOWLIST`. Vercel doesn't need that one.
   - If the code lives on a branch (for example `tripmatch-nextjs`), go to **Settings → Environments → Production → Branch Tracking** after importing, set it to that branch, and redeploy.
5. Click **Deploy**.
6. Go back to Supabase → **Authentication → URL Configuration**:
   - Change **Site URL** to your `https://…vercel.app` URL.
   - Add `https://…vercel.app/**` to **Redirect URLs**. Keep the localhost one.

**How to know it worked:** opening the Vercel URL on your phone shows the TripMatch sign-in page over HTTPS, and you can sign in with a code.

## 8. Optional: AI-assisted merge (off by default)

The app works fully without AI. To try it:

1. Create a key at **console.anthropic.com → API Keys**.
2. In Vercel, add `ANTHROPIC_API_KEY` (secret) and set `ENABLE_AI_MERGE=true`, then redeploy.

The AI only picks from options the rules already checked, and everything it returns is re-checked. If anything is off, the app quietly falls back to the standard plan and shows a note.

## 9. Invite the other 5 students

Send them something like:

> Hi! You're one of 6 MSBA students piloting **TripMatch**, a tool for finding classmates whose break plans line up. Open **https://…vercel.app** on your phone, enter **this email address** (the one I'm messaging), and type the 6-digit code we email you. It takes about 5 minutes to set up your travel profile and one plan. No destination yet? That's fine, just pick when you're free. Check **Proposals** in the app now and then; there are no notifications.

What they'll see on first login:

1. A sign-in code email from Supabase. Check spam if it isn't there within a minute.
2. **Travel profile:** name, MSBA year, an optional photo, travel experience, pace, lodging, and gear they own.
3. **Their plan:** a long break or weekends, destinations (or "open to anywhere"), budget, vibes, and what they'll bring.
4. **Matches:** classmates who line up, or a "waiting on classmates — X of 6 joined" message.

---

## Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| Brevo says "Delivered" but nothing arrives at @usc.edu | Sender address is @usc.edu (USC quarantines it) | Use a non-USC verified sender in Brevo + Supabase SMTP settings |
| Link says expired right away | Outlook pre-scanned it | Type the code from the email instead |
| The email link opens `localhost` on your phone | Supabase **Site URL** is still localhost | Step 7.6: set the Site URL to the Vercel URL. Typing the code always works too. |
| "This pilot is private" for a pilot student | Their email isn't in `allowed_emails`, or it's spelled differently | Fix `PILOT_ALLOWLIST` in `.env.local` and run `npm run seed` again |
| "Too many sign-in emails" | Supabase's built-in email limit | Wait an hour, or set up custom SMTP (step 2 note) |
| Code says "didn't work" | Code expired (about 1 hour), or an older code was used | Tap **Resend code** and use the newest one |
| `permission denied` or `row-level security` errors in Vercel logs | `schema.sql` didn't fully run, or someone is signed in but not allowlisted | Re-check step 3; run `npm run seed` |
| `Missing environment variable …` | A variable wasn't added in Vercel | Vercel → Settings → Environment Variables → add it → Redeploy |
| `npm run seed` says `relation "allowed_emails" does not exist` | Step 3 wasn't run | Run `supabase/schema.sql` |
| Photo upload fails | The file is over 2 MB or not JPG/PNG/WebP | Use a smaller photo |
| `node: bad option: --experimental-strip-types` | Node is older than 22.6 | Install the current Node LTS |
