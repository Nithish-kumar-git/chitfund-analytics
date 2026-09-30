import { InputHTMLAttributes, forwardRef } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = '', ...props }, ref) => (
    <input
      ref={ref}
      className={[
        'w-full rounded-xl px-3.5 py-2.5 text-sm bg-[#0F172A] text-[#F1F5F9]',
        'border transition-colors duration-150 placeholder:text-[#475569]',
        'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-[#0F172A]',
        error
          ? 'border-[#EF4444] focus:ring-[#EF4444]'
          : 'border-[rgba(255,255,255,0.10)] focus:border-[#3B82F6] focus:ring-[#3B82F6]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      ].join(' ')}
      {...props}
    />
  )
)

Input.displayName = 'Input'
