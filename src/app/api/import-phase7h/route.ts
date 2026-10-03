import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

function hashString(str: string) {
  return crypto.createHash('sha256').update(str).digest('hex')
}

function parseWhatsAppExport(filename: string, groupCode: string) {
  const filePath = path.join(/*turbopackIgnore: true*/ process.cwd(), filename)
  if (!fs.existsSync(filePath)) return []
  
  const content = fs.readFileSync(filePath, 'utf-8')
  const messages = content.split(/(?=\[\d{2}\/\d{2}(?:\/\d{4})?, \d{2}:\d{2}\])/)
  
  const records: any[] = []
  messages.forEach(msg => {
    if (!msg.trim()) return
    const dateMatch = msg.match(/\[(\d{2}\/\d{2}(?:\/\d{4})?),[^\]]*\]/)
    const rawDate = dateMatch ? dateMatch[1] : null
    
    const roundMatch = msg.match(/(\d+)\s*(?:st|nd|rd|th)?\s+(?:chit|month)/i)
    const roundNumber = roundMatch ? parseInt(roundMatch[1], 10) : null
    
    const isSpecialNoAuctionText = msg.includes("தள்ளு இல்லை")
    
    let thallu = null
    if (!isSpecialNoAuctionText) {
      const thalluMatch = msg.match(/தள்ளு\s+(\d+)/)
      if (thalluMatch) thallu = parseInt(thalluMatch[1], 10)
    }
    if (!isSpecialNoAuctionText && msg.match(/தள்ளு\s+0/)) thallu = 0
    
    let commission = null
    const commMatch = msg.match(/கமிஷன்\s+(\d+)/)
    if (commMatch) commission = parseInt(commMatch[1], 10)
    
    let onePersonThallu = null
    const optMatch = msg.match(/ஒரு நபர் தள்ளு\s+(\d+)/)
    if (optMatch) onePersonThallu = parseInt(optMatch[1], 10)
    
    let payment = null
    const payMatch = msg.match(/கட்ட வேண்டிய தொகை\s+(\d+)/)
    if (payMatch) payment = parseInt(payMatch[1], 10)

    if (roundNumber) {
      let eventType = 'NORMAL'
      if (isSpecialNoAuctionText) {
        eventType = 'SPECIAL_NO_AUCTION'
      } else if (thallu === 0 && commission === 0 && payment === 12000 && groupCode === 'B' && roundNumber === 2) {
        eventType = 'UNKNOWN'
      }
      
      let calcStatus = 'VERIFIED_FORMULA'
      if (eventType === 'NORMAL' && thallu !== null && commission !== null && onePersonThallu !== null) {
        const members = groupCode === 'C' ? 20 : 25
        const baseInst = groupCode === 'C' ? 15000 : 12000
        const net = thallu - commission
        const calcOne = net / members
        const calcPay = baseInst - calcOne
        if (calcOne !== onePersonThallu || calcPay !== payment) {
          calcStatus = 'FLAGGED_MISMATCH'
        }
      } else if (eventType !== 'NORMAL') {
        calcStatus = 'MANUAL_OVERRIDE'
      }

      let sqlDate = null
      let notesObj: any = { original_date: rawDate }
      if (rawDate && rawDate.match(/\d{4}/)) {
        const parts = rawDate.split('/')
        sqlDate = `${parts[2]}-${parts[1]}-${parts[0]}`
      } else {
        notesObj.warning = 'Missing year in source'
      }

      records.push({
        groupCode,
        rawText: msg.trim(),
        contentHash: hashString(msg.trim()),
        roundNumber,
        eventType,
        thallu,
        commission,
        onePersonThallu,
        payment,
        calcStatus,
        sqlDate,
        notes: JSON.stringify(notesObj)
      })
    }
  })
  return records
}

