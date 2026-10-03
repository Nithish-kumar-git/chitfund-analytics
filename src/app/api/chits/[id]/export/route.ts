import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { generateExportWorkbook } from '@/lib/export/excel'
import type { Chit, AuctionEvent, LedgerEntry } from '@/types/database'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  // 1. Verify Authentication
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // 2. Fetch all data scoped to user and chit
  const { data: chits, error: chitsError } = await supabase
    .from('chits')
    .select('*')
    .eq('id', id)
    .eq('profile_id', user.id)

  const { data: auctionEvents, error: eventsError } = await supabase
    .from('auction_events')
    .select('*')
    .eq('chit_id', id)
    .eq('profile_id', user.id)

  const { data: ledgerEntries, error: ledgerError } = await supabase
    .from('ledger_entries')
    .select('*')
    .eq('chit_id', id)
    .eq('profile_id', user.id)

  if (chitsError || eventsError || ledgerError || !chits || chits.length === 0) {
    console.error('Data fetch error during export:', { chitsError, eventsError, ledgerError })
    return new NextResponse('Error fetching data for export', { status: 500 })
  }

  // 3. Generate Workbook
  // generateExportWorkbook uses generic structures, we can reuse it
  const wb = generateExportWorkbook(
    chits as Chit[],
    (auctionEvents ?? []) as AuctionEvent[],
    (ledgerEntries ?? []) as LedgerEntry[]
  )

  // 4. Create Buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  // 5. Return with proper headers
  const typedChits = chits as Chit[]
  const filename = `chit-statement-${typedChits[0].name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${new Date().toISOString().split('T')[0]}.xlsx`

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  })
}
