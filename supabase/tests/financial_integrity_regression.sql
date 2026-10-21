-- Run only against a disposable database after all tracked migrations.
-- The whole fixture is rolled back.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(condition boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'assertion failed: %', message;
  END IF;
END;
$$;

INSERT INTO auth.users (id, email)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'financial-test-1@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'financial-test-2@example.invalid');

INSERT INTO public.profiles (id, display_name)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Financial Test 1'),
  ('22222222-2222-4222-8222-222222222222', 'Financial Test 2')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chits (
  id, profile_id, name, face_value, duration_months, member_count,
  base_installment, status, commission_type, commission_value
)
VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-111111111111',
    'Financial Test Chit 1', 100000, 2, 10, 10000,
    'COMPLETED', 'FLAT_AMOUNT', 1000
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '22222222-2222-4222-8222-222222222222',
    'Financial Test Chit 2', 100000, 2, 10, 10000,
    'COMPLETED', 'FLAT_AMOUNT', 1000
  );

SELECT set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

-- 1/2/3: expected amount remains an event fact, unknown date remains NULL,
-- and source/event persistence is one function transaction with no ledger row.
SELECT public.confirm_ingestion(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '[05/07, 10:30] amount to pay 9000',
  '2025-07-06T00:00:00Z',
  'financial-hash-1',
  'PARSED',
  NULL,
  jsonb_build_object(
    'round_number', 1,
    'event_type', 'NORMAL',
    'non_winner_payment', 9000,
    'calculation_status', 'VERIFIED_FORMULA',
    'auction_date', NULL
  )
);

SELECT pg_temp.assert_true(
  (SELECT non_winner_payment = 9000 AND auction_date IS NULL
     FROM public.auction_events
     WHERE chit_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
       AND round_number = 1),
  'expected amount/date semantics were not preserved'
);

SELECT pg_temp.assert_true(
  (SELECT count(*) = 0
     FROM public.ledger_entries
     WHERE chit_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  'confirmed ingestion created an actual ledger cash flow'
);

DO $$
BEGIN
  BEGIN
    PERFORM public.confirm_ingestion(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '[06/07/2025, 10:30] forced failure',
      '2025-07-06T00:00:00Z',
      'financial-hash-forced-failure',
      'PARSED',
      NULL,
      jsonb_build_object(
        'round_number', 2,
        'event_type', 'NOT_A_REAL_EVENT_TYPE',
        'calculation_status', 'VERIFIED_FORMULA',
        'auction_date', '2025-07-06'
      )
    );
    RAISE EXCEPTION 'expected atomic ingestion failure did not occur';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  IF EXISTS (
    SELECT 1 FROM public.source_messages
    WHERE content_hash = 'financial-hash-forced-failure'
  ) THEN
    RAISE EXCEPTION 'atomic ingestion left a partial source message';
  END IF;
END;
$$;

-- 6: the database rejects rounds outside 1..duration_months.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.auction_events (
      profile_id, chit_id, round_number, event_type, calculation_status
    ) VALUES (
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      3,
      'NORMAL',
      'VERIFIED_FORMULA'
    );
    RAISE EXCEPTION 'expected out-of-range round rejection did not occur';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END;
$$;

-- Verification checks the expected set, not merely a row count.
DO $$
BEGIN
  BEGIN
    PERFORM public.verify_chit_cash_flows(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    );
    RAISE EXCEPTION 'verification accepted a missing expected round';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%Missing: 2%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

SELECT public.confirm_ingestion(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '[06/07/2025, 10:30] amount to pay 9000',
  '2025-07-06T00:00:00Z',
  'financial-hash-2',
  'PARSED',
  NULL,
  jsonb_build_object(
    'round_number', 2,
    'event_type', 'NORMAL',
    'non_winner_payment', 9000,
    'calculation_status', 'VERIFIED_FORMULA',
    'auction_date', '2025-07-06'
  )
);

SELECT pg_temp.assert_true(
  public.verify_chit_cash_flows('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  'complete exact round set did not verify'
);

-- 5: a relevant mutation always advances the parent timestamp and invalidates
-- verification, even when the parent had already been invalidated.
CREATE TEMP TABLE version_probe (before_update timestamptz);
INSERT INTO version_probe
SELECT updated_at FROM public.chits
WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

INSERT INTO public.ledger_entries (
  id, profile_id, chit_id, auction_event_id, entry_type, amount,
  transaction_date, notes
)
SELECT
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  profile_id,
  chit_id,
  id,
  'INSTALLMENT_PAID',
  9000,
  '2025-07-06',
  'Explicit payment confirmation'
FROM public.auction_events
WHERE chit_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  AND round_number = 1;

SELECT pg_temp.assert_true(
  (SELECT verified_at IS NULL
          AND updated_at > (SELECT before_update FROM version_probe)
     FROM public.chits
     WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  'ledger mutation did not invalidate verification and advance updated_at'
);

TRUNCATE version_probe;
INSERT INTO version_probe
SELECT updated_at FROM public.chits
WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

UPDATE public.auction_events
SET notes = 'Relevant mutation while already unverified'
WHERE chit_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  AND round_number = 1;

SELECT pg_temp.assert_true(
  (SELECT updated_at > (SELECT before_update FROM version_probe)
     FROM public.chits
     WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  'auction mutation did not advance updated_at while already unverified'
);

-- 4: one database-enforced correction per original, with atomic event status.
INSERT INTO public.ledger_entries (
  id, profile_id, chit_id, auction_event_id, entry_type, amount,
  transaction_date, corrects_entry_id, notes
)
SELECT
  'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  profile_id,
  chit_id,
  auction_event_id,
  'MANUAL_CORRECTION',
  8500,
  transaction_date,
  id,
  'Correction 1'
FROM public.ledger_entries
WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

SELECT pg_temp.assert_true(
  (SELECT calculation_status = 'MANUAL_OVERRIDE'
     FROM public.auction_events
     WHERE chit_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
       AND round_number = 1),
  'correction did not atomically mark the auction event MANUAL_OVERRIDE'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.ledger_entries (
      profile_id, chit_id, auction_event_id, entry_type, amount,
      transaction_date, corrects_entry_id, notes
    )
    SELECT
      profile_id,
      chit_id,
      auction_event_id,
      'MANUAL_CORRECTION',
      8000,
      transaction_date,
      id,
      'Concurrent-loser equivalent'
    FROM public.ledger_entries
    WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
    RAISE EXCEPTION 'expected duplicate-correction rejection did not occur';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;
END;
$$;

-- 7: linked records cannot cross profile/chit ownership boundaries.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.auction_events (
      profile_id, chit_id, round_number, event_type, calculation_status
    ) VALUES (
      '22222222-2222-4222-8222-222222222222',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      2,
      'NORMAL',
      'VERIFIED_FORMULA'
    );
    RAISE EXCEPTION 'expected cross-profile event rejection did not occur';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.ledger_entries (
      profile_id, chit_id, auction_event_id, entry_type, amount, transaction_date
    )
    SELECT
      '22222222-2222-4222-8222-222222222222',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      id,
      'INSTALLMENT_PAID',
      100,
      '2025-07-06'
    FROM public.auction_events
    WHERE chit_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      AND round_number = 1;
    RAISE EXCEPTION 'expected cross-chit event link rejection did not occur';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;
END;
$$;

ROLLBACK;