async function runImport(request: Request, isDryRun: boolean) {
  const supabase = await createClient()
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  
  if (userErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const aRecords = parseWhatsAppExport('3L-Chit-A.txt', 'A')
  const bRecords = parseWhatsAppExport('3L-Chit-B.txt', 'B')
  const cRecords = parseWhatsAppExport('3L-Chit-C.txt', 'C')
  const allRecords = [...aRecords, ...bRecords, ...cRecords]

  const report = {
    totalDetected: allRecords.length,
    counts: { A: aRecords.length, B: bRecords.length, C: cRecords.length },
    mismatches: allRecords.filter(r => r.calcStatus === 'FLAGGED_MISMATCH').map(r => `${r.groupCode}-${r.roundNumber}`),
    unresolvedDates: allRecords.filter(r => r.sqlDate === null).length,
    unknownClassifications: allRecords.filter(r => r.eventType === 'UNKNOWN').map(r => `${r.groupCode}-${r.roundNumber}`),
    specialNoAuction: allRecords.filter(r => r.eventType === 'SPECIAL_NO_AUCTION').map(r => `${r.groupCode}-${r.roundNumber}`),
    duplicatesSkipped: 0,
    messagesInserted: 0,
    eventsInserted: 0,
    ledgerEntriesCreated: 0,
    dryRun: isDryRun,
    warnings: [] as string[]
  }

  if (isDryRun) {
    return NextResponse.json(report)
  }

  // IMPORT EXECUTION
  const chitsData = [
    { name: '3L A Group', code: 'A', fv: 300000, dur: 25, mem: 25, base: 12000 },
    { name: '3L B Group', code: 'B', fv: 300000, dur: 25, mem: 25, base: 12000 },
    { name: '3L C Group', code: 'C', fv: 300000, dur: 20, mem: 20, base: 15000 }
  ]
  
  const chitIds: Record<string, string> = {}
  
  for (const c of chitsData) {
    let { data: existing } = await supabase.from('chits')
      .select('id, name, face_value, duration_months, member_count, base_installment')
      .eq('name', c.name)
      .eq('profile_id', user.id)
      .single() as { data: any }
      
    if (existing) {
      if (existing.face_value !== c.fv || existing.duration_months !== c.dur || existing.member_count !== c.mem || existing.base_installment !== c.base) {
        return NextResponse.json({ error: `Chit ${c.name} exists with conflicting configuration.` }, { status: 400 })
      }
    } else {
      const { data: inserted, error } = await (supabase.from('chits') as any).insert({
        profile_id: user.id,
        name: c.name,
        face_value: c.fv,
        duration_months: c.dur,
        member_count: c.mem,
        base_installment: c.base,
        status: 'ACTIVE',
        commission_type: 'FLAT_AMOUNT',
        commission_value: 7500
      }).select().single()
      if (error) return NextResponse.json({ error: `Failed to create chit ${c.name}: ${error.message}` }, { status: 500 })
      existing = inserted
    }
    chitIds[c.code] = existing.id
  }

  for (const r of allRecords) {
    const chitId = chitIds[r.groupCode]
    
    const { data: existingMsg } = await supabase.from('source_messages')
      .select('id, matched_auction_event_id')
      .eq('profile_id', user.id)
      .eq('content_hash', r.contentHash)
      .single() as { data: any }
      
    let msg = existingMsg
    
    if (existingMsg) {
      // Check if the existing message has a valid linked auction_event
      if (existingMsg.matched_auction_event_id) {
        const { data: linkedEvent } = await supabase.from('auction_events')
          .select('id')
          .eq('id', existingMsg.matched_auction_event_id)
          .single() as { data: any }
        
        if (linkedEvent) {
          // True duplicate: message exists and has valid event link
          report.duplicatesSkipped++
          continue
        }
      }
      // Orphaned message: exists but no valid event link - continue to create/link event
      // Don't increment messagesInserted since message already exists
    } else {
      // No existing message - create new one
      const { data: newMsg, error: msgErr } = await (supabase.from('source_messages') as any).insert({
        profile_id: user.id,
        chit_id: chitId,
        raw_text: r.rawText,
        content_hash: r.contentHash,
        notes: r.notes,
        parse_status: 'PARSED'
      }).select().single()
      
      if (msgErr) {
        report.warnings.push(`Failed to insert message for ${r.groupCode}-${r.roundNumber}: ${msgErr.message}`)
        continue
      }
      msg = newMsg
      report.messagesInserted++
    }
    
    const { data: evt, error: evtErr } = await (supabase.from('auction_events') as any).upsert({
      profile_id: user.id,
      chit_id: chitId,
      round_number: r.roundNumber,
      event_type: r.eventType,
      thallu: r.thallu,
      commission: r.commission,
      net_thallu: r.thallu !== null && r.commission !== null ? r.thallu - r.commission : null,
      member_thallu: r.onePersonThallu,
      non_winner_payment: r.payment,
      won_by_us: null,
      auction_date: r.sqlDate,
      calculation_status: r.calcStatus,
      source_message_id: msg.id
    }, { onConflict: 'chit_id, round_number', ignoreDuplicates: true }).select().single()
    
    if (evtErr) {
      report.warnings.push(`Failed to insert event for ${r.groupCode}-${r.roundNumber}: ${evtErr.message}`)
      continue
    }
    
    if (evt) {
      await (supabase.from('source_messages') as any).update({ matched_auction_event_id: evt.id }).eq('id', msg.id)
      report.eventsInserted++
    } else {
      report.warnings.push(`Event ${r.groupCode}-${r.roundNumber} already existed, skipped.`)
    }
  }

  return NextResponse.json(report)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('dryRun') !== 'true') {
    return NextResponse.json({ error: 'GET only supports dryRun=true. Use POST for actual import.' }, { status: 400 })
  }
  return runImport(request, true)
}

export async function POST(request: Request) {
  return runImport(request, false)
}
