import { createClient } from '@/lib/supabase/server'
import type { Chit } from '@/types/database'
import { BookOpen, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { computePortfolioSummary } from '@/lib/analytics/summary'
import { PortfolioSummaryCards } from '@/components/analytics/summary-cards'


export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: chits } = await supabase
    .from('chits')
    .select('id, name, status, face_value, base_installment')
    .order('created_at', { ascending: false })

  const portfolioSummary = computePortfolioSummary((chits ?? []) as Chit[])

  return (
    <div>
      <header className="mb-8">
        <p className="text-xs font-mono uppercase tracking-widest text-[#059669] mb-2">Dashboard</p>
        <h1 className="text-2xl font-semibold text-[#E2E8F0] tracking-tight">Overview</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
        </p>
      </header>

      <PortfolioSummaryCards summary={portfolioSummary} />

      {/* Recent chits */}
      <section aria-labelledby="recent-heading">
        <div className="flex items-center justify-between mb-4">
          <h2 id="recent-heading" className="text-sm font-mono uppercase tracking-wider text-[#475569]">
            Recent Chits
          </h2>
          <Link
            href="/chits"
            className="text-xs text-[#3B82F6] hover:text-[#60A5FA] transition-colors"
          >
            View all →
          </Link>
        </div>

        {!chits || chits.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-8 w-8 text-[#334155] mb-3" aria-hidden="true" />
            <p className="text-sm text-[#64748B]">No chits yet.</p>
            <Link
              href="/chits/new"
              className="mt-4 text-xs text-[#3B82F6] hover:text-[#60A5FA] underline underline-offset-2 transition-colors"
            >
              Add your first chit
            </Link>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {chits.slice(0, 5).map((c: Pick<Chit, 'id' | 'name' | 'status' | 'face_value' | 'base_installment'>) => (
              <Link key={c.id} href={`/chits/${c.id}`}>
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#192134] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-colors duration-150">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-[#E2E8F0]">{c.name}</p>
                      <p className="text-xs text-[#64748B]">
                        ₹{Number(c.face_value).toLocaleString('en-IN')} face value
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
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
        'inline-flex text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md border',
        styles[status] ?? styles['ARCHIVED'],
      ].join(' ')}
    >
      {status}
    </span>
  )
}
