import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import type { Chit, ChitCompany } from '@/types/database'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { ArrowLeft, Calendar, Users, Layers, Percent, FileText } from 'lucide-react'

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-0 py-3 border-b border-[rgba(255,255,255,0.05)] last:border-0">
      <dt className="text-xs text-[#64748B] sm:w-44 shrink-0 font-mono uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-[#CBD5E1]">{value ?? <span className="text-[#334155] italic">—</span>}</dd>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-[#052e16] text-[#4ade80] border-[#14532d]',
    COMPLETED: 'bg-[#1e1b4b] text-[#818cf8] border-[#312e81]',
    EXITED: 'bg-[#1c1917] text-[#a8a29e] border-[#292524]',
    ARCHIVED: 'bg-[#1c1917] text-[#78716c] border-[#292524]',
  }
  return (
    <span
      className={[
        'inline-flex text-xs font-mono uppercase tracking-wider px-2.5 py-1 rounded-lg border',
        styles[status] ?? styles['ARCHIVED'],
      ].join(' ')}
    >
      {status}
    </span>
  )
}

function commissionDisplay(chit: Chit): string {
  const val = Number(chit.commission_value)
  if (chit.commission_type === 'PERCENTAGE') return `${val}%`
  if (chit.commission_type === 'FLAT_AMOUNT') return `₹${val.toLocaleString('en-IN')} flat`
  return `${val} (other)`
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ChitDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/')

  // RLS ensures only the owner can see this record
  const { data: chit, error } = await supabase
    .from('chits')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !chit) notFound()

  const typedChit = chit as Chit

  // Fetch company name if linked
  let companyName: string | null = null
  if (typedChit.company_id) {
    const { data: company } = await supabase
      .from('chit_companies')
      .select('name')
      .eq('id', typedChit.company_id)
      .single()
    companyName = (company as Pick<ChitCompany, 'name'> | null)?.name ?? null
  }

  return (
    <div>
      {/* Back link */}
      <Link
        href="/chits"
        className="inline-flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to Chits
      </Link>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-[#059669] mb-2">Chits › Detail</p>
          <h1 className="text-2xl font-semibold text-[#E2E8F0] tracking-tight">{typedChit.name}</h1>
          {typedChit.group_label && (
            <p className="text-sm text-[#475569] mt-0.5">{typedChit.group_label}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-3">
          <StatusBadge status={typedChit.status} />
          <Link
            href={`/chits/${typedChit.id}/ingest`}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2563EB] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Add WhatsApp Round
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Financial Structure */}
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#475569]">Financial Structure</span>
          </div>
          <dl>
            <DetailRow
              label="Face Value"
              value={`₹${Number(typedChit.face_value).toLocaleString('en-IN')}`}
            />
            <DetailRow label="Duration" value={`${typedChit.duration_months} months`} />
            <DetailRow label="Members" value={`${typedChit.member_count}`} />
            <DetailRow
              label="Base Installment"
              value={`₹${Number(typedChit.base_installment).toLocaleString('en-IN')} / month`}
            />
          </dl>
        </Card>

        {/* Commission */}
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Percent className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#475569]">Commission</span>
          </div>
          <dl>
            <DetailRow label="Type" value={typedChit.commission_type} />
            <DetailRow label="Value" value={commissionDisplay(typedChit)} />
            <DetailRow label="Notes" value={typedChit.commission_notes} />
          </dl>
        </Card>

        {/* Details */}
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#475569]">Details</span>
          </div>
          <dl>
            <DetailRow
              label="Start Date"
              value={
                typedChit.start_date
                  ? new Date(typedChit.start_date).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : null
              }
            />
            <DetailRow label="Group" value={typedChit.group_label} />
            <DetailRow label="Company" value={companyName} />
            <DetailRow
              label="Created"
              value={new Date(typedChit.created_at).toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            />
          </dl>
        </Card>

        {/* Members */}
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#475569]">Notes</span>
          </div>
          <dl>
            <DetailRow label="Notes" value={typedChit.notes} />
          </dl>
        </Card>
      </div>

      {/* Placeholder areas for future phases */}
      <div className="mt-8 flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-4 w-4 text-[#334155]" aria-hidden="true" />
          <span className="text-xs font-mono uppercase tracking-widest text-[#334155]">
            Auction History · Payment Ledger · Analytics
          </span>
        </div>
        <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.06)] px-5 py-8 text-center">
          <p className="text-xs text-[#334155]">
            Auction history and payment ledger will appear here in a later phase.
          </p>
        </div>
      </div>
    </div>
  )
}
