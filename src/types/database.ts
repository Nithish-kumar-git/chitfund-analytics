// =============================================================================
// Chit Fund Analytics — Database TypeScript Types
// Matches supabase/migrations/20260928000001_initial_schema.sql
//         supabase/migrations/20261003000001_add_cash_flow_verification.sql
// =============================================================================
// These types are hand-authored.
// In later phases, replace with: npx supabase gen types typescript --linked
// =============================================================================

export type ChitStatus = 'ACTIVE' | 'COMPLETED' | 'EXITED' | 'ARCHIVED'

export type CommissionType = 'PERCENTAGE' | 'FLAT_AMOUNT' | 'OTHER'

export type ParseStatus =
  | 'PENDING'
  | 'PARSED'
  | 'PARSE_FAILED'
  | 'DUPLICATE'
  | 'SUPERSEDED'

export type AuctionEventType =
  | 'NORMAL'
  | 'SPECIAL_NO_AUCTION'
  | 'FINAL'
  | 'UNKNOWN'

export type CalculationStatus =
  | 'VERIFIED_FORMULA'
  | 'INDUSTRY_DEFAULT'
  | 'MANUAL_OVERRIDE'
  | 'FLAGGED_MISMATCH'
  | 'CONFIRM_SOURCE'

export type LedgerEntryType =
  | 'INSTALLMENT_PAID'
  | 'AUCTION_PAYOUT_RECEIVED'
  | 'ADJUSTMENT'
  | 'LATE_FEE'
  | 'MATURITY_SETTLEMENT'
  | 'MANUAL_CORRECTION'

// ---------------------------------------------------------------------------
// Row types (match DB columns exactly)
// ---------------------------------------------------------------------------

export interface Profile {
  id: string          // UUID — mirrors auth.users(id)
  display_name: string | null
  created_at: string  // ISO 8601 timestamptz
  updated_at: string
}

export interface ChitCompany {
  id: string
  profile_id: string
  name: string
  contact_info: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Chit {
  id: string
  profile_id: string
  name: string
  face_value: number          // NUMERIC — use string in DB, number in JS
  duration_months: number
  member_count: number
  base_installment: number    // face_value ≈ base_installment × member_count (approx only)
  group_label: string | null
  company_id: string | null   // optional FK to chit_companies
  start_date: string | null   // DATE as ISO string 'YYYY-MM-DD'
  status: ChitStatus
  commission_type: CommissionType
  commission_value: number    // % or flat amount, NOT hardcoded as 2.5
  commission_notes: string | null
  notes: string | null
  /**
   * Phase 7F: Cash-flow verification.
   * Both fields are null until the user explicitly verifies.
   * Cleared (set to null) by any financial mutation path.
   * Do NOT accept these values from the client — they are set/cleared server-side.
   */
  verified_at: string | null  // timestamptz — when the user verified cash flows
  verified_by: string | null  // uuid — auth.users(id) of the verifying user
  created_at: string
  updated_at: string
}

export interface SourceMessage {
  id: string
  profile_id: string
  chit_id: string | null
  raw_text: string            // IMMUTABLE after insert — original WhatsApp text
  received_at: string | null  // timestamptz
  parse_status: ParseStatus
  matched_auction_event_id: string | null
  content_hash: string | null // SHA-256 of raw_text for dedup
  notes: string | null
  created_at: string
  updated_at: string
}

export interface AuctionEvent {
  id: string
  profile_id: string
  chit_id: string
  round_number: number        // 1-indexed monthly round ("round_number", NOT "chit number")
  event_type: AuctionEventType

  // Financial fields — nullable; FINAL/SPECIAL_NO_AUCTION may omit all of these
  thallu: number | null
  commission: number | null
  net_thallu: number | null           // thallu - commission  (NORMAL only)
  member_thallu: number | null        // net_thallu / member_count  (NORMAL only)
  non_winner_payment: number | null   // base_installment - member_thallu  (NORMAL only)

  // User participation
  won_by_us: boolean | null
  /**
   * NULLABLE + UNVERIFIED.
   * Winner payout mechanics have not been confirmed from real data.
   * Do NOT default to face_value or (face_value - commission).
   */
  our_payout_amount: number | null

