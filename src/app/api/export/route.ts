import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { generateExportWorkbook } from '@/lib/export/excel'
import type { Chit, AuctionEvent, LedgerEntry } from '@/types/database'

export async function GET() {
  const supabase = await createClient()

  // 1. Verify Authentication
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // 2. Fetch all data scoped to user (RLS enforces this automatically, but we also explicitly fetch)
  // For safety, we rely on Supabase RLS which already scopes to the authenticated user.
  const { data: chits, error: chitsError } = await supabase
    .from('chits')
    .select('*')

  const { data: auctionEvents, error: eventsError } = await supabase
    .from('auction_events')
    .select('*')

  const { data: ledgerEntries, error: ledgerError } = await supabase
    .from('ledger_entries')
    .select('*')

  if (chitsError || eventsError || ledgerError) {
    console.error('Data fetch error during export:', { chitsError, eventsError, ledgerError })
    return new NextResponse('Error fetching data for export', { status: 500 })
  }

  // 3. Generate Workbook
  const wb = generateExportWorkbook(
    (chits ?? []) as Chit[],
    (auctionEvents ?? []) as AuctionEvent[],
    (ledgerEntries ?? []) as LedgerEntry[]
  )

  // 4. Create Buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  // 5. Return with proper headers
  const filename = `chit-fund-report-${new Date().toISOString().split('T')[0]}.xlsx`

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  })
}
