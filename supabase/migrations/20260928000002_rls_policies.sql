-- =============================================================================
-- Chit Fund Analytics — Row Level Security Policies
-- Migration: 20260928000002_rls_policies.sql
-- =============================================================================
-- SECURITY MODEL:
--   This is a private single-family application.
--   Every table is protected by RLS.
--   Every policy is based on auth.uid() matching profile_id (or id for profiles).
--   No anonymous access. No cross-user access. No public read.
--
-- POLICY NAMING CONVENTION: <table>_<operation>_own
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS on all user-owned tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chit_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.context_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_rules      ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- profiles
-- Only the authenticated user can see/modify their own profile.
-- No delete policy (intentionally restrictive — profile is the auth anchor).
-- ---------------------------------------------------------------------------
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- No DELETE policy on profiles — use Supabase dashboard for account cleanup.

-- ---------------------------------------------------------------------------
-- chit_companies
-- ---------------------------------------------------------------------------
CREATE POLICY "chit_companies_select_own"
  ON public.chit_companies FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "chit_companies_insert_own"
  ON public.chit_companies FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "chit_companies_update_own"
  ON public.chit_companies FOR UPDATE
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "chit_companies_delete_own"
  ON public.chit_companies FOR DELETE
  USING (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- chits
-- ---------------------------------------------------------------------------
CREATE POLICY "chits_select_own"
  ON public.chits FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "chits_insert_own"
  ON public.chits FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "chits_update_own"
  ON public.chits FOR UPDATE
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "chits_delete_own"
  ON public.chits FOR DELETE
  USING (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- source_messages
-- No DELETE policy — source messages must be preserved permanently.
-- Use parse_status = 'SUPERSEDED' to logically retire a message.
-- ---------------------------------------------------------------------------
CREATE POLICY "source_messages_select_own"
  ON public.source_messages FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "source_messages_insert_own"
  ON public.source_messages FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "source_messages_update_own"
  ON public.source_messages FOR UPDATE
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- No DELETE on source_messages (intentional — raw messages must be preserved).

-- ---------------------------------------------------------------------------
-- auction_events
-- ---------------------------------------------------------------------------
CREATE POLICY "auction_events_select_own"
  ON public.auction_events FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "auction_events_insert_own"
  ON public.auction_events FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "auction_events_update_own"
  ON public.auction_events FOR UPDATE
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "auction_events_delete_own"
  ON public.auction_events FOR DELETE
  USING (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- ledger_entries
-- No UPDATE or DELETE policy — this is an append-only ledger.
-- Corrections must be made by inserting a new MANUAL_CORRECTION entry.
-- ---------------------------------------------------------------------------
CREATE POLICY "ledger_entries_select_own"
  ON public.ledger_entries FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "ledger_entries_insert_own"
  ON public.ledger_entries FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

-- No UPDATE on ledger_entries (append-only principle enforced at DB level).
-- No DELETE on ledger_entries (financial history must be preserved).

-- ---------------------------------------------------------------------------
-- context_events
-- ---------------------------------------------------------------------------
CREATE POLICY "context_events_select_own"
  ON public.context_events FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "context_events_insert_own"
  ON public.context_events FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "context_events_update_own"
  ON public.context_events FOR UPDATE
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "context_events_delete_own"
  ON public.context_events FOR DELETE
  USING (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- user_rules
-- ---------------------------------------------------------------------------
CREATE POLICY "user_rules_select_own"
  ON public.user_rules FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "user_rules_insert_own"
  ON public.user_rules FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "user_rules_update_own"
  ON public.user_rules FOR UPDATE
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "user_rules_delete_own"
  ON public.user_rules FOR DELETE
  USING (auth.uid() = profile_id);


-- =============================================================================
-- AUTO-CREATE PROFILE ON AUTH SIGNUP
-- When a new user signs up via Supabase Auth, automatically create
-- a matching profiles row. Runs as SECURITY DEFINER (elevated privilege)
-- so that the trigger can INSERT into profiles during the auth flow.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NULL)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
