import { LabelHTMLAttributes } from 'react'

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean
}

export function Label({ required, children, className = '', ...props }: LabelProps) {
  return (
    <label
      className={['block text-sm font-medium text-[#CBD5E1] mb-1.5', className].join(' ')}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-1 text-[#EF4444]" aria-hidden="true">
          *
        </span>
      )}
    </label>
  )
}
