// ---------------------------------------------------------------------------
// Supabase connection.
//
// Leave these blank to run in DEMO MODE: the waitlist is kept in the browser's
// own storage so you can click through both apps on one machine. Two tabs on
// the same browser stay in sync; two different phones do NOT.
//
// To go live, create a project at https://supabase.com, run schema.sql in the
// SQL editor, then paste the Project URL and the anon/public key below.
// (Settings -> API. The anon key is safe to ship in front-end code.)
// ---------------------------------------------------------------------------

export const SUPABASE_URL = 'https://cnwvjvmnqzigllmrfxix.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNud3Zqdm1ucXppZ2xsbXJmeGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4OTM4OTUsImV4cCI6MjEwMjQ2OTg5NX0.CDNquBkba2mRYF9lh8Vn7Wa_a2mE51rVQb8fImKM-dM';

// There is no admin password any more. Admin access is Google sign-in checked
// against the `admin_emails` table, enforced by row level security in Postgres
// rather than by anything in this file. Manage the list in the settings screen.
