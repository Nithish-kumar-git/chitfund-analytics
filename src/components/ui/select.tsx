import { SelectHTMLAttributes, forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, className = '', children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={[
          'w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm bg-[#0F172A] text-[#F1F5F9] appearance-none',
          'border transition-colors duration-150',
          'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-[#0F172A]',
          error
            ? 'border-[#EF4444] focus:ring-[#EF4444]'
            : 'border-[rgba(255,255,255,0.10)] focus:border-[#3B82F6] focus:ring-[#3B82F6]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        ].join(' ')}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#475569]"
        aria-hidden="true"
      />
    </div>
  )
)

Select.displayName = 'Select'
