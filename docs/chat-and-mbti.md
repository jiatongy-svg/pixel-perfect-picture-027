# Chat and MBTI branch

## Available now

- Continue enters the prototype without sending an email, password, or code.
- Trip assistant handles travel ideas and app help. With the existing server-side LOVABLE_API_KEY it uses the existing Lovable AI gateway. Without it, or on gateway failure, it clearly switches to built-in app guidance. It cannot book trips, send traveler messages, or change profiles. Only user-entered assistant messages and selected trip context are passed to the assistant. Do not put private details in it.
- Optional MBTI in the profile. Shared-letter comparison is 0–100%, with 25 percentage points per matching letter. Matching gets at most five extra points, only after travel preferences already qualify. MBTI cannot cross break boundaries or turn an unqualified match into a qualified one. Unknown types stay unknown.
- Matched-plan and trip views show each member's average similarity to the other members who provided a type. Existing trips are pairs; the calculation also supports larger lists.
- Sample profiles are explicitly labeled. Their traveler-chat view is a local-only demo. It never sends to a real recipient or invents replies from one.

## Backend setup still required

The checked-out environment has only publishable backend credentials. It has no database migration connection, service-role key or Lovable AI key. None has been invented or copied into the client.

The backend owner must apply `drizzle/migrations/0001_chat_mbti.sql` through their normal Lovable/Drizzle migration process or SQL editor. It adds a nullable MBTI field and a private messages table. Until applied, MBTI gracefully stays local when the backend reports a missing column. No sample users get fabricated MBTI values.

Private messages always require a verified USC session, including when prototype Continue is enabled. The server verifies the session, proposal membership, non-sample profiles and mutual acceptance before reading/writing. RLS also restricts direct database access to verified participants. Duplicate retries reuse a client UUID. Text is limited to 1,000 characters. The UI refreshes an open real thread every 10 seconds and keeps unsent text on failure.

Apply the migration, connect verified authentication, then test two real accounts: send/reply, refresh, retry a send, decline the proposal, and attempt access from a third account. This cross-device/database test has NOT been completed locally because the backend credentials and verified sessions are unavailable. Do not advertise private live chat as activated before this test.

The expanded profile, mutual-confirmation migration and current validation are documented in [profile-plans-and-design.md](./profile-plans-and-design.md).
