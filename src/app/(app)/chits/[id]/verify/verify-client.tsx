'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { confirmFormula, confirmSource } from '../verify-actions'
import { correctLedgerEntry } from '../ledger-actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type EventProps = {
  id: string
  round_number: number
  event_type: string
  calculation_status: string
  auction_date: string | null
  thallu: number | null
  commission: number | null
  won_by_us: boolean | null
  actual_payment: number | null
  payment_date: string | null
  needs_verification: boolean
  calculated_data: {
    expected_payment: number
    member_thallu: number
    net_thallu: number
  } | null
  ledger_entries: any[]
}

export function VerifyClient({ chit, events }: { chit: any; events: EventProps[] }) {
  const [filter, setFilter] = useState<'ALL' | 'MISMATCH' | 'NEEDS_VERIFICATION' | 'SPECIAL'>('ALL')
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  // Dialog state maps
  const [showSourceConfirm, setShowSourceConfirm] = useState<string | null>(null)
  const [showFormulaConfirm, setShowFormulaConfirm] = useState<string | null>(null)
  const [showManualOverride, setShowManualOverride] = useState<string | null>(null)

  // Manual Override Form State
  const [overrideAmount, setOverrideAmount] = useState<string>('')
  const [overrideNotes, setOverrideNotes] = useState<string>('')

  const filteredEvents = events.filter((e) => {
    if (filter === 'MISMATCH') return e.calculation_status === 'FLAGGED_MISMATCH'
    if (filter === 'NEEDS_VERIFICATION') return e.needs_verification
    if (filter === 'SPECIAL') return e.event_type === 'SPECIAL_NO_AUCTION'
    return true
  })

  // Chit Level verification progress
  const applicableNormalRounds = events.filter(e => e.event_type === 'NORMAL')
  const verifiedNormalRounds = applicableNormalRounds.filter(e => 
    e.calculation_status === 'VERIFIED_FORMULA' || 
    e.calculation_status === 'CONFIRM_SOURCE' || 
    e.calculation_status === 'MANUAL_OVERRIDE'
  )

  const handleAction = async (action: () => Promise<{success: boolean, error?: string}>, actionId: string) => {
    setLoadingAction(actionId)
    setErrorMsg(null)
    const res = await action()
    if (!res.success) {
      setErrorMsg(res.error || 'Action failed')
    } else {
      setShowSourceConfirm(null)
      setShowFormulaConfirm(null)
      setShowManualOverride(null)
      setOverrideAmount('')
      setOverrideNotes('')
    }
    setLoadingAction(null)
  }

  const renderStatusBadge = (status: string, needsVerification: boolean, eventType: string) => {
    if (eventType === 'SPECIAL_NO_AUCTION') {
      return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded-full">No Auction</span>
    }
    
    switch (status) {
      case 'VERIFIED_FORMULA':
      case 'CONFIRM_SOURCE':
      case 'MANUAL_OVERRIDE':
        return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">{status}</span>
      case 'FLAGGED_MISMATCH':
        return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded-full">FLAGGED MISMATCH</span>
      default:
        return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${needsVerification ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}`}>{status}</span>
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress & Filters */}
      <Card>
        <div className="pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h3 className="font-semibold text-lg">Verification Progress</h3>
            <p className="text-sm text-muted-foreground">
              {verifiedNormalRounds.length} / {applicableNormalRounds.length} applicable NORMAL rounds explicitly verified
            </p>
            {applicableNormalRounds.length === verifiedNormalRounds.length && (
              <p className="text-sm font-semibold text-green-600 mt-1">
                Eligible for final verification (if chit is COMPLETED).
              </p>
            )}
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <Button variant={filter === 'ALL' ? 'primary' : 'secondary'} onClick={() => setFilter('ALL')}>All ({events.length})</Button>
            <Button variant={filter === 'NEEDS_VERIFICATION' ? 'primary' : 'secondary'} onClick={() => setFilter('NEEDS_VERIFICATION')}>
              Needs Verification ({events.filter(e => e.needs_verification).length})
            </Button>
            <Button variant={filter === 'MISMATCH' ? 'primary' : 'secondary'} onClick={() => setFilter('MISMATCH')}>
              Mismatch ({events.filter(e => e.calculation_status === 'FLAGGED_MISMATCH').length})
            </Button>
            <Button variant={filter === 'SPECIAL' ? 'primary' : 'secondary'} onClick={() => setFilter('SPECIAL')}>
              Special ({events.filter(e => e.event_type === 'SPECIAL_NO_AUCTION').length})
            </Button>
          </div>
        </div>
      </Card>

      {errorMsg && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-md">
          {errorMsg}
        </div>
      )}

      {/* Queue Items */}
      <div className="space-y-6">
        {filteredEvents.map(event => {
          const isMismatch = event.calculation_status === 'FLAGGED_MISMATCH'
          const isSpecial = event.event_type === 'SPECIAL_NO_AUCTION'
          
          return (
            <Card key={event.id} className={isMismatch ? 'border-red-200 shadow-sm' : ''}>
              <CardHeader className="pb-3 bg-muted/30">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">Round {event.round_number}</CardTitle>
                    <div className="text-sm text-muted-foreground mt-1">
                      {event.auction_date ? `Auction: ${event.auction_date}` : <span className="text-red-500 font-medium">Auction Date: Missing</span>}
                      {' | '}
                      {event.payment_date ? `Payment: ${event.payment_date}` : 'Payment Date: Missing'}
                    </div>
                  </div>
                  <div>
                    {renderStatusBadge(event.calculation_status, event.needs_verification, event.event_type)}
                  </div>
                </div>
              </CardHeader>

              <div className="pt-4">
                {isSpecial ? (
                  <p className="text-muted-foreground text-sm">
                    No auction formula required. This round does not block financial verification.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Source Values */}
                    <div className="space-y-2 text-sm">
                      <h4 className="font-semibold text-gray-700 uppercase tracking-wider text-xs mb-3">Source / Actual Values</h4>
                      <div className="flex justify-between"><span>Source Thallu:</span> <span className="font-medium">{event.thallu ?? '-'}</span></div>
                      <div className="flex justify-between"><span>Commission:</span> <span className="font-medium">{event.commission ?? '-'}</span></div>
                      <div className="flex justify-between border-t pt-2 mt-2">
                        <span>Actual Payment:</span> 
                        <span className="font-bold">{event.actual_payment ?? '-'}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground mt-1">
                        <span>Winner:</span> 
                        <span>{event.won_by_us === true ? 'Yes' : event.won_by_us === false ? 'No' : 'Unknown'}</span>
                      </div>
                    </div>

                    {/* Calculated Values */}
                    <div className="space-y-2 text-sm border-l md:pl-8">
                      <h4 className="font-semibold text-gray-700 uppercase tracking-wider text-xs mb-3">Formula Calculated</h4>
                      {event.calculated_data ? (
                        <>
                          <div className="flex justify-between"><span>Net Thallu:</span> <span>{event.calculated_data.net_thallu.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span>Member Thallu:</span> <span>{event.calculated_data.member_thallu.toFixed(2)}</span></div>
                          <div className="flex justify-between border-t pt-2 mt-2">
                            <span>Expected Payment:</span> 
                            <span className="font-bold">{event.calculated_data.expected_payment.toFixed(2)}</span>
                          </div>
                        </>
                      ) : (
                        <p className="text-muted-foreground">Insufficient data for calculation.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Discrepancy Highlight */}
                {isMismatch && event.calculated_data && (
                  <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-md">
                    <p className="text-sm text-red-800 font-medium mb-1">
                      Formula Mismatch Detected
                    </p>
                    <p className="text-xs text-red-700 mb-2">
                      Based on standard formula: Base Installment ({chit.base_installment}) - [ (Thallu - Commission) / {chit.member_count} members ] = {event.calculated_data.expected_payment.toFixed(2)}
                    </p>
                    <div className="flex items-center gap-4 text-sm font-semibold">
                      <span className="text-red-900">Expected: {event.calculated_data.expected_payment.toFixed(2)}</span>
                      <span className="text-gray-400">vs</span>
                      <span className="text-red-900">Actual: {event.actual_payment ?? 'Missing'}</span>
                      <span className="text-red-600 border-l pl-4">
                        Difference: {event.actual_payment ? Math.abs(event.calculated_data.expected_payment - event.actual_payment).toFixed(2) : '-'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Decision Actions */}
                {event.needs_verification && !isSpecial && (
                  <div className="mt-6 pt-4 border-t flex flex-wrap gap-3">
                    
                    {/* Confirm Formula */}
                    {showFormulaConfirm === event.id ? (
                      <div className="w-full p-4 bg-gray-50 border rounded-md">
                        <p className="text-sm font-medium mb-3">The formula/result has been reviewed and explicitly accepted.</p>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleAction(() => confirmFormula({ chit_id: chit.id, auction_event_id: event.id }), `formula-${event.id}`)} disabled={loadingAction === `formula-${event.id}`}>
                            {loadingAction === `formula-${event.id}` ? 'Saving...' : 'Yes, Confirm Formula'}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setShowFormulaConfirm(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : showSourceConfirm === event.id ? (
                      /* Confirm Source */
                      <div className="w-full p-4 bg-gray-50 border rounded-md">
                        <p className="text-sm font-medium mb-3">Confirming source means you accept the recorded source value even though it differs from the calculated result.</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="danger" onClick={() => handleAction(() => confirmSource({ chit_id: chit.id, auction_event_id: event.id }), `source-${event.id}`)} disabled={loadingAction === `source-${event.id}`}>
                            {loadingAction === `source-${event.id}` ? 'Saving...' : 'Yes, Confirm Source'}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setShowSourceConfirm(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : showManualOverride === event.id ? (
                      /* Manual Override */
                      <div className="w-full p-4 bg-gray-50 border rounded-md space-y-4">
                        <p className="text-sm font-medium">This creates a new correction entry while preserving the original financial record.</p>
                        
                        <div className="grid grid-cols-2 gap-4 max-w-md">
                          <div className="space-y-1">
                            <Label>Corrected Payment Amount</Label>
                            <Input 
                              type="number" 
                              value={overrideAmount} 
                              onChange={(e) => setOverrideAmount(e.target.value)}
                              placeholder="e.g. 15000"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Notes (Optional)</Label>
                            <Input 
                              type="text" 
                              value={overrideNotes} 
                              onChange={(e) => setOverrideNotes(e.target.value)}
                              placeholder="Reason for correction"
                            />
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button 
                            size="sm" 
                            onClick={() => {
                              // Find original installment ledger entry
                              const original = event.ledger_entries.find(e => e.entry_type === 'INSTALLMENT_PAID' && !e.superseded_by_id)
                              if (!original) {
                                setErrorMsg('No original installment entry found to correct.')
                                return
                              }
                              handleAction(() => correctLedgerEntry({
                                chit_id: chit.id,
                                original_entry_id: original.id,
                                new_amount: Number(overrideAmount),
                                notes: overrideNotes
                              }), `override-${event.id}`)
                            }}
                            disabled={!overrideAmount || loadingAction === `override-${event.id}`}
                          >
                            {loadingAction === `override-${event.id}` ? 'Saving...' : 'Apply Correction'}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setShowManualOverride(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      /* Action Buttons */
                      <>
                        <Button 
                          variant="primary" 
                          size="sm"
                          onClick={() => setShowFormulaConfirm(event.id)}
                        >
                          Confirm Formula
                        </Button>

                        {isMismatch && (
                          <Button 
                            variant="danger" 
                            size="sm"
                            onClick={() => setShowSourceConfirm(event.id)}
                          >
                            Confirm Source
                          </Button>
                        )}
                        
                        {event.actual_payment !== null && (
                          <Button 
                            variant="secondary" 
                            size="sm"
                            onClick={() => setShowManualOverride(event.id)}
                          >
                            Manual Override
                          </Button>
                        )}

                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {/* Do nothing, just leave as is */}}
                        >
                          Leave Unresolved
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )
        })}
        {filteredEvents.length === 0 && (
          <div className="text-center p-12 bg-gray-50 border rounded-lg text-muted-foreground">
            No rounds found for the selected filter.
          </div>
        )}
      </div>
    </div>
  )
}
