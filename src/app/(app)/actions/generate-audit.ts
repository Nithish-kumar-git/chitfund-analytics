'use server'

import { createClient } from '@/lib/supabase/server'
import { getCompletePortfolioState } from '@/lib/analytics/portfolio-state'
import { generateFinancialAudit } from '@/lib/export/audit'

export async function generateAuditAction() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: chits } = await supabase.from('chits').select('*').order('created_at', { ascending: false })
  const { data: ledgerEntries } = await supabase.from('ledger_entries').select('*')
  const { data: auctionEvents } = await supabase.from('auction_events').select('*')

  const state = getCompletePortfolioState(chits ?? [], auctionEvents ?? [], ledgerEntries ?? [])
  return generateFinancialAudit(state)
}
