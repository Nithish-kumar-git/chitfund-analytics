-- =============================================================================
-- Chit Fund Analytics — Initial Schema
-- Migration: 20260928000001_initial_schema.sql
-- =============================================================================
-- FINANCIAL DISCLAIMER:
--   This schema tracks real chit fund activity.
--   Several financial rules (winner payout mechanics, maturity settlement,
--   special-round behaviour) are explicitly NOT codified because they have not
--   been verified from source data. Fields that encode those unknowns are
--   nullable. Do not infer rules not present in this file.
--
-- KNOWN VERIFIED FORMULA (normal auction only):
--   net_thallu           = thallu - commission
--   member_thallu        = net_thallu / member_count
--   non_winner_payment   = base_installment - member_thallu
--
-- UNVERIFIED (do NOT implement until confirmed):
--   - winner payout amount
--   - whether winner payout deducts commission
--   - maturity settlement mechanics
--   - special second-round rules
--   - legal/industry thallu bounds
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: updated_at auto-stamp trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- =============================================================================
-- TABLE 1: profiles
-- Purpose: Application user profile linked to Supabase Auth.
--          One profile per authenticated user; id mirrors auth.users(id).
-- =============================================================================
CREATE TABLE public.profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.profiles IS
  'Application user profile. id mirrors auth.users(id). Created automatically on first sign-in.';
