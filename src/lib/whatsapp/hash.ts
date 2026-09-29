/**
 * Chit Fund Analytics — Content Hash
 *
 * Deterministic content hash for normalised WhatsApp message text.
 *
 * Uses djb2 (pure TypeScript, no external dependency, no Node crypto).
 * The hash is used by the future ingestion layer to detect duplicate messages.
 * Database-level deduplication is NOT implemented in Phase 2B.
 *
 * The hash is computed over the NORMALISED text (after whitespace/artifact
 * cleanup), so two messages that differ only in formatting produce the
 * same hash.
 */

import { djb2Hash } from './normalize'

/**
 * Returns a deterministic content hash for a normalised message string.
 * Format: "djb2:<8-char-hex>" — prefixed to distinguish from SHA-256 hashes
 * that will be used at the database layer (matching source_messages.content_hash).
 *
 * @param normalisedText - Output of normaliseMessage()
 */
export function contentHash(normalisedText: string): string {
  return `djb2:${djb2Hash(normalisedText)}`
}

/**
 * Returns true if two normalised message strings hash to the same value.
 * Use this to detect functionally duplicate messages during testing/validation.
 * The ingestion layer will enforce uniqueness at the database level.
 */
export function isSameContent(a: string, b: string): boolean {
  return contentHash(a) === contentHash(b)
}
