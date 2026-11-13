import { afterEach, describe, expect, it, vi } from 'vitest'
import { boundedSupabaseFetch, withAuthDeadline } from './fetch'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('boundedSupabaseFetch', () => {
  it('aborts an unresponsive Supabase request before the routing timeout', async () => {
    vi.stubGlobal('fetch', (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
          once: true,
        })
      })
    )

    await expect(boundedSupabaseFetch('https://example.supabase.co/auth/v1/user')).rejects.toMatchObject({
      name: 'TimeoutError',
    })
  }, 8000)

  it('preserves a caller cancellation signal', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true)
      return Promise.reject(init?.signal?.reason)
    })
    controller.abort(new Error('cancelled'))

    await expect(
      boundedSupabaseFetch('https://example.supabase.co/auth/v1/user', { signal: controller.signal })
    ).rejects.toThrow('cancelled')
  })

  it('leaves database requests unchanged', async () => {
    const response = new Response(null, { status: 204 })
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)
    const init = { headers: { apikey: 'public-key' } }

    await expect(
      boundedSupabaseFetch('https://example.supabase.co/rest/v1/chits', init)
    ).resolves.toBe(response)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/chits',
      init
    )
  })

  it('stops waiting when the Auth SDK retries beyond the request deadline', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const check = withAuthDeadline(new Promise<never>(() => {}), controller)
    const assertion = expect(check).rejects.toThrow('Supabase Auth verification timed out')

    await vi.advanceTimersByTimeAsync(6000)
    await assertion
    expect(controller.signal.aborted).toBe(true)
  })
})
