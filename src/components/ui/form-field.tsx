import { HTMLAttributes } from 'react'

interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {}

export function FormField({ className = '', children, ...props }: FormFieldProps) {
  return (
    <div className={['flex flex-col', className].join(' ')} {...props}>
      {children}
    </div>
  )
}

interface ErrorMessageProps {
  id?: string
  message?: string
}

export function ErrorMessage({ id, message }: ErrorMessageProps) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs text-[#EF4444] flex items-center gap-1">
      <span aria-hidden="true">✕</span>
      {message}
    </p>
  )
}
