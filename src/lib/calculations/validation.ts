/**
 * Chit Fund Analytics — Input Validation
 *
 * Validates NormalAuctionInput before the calculation engine runs.
 * Returns a (possibly empty) array of ValidationError.
 * An empty array means the input is valid.
 */

import type { NormalAuctionInput, ValidationError } from './types'

export function validateNormalAuctionInput(
  input: NormalAuctionInput,
): ValidationError[] {
  const errors: ValidationError[] = []

  // face_value must be > 0
  if (!isFinite(input.face_value) || input.face_value <= 0) {
    errors.push({
      field: 'face_value',
      message: `face_value must be greater than 0, got ${input.face_value}`,
    })
  }

  // base_installment must be >= 0
  if (!isFinite(input.base_installment) || input.base_installment < 0) {
    errors.push({
      field: 'base_installment',
      message: `base_installment must be >= 0, got ${input.base_installment}`,
    })
  }

  // member_count must be a positive integer
  if (
    !isFinite(input.member_count) ||
    input.member_count <= 0 ||
    !Number.isInteger(input.member_count)
  ) {
    errors.push({
      field: 'member_count',
      message: `member_count must be a positive integer, got ${input.member_count}`,
    })
  }

  // thallu must be >= 0
  if (!isFinite(input.thallu) || input.thallu < 0) {
    errors.push({
      field: 'thallu',
      message: `thallu must be >= 0, got ${input.thallu}`,
    })
  }

  // commission must be >= 0
  if (!isFinite(input.commission) || input.commission < 0) {
    errors.push({
      field: 'commission',
      message: `commission must be >= 0, got ${input.commission}`,
    })
  }

  // commission must not exceed thallu (for a normal auction this is a business rule violation)
  if (
    isFinite(input.thallu) &&
    isFinite(input.commission) &&
    input.thallu >= 0 &&
    input.commission >= 0 &&
    input.commission > input.thallu
  ) {
    errors.push({
      field: 'commission',
      message: `commission (${input.commission}) cannot exceed thallu (${input.thallu}) — this would produce a negative net_thallu`,
    })
  }

  return errors
}
