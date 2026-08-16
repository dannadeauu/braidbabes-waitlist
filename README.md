# braidbabes waitlist

Two small web apps that together run a walk-up waitlist:

| | who uses it | what it does |
|---|---|---|
| **`/customer/`** | guests, via the QR code | pick a service, join the line, watch your wait |
| **`/admin/`** | you | see the queue, notify people, remove them, edit settings |

Plain HTML/CSS/JS — no build step, no npm, nothing to install.

---

## Run it

From this folder:

```bash
python3 -m http.server 8123
```

Then open <http://localhost:8123>. That launcher page links to both apps.

It has to be served over `http://` rather than opened as a `file://` path —
the apps use ES modules, which browsers block on `file://`.

---

## Supabase is connected

The keys in [`shared/config.js`](shared/config.js) point at project
`cnwvjvmnqzigllmrfxix`, the schema has been run, and the whole flow is verified
end to end — joining writes a row, the admin list reads it, and removing someone
clears the waitlist off their phone.

If you ever blank out the two keys, the apps fall back to **demo mode**: the
waitlist lives in one browser only, and the admin screen shows an orange banner
saying so. Useful for testing changes without touching real event data.

<details>
<summary>Setting up a different Supabase project</summary>

### Going live with Supabase

1. Sign up at <https://supabase.com> and click **New project**. Any name; pick
   the region closest to your events. It takes a minute or two to spin up.
2. In the left sidebar open **SQL Editor → New query**. Paste in the entire
   contents of [`schema.sql`](schema.sql) and hit **Run**. You should get
   "Success. No rows returned." The file is safe to re-run.
3. Go to **Project Settings → API** (gear icon, bottom left). Copy two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon / public** key — a long string starting `eyJ...`
4. Paste both into [`shared/config.js`](shared/config.js):

   ```js
   export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```

5. Reload the admin app. **The orange demo banner disappearing is your
   confirmation it worked.** If something's off you'll get a plain-English
   error in the queue instead of a blank screen.

Take the *anon / public* key, never the `service_role` key — that one bypasses
all security rules and must never reach a browser. The anon key is designed to
be public.

</details>

## Setting up Google sign-in

Do this once, before the admin app will let anyone in.

### 1. Make a Google OAuth client

1. Go to <https://console.cloud.google.com> and create a project (any name).
2. **APIs & Services → OAuth consent screen.** Choose **External**, fill in an
   app name and your email, save. You can leave it in "Testing" mode — just add
   every admin's Gmail under **Test users**, or hit **Publish app** to skip that.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**,
   type **Web application**.
4. Under **Authorised redirect URIs** add exactly this:

   ```
   https://cnwvjvmnqzigllmrfxix.supabase.co/auth/v1/callback
   ```

5. Copy the **Client ID** and **Client secret**.

### 2. Tell Supabase about it

1. **Authentication → Providers → Google.** Enable it, paste the client ID and
   secret, save.
2. **Authentication → URL Configuration.** Set **Site URL** to your live admin
   URL, and add both of these under **Redirect URLs**:

   ```
   https://<username>.github.io/<repo>/admin/
   http://localhost:8123/admin/
   ```

   The localhost one is what lets you test before deploying.

### 3. Sign in

Open the admin app, hit **continue with google**, pick
`daniellenadeau42@gmail.com`. You should land on the waitlist. Any other account
gets a polite "this account isn't approved" screen instead.

## Publishing to GitHub Pages

1. Create a repo and push this folder to it.
2. **Settings → Pages → Build and deployment**, source **Deploy from a branch**,
   branch `main`, folder `/ (root)`. Save.
3. A minute later you're live at `https://<username>.github.io/<repo>/`.
4. Add that `/admin/` URL to Supabase's redirect list (above) — sign-in fails
   without it.
5. Point your QR code at `https://<username>.github.io/<repo>/customer/`.

All paths in the apps are relative, so serving from a `/<repo>/` subfolder works
as-is. The `.nojekyll` file stops GitHub from running the site through Jekyll.

The repo can be public. The anon key is designed to be published, and it no
longer grants access to anyone's personal details.

---

## How the wait time is calculated