COMMENT ON COLUMN public.profiles.display_name IS
  'Optional user-facing name (e.g. "Ravi Family").';

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- =============================================================================
-- TABLE 2: chit_companies  (optional but fits the architecture cleanly)
-- Purpose: Track the chit company (e.g. "Shriram Chits").
--          A chit does NOT require a company — company_id is nullable on chits.
-- =============================================================================
CREATE TABLE public.chit_companies (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  contact_info TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.chit_companies IS
  'Optional lookup for chit companies (Shriram, Margadarsi, etc.). '
  'Not required for a chit to exist — chits.company_id is nullable.';

CREATE TRIGGER chit_companies_updated_at
  BEFORE UPDATE ON public.chit_companies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- =============================================================================
-- TABLE 3: chits
-- Purpose: One complete chit scheme / investment.
--          A chit has a fixed face value, duration, member count, and
--          installment. Commission is configurable — NOT hardcoded at 2.5%.
--
-- DESIGN NOTE on face_value ≈ base_installment × member_count:
--   This is an expected financial relationship, NOT an absolute law.
--   Real chits may have rounding or administrative adjustments.
--   The relationship is enforced by application logic, not a DB constraint.
-- =============================================================================
CREATE TABLE public.chits (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  face_value       NUMERIC(15,2) NOT NULL,
  duration_months  INTEGER     NOT NULL,
  member_count     INTEGER     NOT NULL,
  base_installment NUMERIC(15,2) NOT NULL,
  group_label      TEXT,                        -- e.g. "Group A", "Office Group"
  company_id       UUID        REFERENCES public.chit_companies(id) ON DELETE SET NULL,
  start_date       DATE,
  status           TEXT        NOT NULL DEFAULT 'ACTIVE',

  -- Commission is configurable; current examples suggest ~2.5% but must remain flexible.
  commission_type  TEXT        NOT NULL,        -- e.g. 'PERCENTAGE', 'FLAT_AMOUNT'
  commission_value NUMERIC(10,4) NOT NULL,      -- e.g. 2.5 for 2.5%, or 7500 for flat
  commission_notes TEXT,

  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chits_status_check CHECK (
    status IN ('ACTIVE', 'COMPLETED', 'EXITED', 'ARCHIVED')
  ),
  CONSTRAINT chits_commission_type_check CHECK (
    commission_type IN ('PERCENTAGE', 'FLAT_AMOUNT', 'OTHER')
  ),
  CONSTRAINT chits_face_value_positive       CHECK (face_value > 0),
  CONSTRAINT chits_base_installment_positive CHECK (base_installment > 0),
  CONSTRAINT chits_member_count_positive     CHECK (member_count > 0),
  CONSTRAINT chits_duration_positive         CHECK (duration_months > 0),
  CONSTRAINT chits_commission_value_nonneg   CHECK (commission_value >= 0)
);

COMMENT ON TABLE  public.chits IS
  'One complete chit scheme. face_value ≈ base_installment × member_count '
  'is an expected relationship enforced by application logic, not a DB constraint.';
COMMENT ON COLUMN public.chits.commission_type  IS
  'PERCENTAGE = commission_value is a % of face_value. '
  'FLAT_AMOUNT = commission_value is a fixed rupee amount per round.';
COMMENT ON COLUMN public.chits.commission_value IS
  'Do NOT hardcode as 2.5%. Configure per chit. Current data suggests 2.5% '
  'but must remain flexible.';
COMMENT ON COLUMN public.chits.company_id IS
  'Nullable — a chit does not require a registered company.';

CREATE TRIGGER chits_updated_at
  BEFORE UPDATE ON public.chits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- =============================================================================
-- TABLE 4: source_messages
-- Purpose: Preserve original WhatsApp / source messages verbatim.
--          Raw text is NEVER modified after insert.
--          Parsing is a separate concern tracked via parse_status.
--
-- INTEGRITY RULE: raw_text is the permanent source of truth.
--   Deleting or overwriting source messages is PROHIBITED.
--   Use SUPERSEDED status if a message is replaced by a later correction.
-- =============================================================================
CREATE TABLE public.source_messages (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id              UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chit_id                 UUID        REFERENCES public.chits(id) ON DELETE SET NULL,
  raw_text                TEXT        NOT NULL,
  received_at             TIMESTAMPTZ,
  parse_status            TEXT        NOT NULL DEFAULT 'PENDING',
  -- matched_auction_event_id added as FK after auction_events table is created (below)
  matched_auction_event_id UUID,
  content_hash            TEXT,        -- SHA-256 of raw_text for duplicate detection
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT source_messages_parse_status_check CHECK (
    parse_status IN ('PENDING', 'PARSED', 'PARSE_FAILED', 'DUPLICATE', 'SUPERSEDED')
  )
);

COMMENT ON TABLE  public.source_messages IS
  'Verbatim WhatsApp/source messages. raw_text must NEVER be modified after insert. '
  'Parse results are tracked separately via parse_status.';
COMMENT ON COLUMN public.source_messages.raw_text IS
  'Original message exactly as received. Immutable after insert.';
COMMENT ON COLUMN public.source_messages.content_hash IS
  'SHA-256 of raw_text, computed by application. Used for duplicate detection.';
COMMENT ON COLUMN public.source_messages.matched_auction_event_id IS
  'FK to auction_events(id) — added below via ALTER TABLE after auction_events is created.';

CREATE TRIGGER source_messages_updated_at
  BEFORE UPDATE ON public.source_messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- =============================================================================
-- TABLE 5: auction_events
-- Purpose: One monthly chit round/auction.
--          round_number = the monthly installment number (1..duration_months).
--          Financial fields store derived values from the WhatsApp message.
--
-- CRITICAL: FINAL and SPECIAL_NO_AUCTION events must NOT be processed
--           through the normal auction calculation formula.
--
-- UNKNOWN: our_payout_amount is nullable because winner settlement mechanics
--          (whether it equals face_value, face_value minus commission, or
--          something else) have NOT been verified from real data.
-- =============================================================================
CREATE TABLE public.auction_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chit_id           UUID        NOT NULL REFERENCES public.chits(id) ON DELETE CASCADE,
  round_number      INTEGER     NOT NULL,
  event_type        TEXT        NOT NULL DEFAULT 'NORMAL',

  -- Financial fields (all nullable — may not be present for every event type)
  thallu            NUMERIC(15,2),    -- Raw thallu amount from auction
  commission        NUMERIC(15,2),    -- Commission applied this round
  net_thallu        NUMERIC(15,2),    -- thallu - commission (NORMAL events only)
  member_thallu     NUMERIC(15,2),    -- net_thallu / member_count
  non_winner_payment NUMERIC(15,2),   -- base_installment - member_thallu

  -- User participation
  won_by_us         BOOLEAN,          -- Did our family win this round?
  our_payout_amount NUMERIC(15,2),    -- NULLABLE: winner settlement unverified (see comment)

  auction_date      DATE,
  calculation_status TEXT       NOT NULL DEFAULT 'INDUSTRY_DEFAULT',
  source_message_id  UUID       REFERENCES public.source_messages(id) ON DELETE SET NULL,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT auction_events_event_type_check CHECK (
    event_type IN ('NORMAL', 'SPECIAL_NO_AUCTION', 'FINAL', 'UNKNOWN')
  ),
  CONSTRAINT auction_events_calc_status_check CHECK (
    calculation_status IN (
      'VERIFIED_FORMULA', 'INDUSTRY_DEFAULT', 'MANUAL_OVERRIDE', 'FLAGGED_MISMATCH'
    )
  ),
  CONSTRAINT auction_events_round_number_positive CHECK (round_number > 0),

  -- Each chit has at most one record per round
  UNIQUE (chit_id, round_number)
);

