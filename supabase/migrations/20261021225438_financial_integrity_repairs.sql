-- =============================================================================
-- Chit Fund Analytics -- confirmed financial-integrity repairs
-- =============================================================================
-- This migration intentionally fails instead of rewriting historical rows when
-- pre-existing data violates a new invariant. Repair any reported rows through
-- an audited, user-approved process before retrying the migration.

-- -----------------------------------------------------------------------------
-- Preflight: do not silently normalize historical financial data.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.ledger_entries
    WHERE corrects_entry_id IS NOT NULL
    GROUP BY corrects_entry_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce one correction per original: duplicate corrections exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.auction_events ae
    JOIN public.chits c ON c.id = ae.chit_id
    WHERE ae.profile_id <> c.profile_id
       OR ae.round_number < 1
       OR ae.round_number > c.duration_months
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce auction ownership/round bounds: inconsistent auction_events exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ledger_entries le
    JOIN public.chits c ON c.id = le.chit_id
    LEFT JOIN public.auction_events ae ON ae.id = le.auction_event_id
    LEFT JOIN public.ledger_entries original ON original.id = le.corrects_entry_id
    WHERE le.profile_id <> c.profile_id
       OR (le.auction_event_id IS NOT NULL AND
           (ae.id IS NULL OR ae.profile_id <> le.profile_id OR ae.chit_id <> le.chit_id))
       OR (le.corrects_entry_id IS NOT NULL AND
           (original.id IS NULL OR original.profile_id <> le.profile_id OR original.chit_id <> le.chit_id))
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce ledger ownership: inconsistent ledger relationships exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.source_messages sm
    LEFT JOIN public.chits c ON c.id = sm.chit_id
    LEFT JOIN public.auction_events ae ON ae.id = sm.matched_auction_event_id
    WHERE (sm.chit_id IS NOT NULL AND (c.id IS NULL OR c.profile_id <> sm.profile_id))
       OR (sm.matched_auction_event_id IS NOT NULL AND
           (sm.chit_id IS NULL OR ae.id IS NULL OR ae.profile_id <> sm.profile_id OR ae.chit_id <> sm.chit_id))
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce source ownership: inconsistent source relationships exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.auction_events ae
    JOIN public.source_messages sm ON sm.id = ae.source_message_id
    WHERE ae.source_message_id IS NOT NULL
      AND (sm.profile_id <> ae.profile_id OR sm.chit_id <> ae.chit_id)
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce event/source ownership: inconsistent links exist';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Strictly monotonic updated_at values make the existing timestamp a reliable
-- version token, even for multiple statements in one transaction.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = GREATEST(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Cross-record ownership. Composite foreign keys ensure that redundant
-- profile_id/chit_id columns cannot point across users or chits. RLS remains
-- enabled and unchanged; these constraints are an additional integrity layer.
-- -----------------------------------------------------------------------------
ALTER TABLE public.chits
  ADD CONSTRAINT chits_id_profile_uk UNIQUE (id, profile_id);

ALTER TABLE public.source_messages
  ADD CONSTRAINT source_messages_id_profile_chit_uk UNIQUE (id, profile_id, chit_id);

ALTER TABLE public.auction_events
  ADD CONSTRAINT auction_events_id_profile_chit_uk UNIQUE (id, profile_id, chit_id);

ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_id_profile_chit_uk UNIQUE (id, profile_id, chit_id);

ALTER TABLE public.source_messages
  DROP CONSTRAINT source_messages_chit_id_fkey,
  ADD CONSTRAINT source_messages_chit_owner_fkey
    FOREIGN KEY (chit_id, profile_id)
    REFERENCES public.chits(id, profile_id)
    ON DELETE SET NULL (chit_id);

ALTER TABLE public.auction_events
  DROP CONSTRAINT auction_events_chit_id_fkey,
  ADD CONSTRAINT auction_events_chit_owner_fkey
    FOREIGN KEY (chit_id, profile_id)
    REFERENCES public.chits(id, profile_id)
    ON DELETE CASCADE;

ALTER TABLE public.ledger_entries
  DROP CONSTRAINT ledger_entries_chit_id_fkey,
  ADD CONSTRAINT ledger_entries_chit_owner_fkey
    FOREIGN KEY (chit_id, profile_id)
    REFERENCES public.chits(id, profile_id)
    ON DELETE CASCADE;

ALTER TABLE public.auction_events
  DROP CONSTRAINT auction_events_source_message_id_fkey,
  ADD CONSTRAINT auction_events_source_owner_fkey
    FOREIGN KEY (source_message_id, profile_id, chit_id)
    REFERENCES public.source_messages(id, profile_id, chit_id)
    ON DELETE SET NULL (source_message_id);

ALTER TABLE public.source_messages
  DROP CONSTRAINT source_messages_matched_auction_event_id_fkey,
  ADD CONSTRAINT source_messages_match_requires_chit
    CHECK (matched_auction_event_id IS NULL OR chit_id IS NOT NULL),
  ADD CONSTRAINT source_messages_matched_event_owner_fkey
    FOREIGN KEY (matched_auction_event_id, profile_id, chit_id)
    REFERENCES public.auction_events(id, profile_id, chit_id)
    ON DELETE SET NULL (matched_auction_event_id);

ALTER TABLE public.ledger_entries
  DROP CONSTRAINT ledger_entries_auction_event_id_fkey,
  ADD CONSTRAINT ledger_entries_event_owner_fkey
    FOREIGN KEY (auction_event_id, profile_id, chit_id)
    REFERENCES public.auction_events(id, profile_id, chit_id)
    ON DELETE SET NULL (auction_event_id);

ALTER TABLE public.ledger_entries
  DROP CONSTRAINT ledger_entries_corrects_entry_id_fkey,
  ADD CONSTRAINT ledger_entries_correction_owner_fkey
    FOREIGN KEY (corrects_entry_id, profile_id, chit_id)
    REFERENCES public.ledger_entries(id, profile_id, chit_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT ledger_entries_correction_shape_check CHECK (
    (entry_type = 'MANUAL_CORRECTION') = (corrects_entry_id IS NOT NULL)
  );

ALTER TABLE public.chits
  ADD CONSTRAINT chits_verification_owner_check CHECK (
    (verified_at IS NULL AND verified_by IS NULL)
    OR (verified_at IS NOT NULL AND verified_by = profile_id)
  );

CREATE UNIQUE INDEX ledger_entries_one_correction_per_original_uk
  ON public.ledger_entries(corrects_entry_id)
  WHERE corrects_entry_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Round bounds are a parent-dependent invariant and therefore require a
-- trigger. Existing rows were checked in the preflight block above.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_auction_round_bounds()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_duration integer;
BEGIN
  SELECT duration_months
    INTO v_duration
    FROM public.chits
    WHERE id = NEW.chit_id
      AND profile_id = NEW.profile_id;

  IF NOT FOUND THEN
    RAISE foreign_key_violation
      USING MESSAGE = 'Auction event must belong to the same profile as its chit';
  END IF;

  IF NEW.round_number < 1 OR NEW.round_number > v_duration THEN
    RAISE check_violation
      USING MESSAGE = format(
        'Round %s is outside the valid range 1..%s',
        NEW.round_number,
        v_duration
      );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auction_events_enforce_round_bounds
  BEFORE INSERT OR UPDATE OF profile_id, chit_id, round_number
  ON public.auction_events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_auction_round_bounds();

-- -----------------------------------------------------------------------------
-- Every financial mutation invalidates verification and advances the parent
-- version, including when the chit is already unverified. Auction UPDATE and
-- DELETE are relevant mutations as well as INSERT.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invalidate_verification_on_ledger_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.chits
    SET verified_at = NULL,
        verified_by = NULL
    WHERE id = NEW.chit_id
      AND profile_id = NEW.profile_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_verification_on_auction_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old_chit_id uuid;
  v_old_profile_id uuid;
  v_new_chit_id uuid;
  v_new_profile_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_chit_id := OLD.chit_id;
    v_old_profile_id := OLD.profile_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_chit_id := NEW.chit_id;
    v_new_profile_id := NEW.profile_id;
  END IF;

  IF v_old_chit_id IS NOT NULL THEN
    UPDATE public.chits
      SET verified_at = NULL,
          verified_by = NULL
      WHERE id = v_old_chit_id
        AND profile_id = v_old_profile_id;
  END IF;

  IF v_new_chit_id IS NOT NULL
     AND (v_old_chit_id IS NULL
          OR v_new_chit_id IS DISTINCT FROM v_old_chit_id
          OR v_new_profile_id IS DISTINCT FROM v_old_profile_id) THEN
    UPDATE public.chits
      SET verified_at = NULL,
          verified_by = NULL
      WHERE id = v_new_chit_id
        AND profile_id = v_new_profile_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER trg_auction_events_invalidate_verification ON public.auction_events;

CREATE TRIGGER trg_auction_events_invalidate_verification
  BEFORE INSERT OR UPDATE OR DELETE ON public.auction_events
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_verification_on_auction_insert();

-- Correction-side effects now share the correction INSERT transaction.
CREATE OR REPLACE FUNCTION public.apply_ledger_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_original public.ledger_entries%ROWTYPE;
BEGIN
  IF NEW.entry_type <> 'MANUAL_CORRECTION' THEN
    RETURN NEW;
  END IF;

  SELECT *
    INTO v_original
    FROM public.ledger_entries
    WHERE id = NEW.corrects_entry_id
    FOR SHARE;

  IF NOT FOUND
     OR v_original.profile_id <> NEW.profile_id
     OR v_original.chit_id <> NEW.chit_id THEN
    RAISE foreign_key_violation
      USING MESSAGE = 'Correction and original entry must belong to the same profile and chit';
  END IF;

  IF v_original.entry_type = 'MANUAL_CORRECTION' THEN
    RAISE check_violation
      USING MESSAGE = 'A correction entry cannot itself be corrected';
  END IF;

  IF NEW.auction_event_id IS DISTINCT FROM v_original.auction_event_id THEN
    RAISE check_violation
      USING MESSAGE = 'Correction must retain the original auction event';
  END IF;

  IF NEW.auction_event_id IS NOT NULL THEN
    UPDATE public.auction_events
      SET calculation_status = 'MANUAL_OVERRIDE'
      WHERE id = NEW.auction_event_id
        AND profile_id = NEW.profile_id
        AND chit_id = NEW.chit_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ledger_entries_apply_correction
  BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_ledger_correction();

-- -----------------------------------------------------------------------------
-- Atomic confirmed ingestion. Expected installment/payout values stay on the
-- auction event. This function deliberately creates no actual ledger entries.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_ingestion(
  p_chit_id uuid,
  p_raw_text text,
  p_received_at timestamptz,
  p_content_hash text,
  p_parse_status text,
  p_existing_source_message_id uuid,
  p_auction_event jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid := (SELECT auth.uid());
  v_source_message_id uuid;
  v_auction_event_id uuid;
  v_existing_raw_text text;
  v_existing_hash text;
  v_existing_status text;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE insufficient_privilege USING MESSAGE = 'Not authenticated';
  END IF;

  IF p_parse_status <> 'PARSED' THEN
    RAISE check_violation
      USING MESSAGE = 'Confirmed ingestion must use PARSED status';
  END IF;

  IF p_raw_text IS NULL OR btrim(p_raw_text) = '' OR p_content_hash IS NULL THEN
    RAISE not_null_violation
      USING MESSAGE = 'Confirmed ingestion requires source text and content hash';
  END IF;

  -- Serialize ingestion and verification for the same chit.
  PERFORM 1
    FROM public.chits
    WHERE id = p_chit_id
      AND profile_id = v_profile_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE insufficient_privilege
      USING MESSAGE = 'Chit not found or permission denied';
  END IF;

  IF p_existing_source_message_id IS NOT NULL THEN
    SELECT raw_text, content_hash, parse_status
      INTO v_existing_raw_text, v_existing_hash, v_existing_status
      FROM public.source_messages
      WHERE id = p_existing_source_message_id
        AND profile_id = v_profile_id
        AND chit_id = p_chit_id
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE insufficient_privilege
        USING MESSAGE = 'Source message not found or permission denied';
    END IF;

    IF v_existing_raw_text IS DISTINCT FROM p_raw_text
       OR v_existing_hash IS DISTINCT FROM p_content_hash THEN
      RAISE check_violation
        USING MESSAGE = 'Source message content changed during confirmation';
    END IF;

    IF v_existing_status IN ('PARSED', 'SUPERSEDED') THEN
      RAISE check_violation
        USING MESSAGE = 'Source message is already processed or superseded';
    END IF;

    v_source_message_id := p_existing_source_message_id;
  ELSE
    INSERT INTO public.source_messages (
      profile_id,
      chit_id,
      raw_text,
      received_at,
      parse_status,
      content_hash,
      matched_auction_event_id
    ) VALUES (
      v_profile_id,
      p_chit_id,
      p_raw_text,
      p_received_at,
      p_parse_status,
      p_content_hash,
      NULL
    )
    RETURNING id INTO v_source_message_id;
  END IF;

  IF p_auction_event IS NOT NULL THEN
    INSERT INTO public.auction_events (
      profile_id,
      chit_id,
      round_number,
      event_type,
      thallu,
      commission,
      net_thallu,
      member_thallu,
      non_winner_payment,
      won_by_us,
      our_payout_amount,
      auction_date,
      calculation_status,
      source_message_id,
      notes
    ) VALUES (
      v_profile_id,
      p_chit_id,
      (p_auction_event->>'round_number')::integer,
      p_auction_event->>'event_type',
      (p_auction_event->>'thallu')::numeric,
      (p_auction_event->>'commission')::numeric,
      (p_auction_event->>'net_thallu')::numeric,
      (p_auction_event->>'member_thallu')::numeric,
      (p_auction_event->>'non_winner_payment')::numeric,
      (p_auction_event->>'won_by_us')::boolean,
      (p_auction_event->>'our_payout_amount')::numeric,
      (p_auction_event->>'auction_date')::date,
      p_auction_event->>'calculation_status',
      v_source_message_id,
      p_auction_event->>'notes'
    )
    RETURNING id INTO v_auction_event_id;
  END IF;

  UPDATE public.source_messages
    SET parse_status = p_parse_status,
        matched_auction_event_id = v_auction_event_id
    WHERE id = v_source_message_id
      AND profile_id = v_profile_id;

  RETURN jsonb_build_object(
    'source_message_id', v_source_message_id,
    'auction_event_id', v_auction_event_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_ingestion(
  uuid, text, timestamptz, text, text, uuid, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_ingestion(
  uuid, text, timestamptz, text, text, uuid, jsonb
) TO authenticated;

-- -----------------------------------------------------------------------------
-- Verification is one locked database operation. It validates the exact set
-- 1..duration_months and cannot race with event/ledger mutations, whose
-- triggers acquire the same parent chit row lock.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_chit_cash_flows(p_chit_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid := (SELECT auth.uid());
  v_status text;
  v_duration integer;
  v_missing_rounds integer[];
  v_unverified_count integer;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE insufficient_privilege USING MESSAGE = 'Not authenticated';
  END IF;

  SELECT status, duration_months
    INTO v_status, v_duration
    FROM public.chits
    WHERE id = p_chit_id
      AND profile_id = v_profile_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE insufficient_privilege
      USING MESSAGE = 'Chit not found or permission denied';
  END IF;

  IF v_status <> 'COMPLETED' THEN
    RAISE check_violation
      USING MESSAGE = format(
        'Only COMPLETED chits can be verified. Current status: %s',
        v_status
      );
  END IF;

  SELECT array_agg(expected_round ORDER BY expected_round)
    INTO v_missing_rounds
    FROM generate_series(1, v_duration) AS expected_round
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.auction_events ae
      WHERE ae.chit_id = p_chit_id
        AND ae.profile_id = v_profile_id
        AND ae.round_number = expected_round
    );

  IF v_missing_rounds IS NOT NULL THEN
    RAISE check_violation
      USING MESSAGE = format(
        'Not all expected rounds are recorded. Missing: %s',
        array_to_string(v_missing_rounds, ', ')
      );
  END IF;

  SELECT count(*)::integer
    INTO v_unverified_count
    FROM public.auction_events
    WHERE chit_id = p_chit_id
      AND profile_id = v_profile_id
      AND event_type = 'NORMAL'
      AND calculation_status IN ('FLAGGED_MISMATCH', 'INDUSTRY_DEFAULT');

  IF v_unverified_count > 0 THEN
    RAISE check_violation
      USING MESSAGE = format(
        '%s NORMAL round(s) are not verified. Resolve them before verifying.',
        v_unverified_count
      );
  END IF;

  UPDATE public.chits
    SET verified_at = clock_timestamp(),
        verified_by = v_profile_id
    WHERE id = p_chit_id
      AND profile_id = v_profile_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_chit_cash_flows(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_chit_cash_flows(uuid) TO authenticated;

COMMENT ON FUNCTION public.confirm_ingestion(
  uuid, text, timestamptz, text, text, uuid, jsonb
) IS
  'Atomically persists a reviewed source message and auction event. Expected '
  'financial values remain event facts; no actual ledger cash flow is created.';

COMMENT ON FUNCTION public.verify_chit_cash_flows(uuid) IS
  'Atomically verifies a completed chit after locking it and validating the exact '
  'round set and calculation statuses.';
