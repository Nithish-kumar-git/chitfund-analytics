'use client'

import { useActionState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createChitAction, updateChitAction, type ActionState } from '@/lib/chits/actions'
import { chitFormSchema, type ChitFormValues } from '@/lib/chits/schema'
import type { Chit, ChitCompany } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField, ErrorMessage } from '@/components/ui/form-field'

const INITIAL_STATE: ActionState = { status: 'idle' }

interface AddChitFormProps {
  companies: Pick<ChitCompany, 'id' | 'name'>[]
  initialData?: Chit
}

export function AddChitForm({ companies, initialData }: AddChitFormProps) {
  const isEdit = Boolean(initialData)
  const [actionState, formAction, isPending] = useActionState(
    isEdit ? updateChitAction : createChitAction,
    INITIAL_STATE
  )

  const {
    register,
    formState: { errors },
  } = useForm<ChitFormValues>({
    resolver: zodResolver(chitFormSchema) as any,
    defaultValues: initialData
      ? {
          name: initialData.name,
          group_label: initialData.group_label ?? '',
          company_id: initialData.company_id ?? '',
          start_date: initialData.start_date ? initialData.start_date.split('T')[0] : '',
          face_value: Number(initialData.face_value),
          duration_months: Number(initialData.duration_months),
          member_count: Number(initialData.member_count),
          base_installment: Number(initialData.base_installment),
          commission_type: initialData.commission_type,
          commission_value: Number(initialData.commission_value),
          commission_notes: initialData.commission_notes ?? '',
          notes: initialData.notes ?? '',
          status: initialData.status,
        }
      : {
          status: 'ACTIVE',
          commission_type: 'PERCENTAGE',
        },
  })

  // Merge server-side field errors with client-side errors for display
  function getError(field: keyof ChitFormValues): string | undefined {
    const clientMsg = errors[field]?.message as string | undefined
    if (clientMsg) return clientMsg
    if (actionState.status === 'error' && actionState.fieldErrors?.[field]) {
      return actionState.fieldErrors[field][0]
    }
    return undefined
  }

  return (
    <form action={formAction} noValidate>
      {/* Top-level server error (non-field) */}
      {actionState.status === 'error' && !actionState.fieldErrors && (
        <div
          role="alert"
          className="mb-6 px-4 py-3 rounded-xl bg-[#450a0a] border border-[#7f1d1d] text-sm text-[#fca5a5]"
        >
          {actionState.message}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* A. Basic Information                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="basic-heading" className="mb-8">
        <h2
          id="basic-heading"
          className="text-xs font-mono uppercase tracking-widest text-[#475569] mb-4"
        >
          Basic Information
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField className="sm:col-span-2">
            <Label htmlFor="name" required>Chit Name</Label>
            <Input
              id="name"
              defaultValue={initialData?.name}
              {...register('name')}
              placeholder="e.g. Shriram ₹3L Group"
              error={!!getError('name')}
              aria-describedby={getError('name') ? 'name-error' : undefined}
              aria-required="true"
            />
            <ErrorMessage id="name-error" message={getError('name')} />
          </FormField>

          <FormField>
            <Label htmlFor="group_label">Group Label</Label>
            <Input
              id="group_label"
              defaultValue={initialData?.group_label ?? ''}
              {...register('group_label')}
              placeholder="e.g. Office Group, Family"
              error={!!getError('group_label')}
              aria-describedby={getError('group_label') ? 'group_label-error' : undefined}
            />
            <ErrorMessage id="group_label-error" message={getError('group_label')} />
          </FormField>

          <FormField>
            <Label htmlFor="company_id">Company</Label>
            <Select
              id="company_id"
              defaultValue={initialData?.company_id ?? ''}
              {...register('company_id')}
              error={!!getError('company_id')}
              aria-describedby={getError('company_id') ? 'company_id-error' : undefined}
            >
              <option value="">— None —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <ErrorMessage id="company_id-error" message={getError('company_id')} />
          </FormField>

          <FormField>
            <Label htmlFor="start_date">Start Date</Label>
            <Input
              id="start_date"
              type="date"
              defaultValue={initialData?.start_date ? initialData.start_date.split('T')[0] : ''}
              {...register('start_date')}
              error={!!getError('start_date')}
              aria-describedby={getError('start_date') ? 'start_date-error' : undefined}
            />
            <ErrorMessage id="start_date-error" message={getError('start_date')} />
          </FormField>
        </div>
      </section>

      <hr className="border-[rgba(255,255,255,0.06)] mb-8" />

      {/* ------------------------------------------------------------------ */}
      {/* B. Financial Structure                                               */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="financial-heading" className="mb-8">
        <h2
          id="financial-heading"
          className="text-xs font-mono uppercase tracking-widest text-[#475569] mb-4"
        >
          Financial Structure
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField>
            <Label htmlFor="face_value" required>Face Value (₹)</Label>
            <Input
              id="face_value"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={initialData ? Number(initialData.face_value) : undefined}
              {...register('face_value', { valueAsNumber: true })}
              placeholder="e.g. 300000"
              error={!!getError('face_value')}
              aria-describedby={getError('face_value') ? 'face_value-error' : undefined}
              aria-required="true"
            />
            <ErrorMessage id="face_value-error" message={getError('face_value')} />
          </FormField>

          <FormField>
            <Label htmlFor="base_installment" required>Base Installment (₹)</Label>
            <Input
              id="base_installment"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={initialData ? Number(initialData.base_installment) : undefined}
              {...register('base_installment', { valueAsNumber: true })}
              placeholder="e.g. 12000"
              error={!!getError('base_installment')}
              aria-describedby={getError('base_installment') ? 'base_installment-error' : undefined}
              aria-required="true"
            />
            <ErrorMessage id="base_installment-error" message={getError('base_installment')} />
          </FormField>

          <FormField>
            <Label htmlFor="duration_months" required>Duration (months)</Label>
            <Input
              id="duration_months"
              type="number"
              min="1"
              step="1"
              defaultValue={initialData ? Number(initialData.duration_months) : undefined}
              {...register('duration_months', { valueAsNumber: true })}
              placeholder="e.g. 25"
              error={!!getError('duration_months')}
              aria-describedby={getError('duration_months') ? 'duration_months-error' : undefined}
              aria-required="true"
            />
            <ErrorMessage id="duration_months-error" message={getError('duration_months')} />
          </FormField>

          <FormField>
            <Label htmlFor="member_count" required>Member Count</Label>
            <Input
              id="member_count"
              type="number"
              min="1"
              step="1"
              defaultValue={initialData ? Number(initialData.member_count) : undefined}
              {...register('member_count', { valueAsNumber: true })}
              placeholder="e.g. 25"
              error={!!getError('member_count')}
              aria-describedby={getError('member_count') ? 'member_count-error' : undefined}
              aria-required="true"
            />
            <ErrorMessage id="member_count-error" message={getError('member_count')} />
          </FormField>
        </div>
      </section>

      <hr className="border-[rgba(255,255,255,0.06)] mb-8" />

      {/* ------------------------------------------------------------------ */}
      {/* C. Commission                                                        */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="commission-heading" className="mb-8">
        <h2
          id="commission-heading"
          className="text-xs font-mono uppercase tracking-widest text-[#475569] mb-4"
        >
          Commission
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField>
            <Label htmlFor="commission_type" required>Commission Type</Label>
            <Select
              id="commission_type"
              defaultValue={initialData?.commission_type ?? 'PERCENTAGE'}
              {...register('commission_type')}
              error={!!getError('commission_type')}
              aria-describedby={getError('commission_type') ? 'commission_type-error' : undefined}
              aria-required="true"
            >
              <option value="PERCENTAGE">Percentage of face value</option>
              <option value="FLAT_AMOUNT">Flat amount per round</option>
              <option value="OTHER">Other</option>
            </Select>
            <ErrorMessage id="commission_type-error" message={getError('commission_type')} />
          </FormField>

          <FormField>
            <Label htmlFor="commission_value" required>
              Commission Value
            </Label>
            <Input
              id="commission_value"
              type="number"
              min="0"
              step="0.0001"
              defaultValue={initialData ? Number(initialData.commission_value) : undefined}
              {...register('commission_value', { valueAsNumber: true })}
              placeholder="e.g. 2.5 for 2.5% or 7500 for flat"
              error={!!getError('commission_value')}
              aria-describedby={getError('commission_value') ? 'commission_value-error' : undefined}
              aria-required="true"
            />
            <ErrorMessage id="commission_value-error" message={getError('commission_value')} />
          </FormField>

          <FormField className="sm:col-span-2">
            <Label htmlFor="commission_notes">Commission Notes</Label>
            <Input
              id="commission_notes"
              defaultValue={initialData?.commission_notes ?? ''}
              {...register('commission_notes')}
              placeholder="Optional clarification for this commission rule"
              error={!!getError('commission_notes')}
              aria-describedby={getError('commission_notes') ? 'commission_notes-error' : undefined}
            />
            <ErrorMessage id="commission_notes-error" message={getError('commission_notes')} />
          </FormField>
        </div>
      </section>

      <hr className="border-[rgba(255,255,255,0.06)] mb-8" />

      {/* ------------------------------------------------------------------ */}
      {/* D. Notes                                                             */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="notes-heading" className="mb-8">
        <h2
          id="notes-heading"
          className="text-xs font-mono uppercase tracking-widest text-[#475569] mb-4"
        >
          Notes
        </h2>
        <FormField>
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            defaultValue={initialData?.notes ?? ''}
            {...register('notes')}
            placeholder="Any additional notes about this chit"
            error={!!getError('notes')}
            aria-describedby={getError('notes') ? 'notes-error' : undefined}
          />
          <ErrorMessage id="notes-error" message={getError('notes')} />
        </FormField>
      </section>

      {/* Hidden id field for editing */}
      {isEdit && <input type="hidden" name="id" value={initialData!.id} />}

      {/* Hidden status field — preserved from existing chit if editing, default ACTIVE for new */}
      <input
        type="hidden"
        {...register('status')}
        value={initialData?.status ?? 'ACTIVE'}
      />

      {/* Submit */}
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={isPending} disabled={isPending} size="lg">
          {isPending
            ? isEdit ? 'Saving…' : 'Creating…'
            : isEdit ? 'Save Changes' : 'Create Chit'}
        </Button>
        <a
          href={isEdit ? `/chits/${initialData!.id}` : '/chits'}
          className="text-sm text-[#64748B] hover:text-[#94A3B8] transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}

export { AddChitForm as EditChitForm }
