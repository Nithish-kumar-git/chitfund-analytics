import { classifyQualityFlag } from './quality-classification'
import { DataQualityFlag } from '@/lib/statement/build-statement-data'
import { describe, it, expect } from 'vitest'

describe('Quality Classification', () => {
  it('classifies FLAGGED_MISMATCH as CRITICAL', () => {
    expect(classifyQualityFlag({ kind: 'FLAGGED_MISMATCH', round: 1, message: '' })).toBe('CRITICAL')
  })
  it('classifies UNKNOWN_EVENT as CRITICAL', () => {
    expect(classifyQualityFlag({ kind: 'UNKNOWN_EVENT', round: 1, message: '' })).toBe('CRITICAL')
  })
  it('classifies MISSING_WINNER as CRITICAL', () => {
    expect(classifyQualityFlag({ kind: 'MISSING_WINNER', round: 1, message: '' })).toBe('CRITICAL')
  })
  it('classifies MISSING_CASH_FLOW as CRITICAL', () => {
    expect(classifyQualityFlag({ kind: 'MISSING_CASH_FLOW', round: 1, message: '' })).toBe('CRITICAL')
  })
  it('classifies UNVERIFIED_COMPLETED as VERIFICATION', () => {
    expect(classifyQualityFlag({ kind: 'UNVERIFIED_COMPLETED', message: '' })).toBe('VERIFICATION')
  })
  it('classifies MISSING_AUCTION_DATE as METADATA', () => {
    expect(classifyQualityFlag({ kind: 'MISSING_AUCTION_DATE', round: 1, message: '' })).toBe('METADATA')
  })
})