COMMENT ON TABLE  public.auction_events IS
  'One monthly auction/round. FINAL and SPECIAL_NO_AUCTION event_types must NOT '
  'be processed through the normal auction formula.';
COMMENT ON COLUMN public.auction_events.round_number IS
  'Monthly installment number, 1-indexed. Use "round_number", NOT "chit number".';
COMMENT ON COLUMN public.auction_events.our_payout_amount IS
  'NULLABLE AND UNVERIFIED. Winner settlement mechanics have not been confirmed '
  'from real data. Do not default to face_value or (face_value - commission).';
COMMENT ON COLUMN public.auction_events.event_type IS
  'NORMAL: standard auction. SPECIAL_NO_AUCTION: no auction held. '
  'FINAL: last round maturity. UNKNOWN: event type not yet determined. '
  'Only NORMAL events should run through the standard calculation formula.';
COMMENT ON COLUMN public.auction_events.calculation_status IS
  'VERIFIED_FORMULA: formula confirmed against raw message. '
  'INDUSTRY_DEFAULT: assumed formula, not confirmed. '
  'MANUAL_OVERRIDE: manually entered. FLAGGED_MISMATCH: calculated ≠ source.';

-- Now add the FK from source_messages → auction_events (circular ref resolved)
ALTER TABLE public.source_messages
  ADD CONSTRAINT source_messages_matched_auction_event_id_fkey
  FOREIGN KEY (matched_auction_event_id)
  REFERENCES public.auction_events(id)
  ON DELETE SET NULL;

CREATE TRIGGER auction_events_updated_at
  BEFORE UPDATE ON public.auction_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- =============================================================================
-- TABLE 6: ledger_entries
-- Purpose: Single append-only financial ledger for all cash movements.
--          Do NOT create separate payment_records or portfolio_transactions.
--
-- APPEND-ONLY PRINCIPLE:
--   Confirmed historical entries must never be updated or deleted.
--   To correct an entry, insert a new MANUAL_CORRECTION entry referencing
--   the original via corrects_entry_id.
--
-- SIGNED AMOUNTS:
--   Negative = outflow (payment made by us)
--   Positive = inflow (payout received by us)
-- =============================================================================
CREATE TABLE public.ledger_entries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chit_id           UUID        NOT NULL REFERENCES public.chits(id) ON DELETE CASCADE,
  auction_event_id  UUID        REFERENCES public.auction_events(id) ON DELETE SET NULL,
  entry_type        TEXT        NOT NULL,
  amount            NUMERIC(15,2) NOT NULL,
  transaction_date  DATE        NOT NULL,
  corrects_entry_id UUID        REFERENCES public.ledger_entries(id) ON DELETE RESTRICT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- No updated_at: this table is append-only; entries must not be modified

  CONSTRAINT ledger_entries_type_check CHECK (
    entry_type IN (
      'INSTALLMENT_PAID',
      'AUCTION_PAYOUT_RECEIVED',
      'ADJUSTMENT',
      'LATE_FEE',
      'MATURITY_SETTLEMENT',
      'MANUAL_CORRECTION'
    )
  ),
  CONSTRAINT ledger_entries_no_self_correction CHECK (
    corrects_entry_id IS NULL OR corrects_entry_id <> id
  )
);

COMMENT ON TABLE  public.ledger_entries IS
  'Append-only financial ledger. Do NOT UPDATE or DELETE confirmed entries. '
  'Use MANUAL_CORRECTION entry_type with corrects_entry_id to correct history.';
COMMENT ON COLUMN public.ledger_entries.amount IS
  'Signed: negative = we paid out, positive = we received money.';
COMMENT ON COLUMN public.ledger_entries.corrects_entry_id IS
  'If this is a MANUAL_CORRECTION, references the entry being corrected. '
  'ON DELETE RESTRICT prevents deleting a corrected entry while correction exists.';


