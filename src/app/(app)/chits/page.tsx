import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Chit } from '@/types/database'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { BookOpen, Plus, TrendingUp } from 'lucide-react'

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-[#052e16] text-[#4ade80] border-[#14532d]',
  COMPLETED: 'bg-[#1e1b4b] text-[#818cf8] border-[#312e81]',
  EXITED: 'bg-[#1c1917] text-[#a8a29e] border-[#292524]',
  ARCHIVED: 'bg-[#1c1917] text-[#78716c] border-[#292524]',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={[
        'inline-flex text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md border',
        STATUS_STYLES[status] ?? STATUS_STYLES['ARCHIVED'],
      ].join(' ')}
    >
      {status}
    </span>
  )
}

function ChitRow({ chit }: { chit: Chit }) {
  return (
    <Link
      href={`/chits/${chit.id}`}
      className="group flex items-center gap-4 px-4 py-4 bg-[#192134] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] rounded-xl transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]"
      aria-label={`View details for ${chit.name}`}
    >
      <TrendingUp className="h-4 w-4 text-[#3B82F6] flex-shrink-0" aria-hidden="true" />

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-[#E2E8F0] truncate">{chit.name}</span>
          {chit.group_label && (
            <span className="text-[10px] font-mono text-[#475569]">{chit.group_label}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#64748B]">
          <span>₹{Number(chit.face_value).toLocaleString('en-IN')} face value</span>
          <span>{chit.duration_months} months</span>
          <span>{chit.member_count} members</span>
          <span>₹{Number(chit.base_installment).toLocaleString('en-IN')}/month</span>
          {chit.start_date && (
            <span>From {new Date(chit.start_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' })}</span>
          )}
        </div>
      </div>

      <StatusBadge status={chit.status} />
    </Link>
  )
}

export default async function ChitsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/')

  const { data: chits, error } = await supabase
    .from('chits')
    .select('*')
    .order('created_at', { ascending: false })

  const chitList = (chits ?? []) as Chit[]
  const activeCount = chitList.filter((c) => c.status === 'ACTIVE').length

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-[#059669] mb-2">Chits</p>
          <h1 className="text-2xl font-semibold text-[#E2E8F0] tracking-tight">Your Chits</h1>
          {chitList.length > 0 && (
            <p className="text-sm text-[#64748B] mt-1">
              {chitList.length} total · {activeCount} active
            </p>
          )}
        </div>
        <Link href="/chits/new">
          <Button size="md">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Chit
          </Button>
        </Link>
      </header>

      {error && (
        <Card className="text-sm text-[#fca5a5]">
          Failed to load chits. Please try again.
        </Card>
      )}

      {!error && chitList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="h-10 w-10 text-[#1E293B] mb-4" aria-hidden="true" />
          <p className="text-base font-medium text-[#475569] mb-1">No chits yet</p>
          <p className="text-sm text-[#334155] mb-6">
            Add your first chit to start tracking.
          </p>
          <Link href="/chits/new">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Chit
            </Button>
          </Link>
        </div>
      ) : (
        <div role="list" aria-label="Chit list" className="flex flex-col gap-2">
          {chitList.map((chit) => (
            <div key={chit.id} role="listitem">
              <ChitRow chit={chit} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
