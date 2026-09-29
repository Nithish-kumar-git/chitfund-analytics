// Phase 1 — Foundation stub page.
// Real dashboard UI is implemented in a later phase.
// Design: personal finance tracker — dark navy, trust blue, profit green.
// Taste dials: VARIANCE 5 / MOTION 3 / DENSITY 5

const SCHEMA_TABLES = [
  { name: "profiles",        purpose: "Auth-linked user profile",           icon: "👤" },
  { name: "chit_companies",  purpose: "Optional — chit company registry",   icon: "🏢" },
  { name: "chits",           purpose: "Chit scheme master record",           icon: "📋" },
  { name: "source_messages", purpose: "Raw WhatsApp messages (immutable)",   icon: "💬" },
  { name: "auction_events",  purpose: "Monthly round / auction data",        icon: "🔔" },
  { name: "ledger_entries",  purpose: "Append-only financial ledger",        icon: "📒" },
  { name: "context_events",  purpose: "Calendar events for analysis",        icon: "📅" },
  { name: "user_rules",      purpose: "Decision boundaries & preferences",   icon: "⚖️" },
]

const SECURITY_ITEMS = [
  "Row Level Security enabled on all 8 tables",
  "Every record gated by auth.uid() = profile_id",
  "No anonymous access, no public read",
  "source_messages: no DELETE (raw data preserved forever)",
  "ledger_entries: no UPDATE / DELETE (append-only ledger)",
  "Auto-create profile on Supabase Auth signup",
]

const UNKNOWN_RULES = [
  "Winner payout amount",
  "Whether winner payout deducts commission",
  "Maturity settlement mechanics",
  "Special second-round rules",
  "Legal / industry thallu bounds",
]

export default function Home() {
  return (
    <main className="min-h-[100dvh] flex flex-col px-6 py-16 max-w-5xl mx-auto w-full">

      {/* Header — left-aligned, not centered */}
      <header className="mb-12">
        <p className="text-xs font-mono uppercase tracking-[0.18em] text-[#059669] mb-3">
          Phase 1 · Foundation
        </p>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1] mb-4">
          Chit Fund Analytics
        </h1>
        <p className="text-[#94A3B8] text-lg max-w-[55ch] leading-relaxed">
          Private family chit fund tracker. Database schema and security
          foundation established. UI and analytics arrive in later phases.
        </p>
      </header>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">

        {/* Left column */}
        <div className="flex flex-col gap-6">

          {/* Database tables */}
          <section aria-labelledby="schema-heading">
            <h2
              id="schema-heading"
              className="text-sm font-mono uppercase tracking-[0.14em] text-[#334155] mb-4"
            >
              Database Schema
            </h2>
            <div className="flex flex-col gap-2" role="list">
              {SCHEMA_TABLES.map((table) => (
                <div
                  key={table.name}
                  role="listitem"
                  id={`table-${table.name}`}
                  className="flex items-start gap-3 rounded-xl bg-[#192134] border border-[rgba(255,255,255,0.06)] px-4 py-3"
                >
                  <span className="text-base leading-none mt-0.5" aria-hidden="true">
                    {table.icon}
                  </span>
                  <div>
                    <p className="text-sm font-mono text-[#E2E8F0]">{table.name}</p>
                    <p className="text-xs text-[#64748B] mt-0.5">{table.purpose}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">

          {/* Security model */}
          <section aria-labelledby="security-heading">
            <h2
              id="security-heading"
              className="text-sm font-mono uppercase tracking-[0.14em] text-[#334155] mb-4"
            >
              Security Model
            </h2>
            <div className="rounded-xl bg-[#192134] border border-[rgba(255,255,255,0.06)] px-4 py-4">
              <ul className="flex flex-col gap-2.5" role="list">
                {SECURITY_ITEMS.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-[#CBD5E1]">
                    <span className="text-[#059669] mt-0.5 flex-shrink-0" aria-hidden="true">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Unknown financial rules */}
          <section aria-labelledby="unknown-heading">
            <h2
              id="unknown-heading"
              className="text-sm font-mono uppercase tracking-[0.14em] text-[#334155] mb-4"
            >
              Unverified — Not Implemented
            </h2>
            <div className="rounded-xl bg-[#1a1020] border border-[rgba(251,191,36,0.12)] px-4 py-4">
              <p className="text-xs text-[#FBBF24] mb-3 font-mono">
                These rules are NOT encoded until confirmed from real data.
              </p>
              <ul className="flex flex-col gap-2" role="list">
                {UNKNOWN_RULES.map((rule) => (
                  <li key={rule} className="flex items-start gap-2.5 text-sm text-[#94A3B8]">
                    <span className="text-[#FBBF24] mt-0.5 flex-shrink-0" aria-hidden="true">?</span>
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Verified formula */}
          <section aria-labelledby="formula-heading">
            <h2
              id="formula-heading"
              className="text-sm font-mono uppercase tracking-[0.14em] text-[#334155] mb-4"
            >
              Verified Formula (Normal Auction)
            </h2>
            <div className="rounded-xl bg-[#192134] border border-[rgba(255,255,255,0.06)] px-4 py-4 font-mono text-xs leading-relaxed text-[#94A3B8] space-y-1">
              <p><span className="text-[#059669]">net_thallu</span>         = thallu − commission</p>
              <p><span className="text-[#059669]">member_thallu</span>      = net_thallu ÷ member_count</p>
              <p><span className="text-[#059669]">non_winner_payment</span>  = base_installment − member_thallu</p>
              <hr className="border-[rgba(255,255,255,0.06)] my-2" />
              <p className="text-[#475569]">
                Example: ₹3L face · ₹12k base · 25 members · ₹56k thallu · ₹7.5k commission
              </p>
              <p className="text-[#475569]">
                → net ₹48,500 · per-member ₹1,940 · non-winner pays ₹10,060
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Footer status bar */}
      <footer className="mt-12 pt-6 border-t border-[rgba(255,255,255,0.06)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full bg-[#059669]"
            aria-hidden="true"
          />
          <span className="text-sm text-[#64748B]">
            Phase 1 complete — schema + security ready
          </span>
        </div>
        <p className="text-xs font-mono text-[#334155]">
          Next.js 16 · Supabase PostgreSQL · TypeScript
        </p>
      </footer>
    </main>
  )
}