  auction_date: string | null         // DATE
  calculation_status: CalculationStatus
  source_message_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/**
 * Append-only financial ledger.
 * Do NOT update or delete confirmed entries.
 * Corrections: insert a new MANUAL_CORRECTION referencing corrects_entry_id.
 *
 * amount sign convention:
 *   negative = outflow (we paid)
 *   positive = inflow (we received)
 * 
 * idempotency_key: Phase 8A.1 double-submit protection.
 *   Client generates UUID on form open, prevents accidental duplicates.
 *   NULL allowed for backward compatibility.
 */
export interface LedgerEntry {
  id: string
  profile_id: string
  chit_id: string
  auction_event_id: string | null
  entry_type: LedgerEntryType
  amount: number              // signed NUMERIC
  transaction_date: string    // DATE
  corrects_entry_id: string | null
  notes: string | null
  idempotency_key: string | null  // Phase 8A.1
  created_at: string
  // No updated_at — append-only table
}

export interface ContextEvent {
  id: string
  profile_id: string
  label: string               // e.g. 'Diwali', 'Wedding Season', 'Emergency'
  start_date: string          // DATE
  end_date: string | null     // DATE — null = ongoing
  notes: string | null
  created_at: string
  updated_at: string
}

export interface UserRule {
  id: string
  profile_id: string
  chit_id: string | null      // null = applies to all chits
  rule_type: string           // e.g. 'MAX_ACCEPTABLE_THALLU', 'TARGET_RETURN'
  rule_value: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Insert types (omit auto-generated fields)
// ---------------------------------------------------------------------------

export type ProfileInsert = Omit<Profile, 'created_at' | 'updated_at'>

export type ChitCompanyInsert = Omit<ChitCompany, 'id' | 'created_at' | 'updated_at'>

// verified_at / verified_by are excluded from ChitInsert — they cannot be set
// at creation time; they are managed exclusively by verifyChitCashFlows and
// the invalidation paths in mutation actions.
export type ChitInsert = Omit<Chit, 'id' | 'created_at' | 'updated_at' | 'verified_at' | 'verified_by'>

export type SourceMessageInsert = Omit<SourceMessage, 'id' | 'created_at' | 'updated_at'>

export type AuctionEventInsert = Omit<AuctionEvent, 'id' | 'created_at' | 'updated_at'>

export type LedgerEntryInsert = Omit<LedgerEntry, 'id' | 'created_at'>

export type ContextEventInsert = Omit<ContextEvent, 'id' | 'created_at' | 'updated_at'>

export type UserRuleInsert = Omit<UserRule, 'id' | 'created_at' | 'updated_at'>

// ---------------------------------------------------------------------------
// Database shape for Supabase client typing
// ---------------------------------------------------------------------------
export interface Database {
  public: {
    Tables: {
      profiles:        { Row: Profile;       Insert: ProfileInsert;       Update: Partial<ProfileInsert> }
      chit_companies:  { Row: ChitCompany;   Insert: ChitCompanyInsert;   Update: Partial<ChitCompanyInsert> }
      chits:           { Row: Chit;          Insert: ChitInsert;          Update: Partial<ChitInsert> }
      source_messages: { Row: SourceMessage; Insert: SourceMessageInsert; Update: Partial<SourceMessageInsert> }
      auction_events:  { Row: AuctionEvent;  Insert: AuctionEventInsert;  Update: Partial<AuctionEventInsert> }
      ledger_entries:  { Row: LedgerEntry;   Insert: LedgerEntryInsert;   Update: never } // append-only
      context_events:  { Row: ContextEvent;  Insert: ContextEventInsert;  Update: Partial<ContextEventInsert> }
      user_rules:      { Row: UserRule;      Insert: UserRuleInsert;      Update: Partial<UserRuleInsert> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      chit_status:         ChitStatus
      commission_type:     CommissionType
      parse_status:        ParseStatus
      auction_event_type:  AuctionEventType
      calculation_status:  CalculationStatus
      ledger_entry_type:   LedgerEntryType
    }
  }
}