Each service has a **length (per braider)**. The app models your braiders as
chairs running in parallel: each person in line goes to whichever braider frees
up first.

With two 30-minute braids and one 15-minute tinsel in line:

| braiders | person 1 | person 2 | person 3 |
|---|---|---|---|
| 1 | no wait | 30 mins | 45 mins |
| 2 | no wait | no wait | 30 mins |

Leaving **# of braiders** blank is treated as 1.

Two numbers show on each admin row, and they mean different things:

- **`waiting for: 20 mins`** — how long they've *already* been in line
- **`up next` / `up in about 30 mins`** — how much longer until their turn

The mockup only had one line; I kept both because they answer different
questions during a busy event. Say the word and I'll drop either one.

Customers see whichever of **hours/minutes remaining** and **place in line** you
tick under *displayed wait* in settings.

---

## What the customer's phone remembers

When someone joins, their entry id, name, and phone are saved to their own
device's `localStorage`. So:

- refreshing, or closing and reopening the tab, drops them back on their status
  screen instead of the join form
- the moment you tick the green check, their phone clears itself and shows a
  short "you're all set!" note

They can also remove themselves with **leave waitlist**.

---

## SMS is stubbed

The bell, the per-person **message** button, and **message everyone** currently
record that someone was notified — that's what drives the `1m ago` badge — but
**no text is actually sent**. Every toast says so explicitly.

To wire it up, fill in one function: `sendSms()` at the top of
[`admin/app.js`](admin/app.js).

A Twilio auth token must **never** sit in front-end code — anyone viewing source
could send texts on your account. Put the credentials in a Supabase Edge
Function (or any small server) and have `sendSms()` POST to that.

---

## Who can get into the admin app

There's no password. Admins sign in with Google, and only addresses listed in
the `admin_emails` table are let through. `daniellenadeau42@gmail.com` is seeded
by `schema.sql`; add more from **settings → who can manage this waitlist**.

The check happens in Postgres, not in the browser. Every admin policy calls an
`is_admin()` function that looks your signed-in email up in that table, so
editing the JavaScript or forging a request gets you nothing.

Two guards against locking yourself out: you can't remove your own address from
the list, and the database refuses to delete the last remaining admin.

### What a guest can and can't see

Guests are anonymous — no sign-in for the QR code. They reach the queue through
three functions (`queue_summary`, `join_waitlist`, `leave_waitlist`) rather than
the table itself, and **none of them return a name or a phone number.** All a
guest can learn is how many people are ahead and what services they picked,
which is exactly what the wait estimate needs.

Reading the table directly requires a signed-in admin. With just the public anon
key you get nothing:

```
curl "https://<project>.supabase.co/rest/v1/waitlist_entries?select=*" \
  -H "apikey: <anon key>"
→ []
```

The guest's own name and phone are only ever stored in their own phone's
`localStorage`, which is what the status screen reads.

---

## Fonts

- **Montserrat** for everything — the dominant sans on braidbabes.com.
- **Twister** for the "Waitlist" / "Admin" signature, matching the Canva
  mockup. It's a Canva-licensed font, loaded here from Canva's public font CDN.
  It renders correctly today, but that URL is Canva's, not yours — if it ever
  stops resolving the text falls back to **Caveat**, the closest free match.

  For something fully under your control, export those two words as PNGs from
  the Canva design and swap them in for the `.script` element, or license
  Twister and self-host the `.woff2`. Both are a one-line change in
  [`shared/styles.css`](shared/styles.css).

The photo banner is [`assets/header.jpg`](assets/), already in place. It's drawn
with no overlay on top, so any shading needs to be baked into the image itself.

---

## Files

```
index.html            launcher page (testing only)
schema.sql            Supabase tables + policies
customer/             pages 1 & 2 — join, status
admin/                pages 3, 4, 5 — password, queue, settings
shared/
  config.js           Supabase keys + admin password
  db.js               data layer (supabase / local adapters)
  waitlist.js         wait-time math, formatting
  ui.js               icons, wordmark, toast, confirm dialog
  styles.css          design tokens + components
assets/header.jpg     photo banner for the customer screens
```
