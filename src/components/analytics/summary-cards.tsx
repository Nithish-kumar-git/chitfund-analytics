import { Card } from '@/components/ui/card';
import { ChitSummary, PortfolioSummary } from '@/lib/analytics/summary';
import { AlertTriangle, TrendingDown, TrendingUp, Activity, IndianRupee, Layers } from 'lucide-react';

export function ChitSummaryCards({ summary }: { summary: ChitSummary }) {
  if (summary.roundsRecorded === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <Card className="p-4 flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#64748B]">
          <Activity className="h-4 w-4" />
          Rounds
        </div>
        <div className="text-2xl font-semibold text-[#E2E8F0]">
          {summary.roundsRecorded} <span className="text-sm text-[#475569] font-normal">/ {summary.totalRounds}</span>
        </div>
      </Card>
      
      <Card className="p-4 flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#64748B]">
          <IndianRupee className="h-4 w-4" />
          Avg Thallu
        </div>
        <div className="text-2xl font-semibold text-[#E2E8F0]">
          {summary.avgThallu != null ? `₹${Math.round(summary.avgThallu).toLocaleString('en-IN')}` : '—'}
        </div>
      </Card>

      <Card className="p-4 flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#64748B]">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          Max Thallu
        </div>
        <div className="text-2xl font-semibold text-[#E2E8F0]">
          {summary.maxThallu != null ? `₹${summary.maxThallu.toLocaleString('en-IN')}` : '—'}
        </div>
      </Card>

      <Card className="p-4 flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#64748B]">
          <TrendingDown className="h-4 w-4 text-rose-500" />
          Min Thallu
        </div>
        <div className="text-2xl font-semibold text-[#E2E8F0]">
          {summary.minThallu != null ? `₹${summary.minThallu.toLocaleString('en-IN')}` : '—'}
        </div>
      </Card>
    </div>
  );
}

export function PortfolioSummaryCards({ summary }: { summary: PortfolioSummary }) {
  return (
    <>
      {summary.unverifiedChits > 0 && (
        <Card className="p-4 mb-4 border border-dashed border-amber-900/30 bg-amber-900/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-amber-200">Data Verification Needed</p>
              <p className="text-xs text-amber-400/80">You have {summary.unverifiedChits} completed chit{summary.unverifiedChits === 1 ? '' : 's'} pending final cash flow verification.</p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-5 flex flex-col gap-2 border-[#1E293B] bg-[#0F172A]/50">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#64748B]">
            <Layers className="h-4 w-4" />
            Total Chits
          </div>
          <div className="text-3xl font-semibold text-[#E2E8F0]">
            {summary.totalChits}
          </div>
          <div className="text-xs text-[#475569]">{summary.activeChits} active</div>
        </Card>

        <Card className="p-5 flex flex-col gap-2 border-[#1E293B] bg-[#0F172A]/50">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#64748B]">
            <IndianRupee className="h-4 w-4 text-emerald-500" />
            Total Face Value
          </div>
          <div className="text-3xl font-semibold text-[#E2E8F0]">
            {summary.totalFaceValue > 0 ? `₹${summary.totalFaceValue.toLocaleString('en-IN')}` : '—'}
          </div>
        </Card>

        <Card className="p-5 flex flex-col gap-2 border-[#1E293B] bg-[#0F172A]/50">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#64748B]">
            <TrendingDown className="h-4 w-4 text-rose-500" />
            Total Paid
          </div>
          <div className="text-3xl font-semibold text-[#E2E8F0]">
            ₹{summary.totalPaid.toLocaleString('en-IN')}
          </div>
        </Card>

        <Card className="p-5 flex flex-col gap-2 border-[#1E293B] bg-[#0F172A]/50">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#64748B]">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Total Received
          </div>
          <div className="text-3xl font-semibold text-[#E2E8F0]">
            ₹{summary.totalReceived.toLocaleString('en-IN')}
          </div>
        </Card>
      </div>
    </>
  );
}
