import { Card } from '@/components/ui/card'
import { PiggyBank } from 'lucide-react'
import type { InstallmentSavingsMetrics } from '@/lib/financial/savings'

interface Props {
  metrics: InstallmentSavingsMetrics | null
}

export function InstallmentSavingsCard({ metrics }: Props) {
  if (!metrics) return null

  return (
    <Card className="p-4 sm:p-5 relative overflow-hidden group">
      {/* Background decoration */}
      <div className="absolute right-0 top-0 -mr-6 -mt-6 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-500 ease-out">
        <PiggyBank className="w-32 h-32" aria-hidden="true" />
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 mb-1.5">
          <PiggyBank className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
          <h3 className="text-xs font-mono uppercase tracking-widest text-[#475569]">
            Installment Savings
          </h3>
        </div>

        <p className="text-[#94A3B8] text-sm mb-4 max-w-sm">
          Amount saved compared with the normal installment.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[#64748B] uppercase font-mono tracking-wider">
              Normal Installments
            </span>
            <span className="text-xl font-semibold text-[#E2E8F0]">
              ₹{metrics.totalNormalInstallments.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-[#64748B] uppercase font-mono tracking-wider">
              Actual Paid
            </span>
            <span className="text-xl font-semibold text-[#E2E8F0]">
              ₹{metrics.totalActualPaid.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-[#64748B] uppercase font-mono tracking-wider">
              Total Saved
            </span>
            <span className="text-2xl font-bold text-[#15803d]">
              ₹{metrics.totalSaved.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}