ALTER TABLE public.auction_events DROP CONSTRAINT auction_events_calc_status_check;

ALTER TABLE public.auction_events ADD CONSTRAINT auction_events_calc_status_check CHECK (
  calculation_status IN (
    'VERIFIED_FORMULA', 
    'INDUSTRY_DEFAULT', 
    'MANUAL_OVERRIDE', 
    'FLAGGED_MISMATCH',
    'CONFIRM_SOURCE'
  )
);