-- =============================================================================
-- TABLE 7: context_events
-- Purpose: External/contextual calendar events for future historical analysis.
--          Causal inference is NOT implemented in this phase.
--          Examples: Diwali, Pongal, Wedding Season, Emergency.
-- =============================================================================
CREATE TABLE public.context_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label      TEXT        NOT NULL,
  start_date DATE        NOT NULL,
  end_date   DATE,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT context_events_date_order CHECK (
    end_date IS NULL OR end_date >= start_date
  )
);

COMMENT ON TABLE public.context_events IS
  'Contextual calendar events (Diwali, family functions, emergencies). '
  'Stored for future historical analysis. '
  'Causal inference is NOT implemented in Phase 1.';

CREATE TRIGGER context_events_updated_at
  BEFORE UPDATE ON public.context_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- =============================================================================
-- TABLE 8: user_rules
-- Purpose: User-defined financial decision boundaries / preferences.
--          Decision logic is NOT implemented in this phase.
--
-- Possible future rule_types (not exhaustive, user-extensible):
--   MAX_ACCEPTABLE_THALLU  — max thallu the family is willing to bid
--   MIN_ACCEPTABLE_CASH    — minimum net payout acceptable if winning
--   MAX_EFFECTIVE_COST     — maximum effective interest cost tolerated
--   TARGET_RETURN          — target return % across all chits
-- =============================================================================
CREATE TABLE public.user_rules (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chit_id    UUID        REFERENCES public.chits(id) ON DELETE CASCADE,
  rule_type  TEXT        NOT NULL,
  rule_value NUMERIC(15,4),
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.user_rules IS
  'User-defined decision boundaries. Decision logic NOT implemented yet. '
  'chit_id nullable: global rules apply to all chits, specific rules to one chit.';
COMMENT ON COLUMN public.user_rules.rule_type IS
  'Application-defined. Examples: MAX_ACCEPTABLE_THALLU, MIN_ACCEPTABLE_CASH, '
  'MAX_EFFECTIVE_COST, TARGET_RETURN. Not an enum — extensible via application.';

CREATE TRIGGER user_rules_updated_at
  BEFORE UPDATE ON public.user_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- =============================================================================
-- INDEXES
-- =============================================================================

-- chits: common query patterns
CREATE INDEX idx_chits_profile_id   ON public.chits(profile_id);
CREATE INDEX idx_chits_status       ON public.chits(profile_id, status);
CREATE INDEX idx_chits_company_id   ON public.chits(company_id) WHERE company_id IS NOT NULL;

-- source_messages
CREATE INDEX idx_source_messages_profile_id   ON public.source_messages(profile_id);
CREATE INDEX idx_source_messages_chit_id      ON public.source_messages(chit_id)      WHERE chit_id IS NOT NULL;
CREATE INDEX idx_source_messages_parse_status ON public.source_messages(profile_id, parse_status);
CREATE INDEX idx_source_messages_content_hash ON public.source_messages(content_hash) WHERE content_hash IS NOT NULL;

-- auction_events
CREATE INDEX idx_auction_events_profile_id  ON public.auction_events(profile_id);
CREATE INDEX idx_auction_events_chit_id     ON public.auction_events(chit_id);
CREATE INDEX idx_auction_events_date        ON public.auction_events(chit_id, auction_date);
CREATE INDEX idx_auction_events_event_type  ON public.auction_events(chit_id, event_type);

-- ledger_entries
CREATE INDEX idx_ledger_entries_profile_id  ON public.ledger_entries(profile_id);
CREATE INDEX idx_ledger_entries_chit_id     ON public.ledger_entries(chit_id);
CREATE INDEX idx_ledger_entries_date        ON public.ledger_entries(chit_id, transaction_date);
CREATE INDEX idx_ledger_entries_type        ON public.ledger_entries(chit_id, entry_type);
CREATE INDEX idx_ledger_entries_corrects    ON public.ledger_entries(corrects_entry_id) WHERE corrects_entry_id IS NOT NULL;

-- context_events
CREATE INDEX idx_context_events_profile_id ON public.context_events(profile_id);
CREATE INDEX idx_context_events_dates      ON public.context_events(start_date, end_date);

-- chit_companies
CREATE INDEX idx_chit_companies_profile_id ON public.chit_companies(profile_id);

-- user_rules
CREATE INDEX idx_user_rules_profile_id ON public.user_rules(profile_id);
CREATE INDEX idx_user_rules_chit_id    ON public.user_rules(chit_id) WHERE chit_id IS NOT NULL;
