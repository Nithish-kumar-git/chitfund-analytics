/**
 * Auth action tests — Phase 4A.1 (post-review)
 *
 * Key facts confirmed by inspecting migrations:
 *   - `on_auth_user_created` trigger exists (SECURITY DEFINER, ON CONFLICT DO NOTHING)
 *     It fires on auth.users INSERT, so the profile exists before the first login.
 *   - `loginAction` calls ensureProfile() as a belt-and-suspenders idempotent upsert.
 *   - `signupAction` does NOT manually create a profile (the trigger handles it).
 *   - RLS `profiles_insert_own`: WITH CHECK (auth.uid() = id) — DB-level enforcement
 *     that a user can only insert a row whose id equals their own auth uid.
 *
 * Tests here:
 *   1. loginAction — input guards
 *   2. loginAction — profile is ensured after successful login
 *   3. loginAction — profile upsert uses auth user id, not any client value
 *   4. loginAction — failed auth does NOT trigger profile upsert
 *   5. loginAction — repeated successful logins do not error (idempotent)
 *   6. signupAction — input guards
 *   7. signupAction — no manual profile insert (trigger handles it)
 *   8. logoutAction — signs out and redirects
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoist all mock functions BEFORE vi.mock factories run
// ---------------------------------------------------------------------------
const {
  mockSignInWithPassword,
  mockSignUp,
  mockSignOut,
  mockUpsert,
  mockRedirect,
  mockInsert,
} = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn(),
  mockSignUp: vi.fn(),
  mockSignOut: vi.fn(),
  mockUpsert: vi.fn(),
  mockInsert: vi.fn(),
  mockRedirect: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signOut: mockSignOut,
    },
    from: vi.fn().mockReturnValue({
      upsert: mockUpsert,
      insert: mockInsert,
    }),
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: (path: string) => mockRedirect(path),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
  }),
}))

// Import AFTER mocks
import { loginAction, signupAction, logoutAction } from './actions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const VALID_USER = { id: 'auth-uid-abc123' }
const VALID_SESSION = { access_token: 'tok' }

// ---------------------------------------------------------------------------
// 1. loginAction — input guards
// ---------------------------------------------------------------------------
describe('loginAction — input guards', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when email is empty', async () => {
    const result = await loginAction(undefined, makeFormData({ email: '', password: 'secret' }))
    expect(result?.error).toBe('Email and password are required')
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
  })

  it('returns error when password is empty', async () => {
    const result = await loginAction(undefined, makeFormData({ email: 'a@b.com', password: '' }))
    expect(result?.error).toBe('Email and password are required')
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 2. loginAction — Supabase error handling
// ---------------------------------------------------------------------------
describe('loginAction — Supabase error handling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns Supabase error message on bad credentials', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    })
    const result = await loginAction(
      undefined,
      makeFormData({ email: 'a@b.com', password: 'wrong' })
    )
    expect(result?.error).toBe('Invalid login credentials')
  })

  it('does NOT call ensureProfile (upsert) when authentication fails', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    })
    await loginAction(undefined, makeFormData({ email: 'a@b.com', password: 'wrong' }))
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 3. loginAction — profile ensured after successful login
// ---------------------------------------------------------------------------
describe('loginAction — profile ensured on successful login', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls upsert on profiles after successful authentication', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: VALID_USER, session: VALID_SESSION },
      error: null,
    })
    mockUpsert.mockResolvedValueOnce({ error: null })

    await loginAction(undefined, makeFormData({ email: 'u@b.com', password: 'ok' }))

    expect(mockUpsert).toHaveBeenCalledOnce()
  })

  it('uses ONLY auth.user.id for profile upsert — never a client-supplied value', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: VALID_USER, session: VALID_SESSION },
      error: null,
    })
    mockUpsert.mockResolvedValueOnce({ error: null })

    await loginAction(undefined, makeFormData({ email: 'u@b.com', password: 'ok' }))

    const [insertedRow] = mockUpsert.mock.calls[0] as [{ id: string }, unknown]
    expect(insertedRow.id).toBe(VALID_USER.id)
  })

  it('upsert is called with ignoreDuplicates:true (idempotent, ON CONFLICT DO NOTHING)', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: VALID_USER, session: VALID_SESSION },
      error: null,
    })
    mockUpsert.mockResolvedValueOnce({ error: null })

    await loginAction(undefined, makeFormData({ email: 'u@b.com', password: 'ok' }))

    const [, options] = mockUpsert.mock.calls[0] as [unknown, { onConflict: string; ignoreDuplicates: boolean }]
    expect(options?.ignoreDuplicates).toBe(true)
    expect(options?.onConflict).toBe('id')
  })

  it('repeated successful logins do not error (idempotency)', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: VALID_USER, session: VALID_SESSION },
      error: null,
    })
    mockUpsert.mockResolvedValue({ error: null })

    // Login three times
    await loginAction(undefined, makeFormData({ email: 'u@b.com', password: 'ok' }))
    await loginAction(undefined, makeFormData({ email: 'u@b.com', password: 'ok' }))
    await loginAction(undefined, makeFormData({ email: 'u@b.com', password: 'ok' }))

    // Upsert called three times, redirect called three times — no errors
    expect(mockUpsert).toHaveBeenCalledTimes(3)
    expect(mockRedirect).toHaveBeenCalledTimes(3)
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard')
  })

  it('redirects to /dashboard on success', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: VALID_USER, session: VALID_SESSION },
      error: null,
    })
    mockUpsert.mockResolvedValueOnce({ error: null })

    await loginAction(undefined, makeFormData({ email: 'u@b.com', password: 'ok' }))
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard')
  })

  it('does not block login when upsert itself returns an error (degraded mode)', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: VALID_USER, session: VALID_SESSION },
      error: null,
    })
    // Simulate a transient upsert failure
    mockUpsert.mockResolvedValueOnce({ error: { message: 'temporary error' } })

    // Should still redirect — login succeeds even if upsert fails
    await loginAction(undefined, makeFormData({ email: 'u@b.com', password: 'ok' }))
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard')
  })
})

// ---------------------------------------------------------------------------
// 4. signupAction — input guards and trigger reliance
// ---------------------------------------------------------------------------
describe('signupAction — input guards', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when email is empty', async () => {
    const result = await signupAction(undefined, makeFormData({ email: '', password: 'pass' }))
    expect(result?.error).toBe('Email and password are required')
    expect(mockSignUp).not.toHaveBeenCalled()
  })

  it('returns error when password is empty', async () => {
    const result = await signupAction(undefined, makeFormData({ email: 'a@b.com', password: '' }))
    expect(result?.error).toBe('Email and password are required')
    expect(mockSignUp).not.toHaveBeenCalled()
  })

  it('returns Supabase error when user already registered', async () => {
    mockSignUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    })
    const result = await signupAction(
      undefined,
      makeFormData({ email: 'existing@test.com', password: 'secret' })
    )
    expect(result?.error).toBe('User already registered')
  })

  it('does NOT manually insert a profile row — relies on DB trigger', async () => {
    // Email confirmation enabled → no session
    mockSignUp.mockResolvedValueOnce({
      data: { user: { id: 'uid-1' }, session: null },
      error: null,
    })
    await signupAction(undefined, makeFormData({ email: 'new@test.com', password: 'pass1234' }))
    // Neither insert nor upsert should be called in signupAction
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns confirmation message when email confirmation is required', async () => {
    mockSignUp.mockResolvedValueOnce({
      data: { user: { id: 'uid-1' }, session: null },
      error: null,
    })
    const result = await signupAction(
      undefined,
      makeFormData({ email: 'new@test.com', password: 'pass1234' })
    )
    expect(result?.success).toMatch(/check your email/i)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects to /dashboard when signup returns an immediate session (email confirmation disabled)', async () => {
    mockSignUp.mockResolvedValueOnce({
      data: { user: { id: 'uid-2' }, session: { access_token: 'tok' } },
      error: null,
    })
    await signupAction(
      undefined,
      makeFormData({ email: 'instant@test.com', password: 'pass1234' })
    )
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard')
  })
})

// ---------------------------------------------------------------------------
// 5. logoutAction
// ---------------------------------------------------------------------------
describe('logoutAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({})
  })

  it('calls supabase.auth.signOut', async () => {
    await logoutAction()
    expect(mockSignOut).toHaveBeenCalled()
  })

  it('redirects to / after sign-out', async () => {
    await logoutAction()
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })
})
