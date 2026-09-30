'use client'

import { useActionState, useState } from 'react'
import { loginAction, signupAction, type AuthActionState } from '@/lib/auth/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const initialState: AuthActionState = undefined

export default function LoginPage() {
  const searchParams = useSearchParams()
  const defaultMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login'
  const [mode, setMode] = useState<'login' | 'signup'>(defaultMode)

  const action = mode === 'login' ? loginAction : signupAction
  const [state, formAction, isPending] = useActionState(action, initialState)

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-block text-xs font-mono uppercase tracking-[0.18em] text-[#059669] mb-4 hover:opacity-80"
          >
            Chit Fund Analytics
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
          </h1>
        </div>

        <form action={formAction} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red-400 font-medium" role="alert" aria-live="polite">
              {state.error}
            </p>
          )}

          {state?.success && (
            <p className="text-sm text-[#059669] font-medium" role="alert" aria-live="polite">
              {state.success}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="mt-2 w-full">
            {isPending
              ? 'Please wait…'
              : mode === 'login'
              ? 'Sign in'
              : 'Create account'}
          </Button>
        </form>

        <div className="mt-8 text-center text-sm text-[#94A3B8]">
          {mode === 'login' ? (
            <p>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="text-[#E2E8F0] hover:underline"
              >
                Sign up
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-[#E2E8F0] hover:underline"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </Card>
    </main>
  )
}
