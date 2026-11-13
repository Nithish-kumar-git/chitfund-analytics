// Keep an unavailable Auth service from consuming the full routing timeout.
// Database requests retain their normal fetch behavior.
export function createBoundedSupabaseFetch(requestSignal?: AbortSignal): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!new URL(url).pathname.startsWith('/auth/v1/')) {
      return fetch(input, init)
    }

    const signals = [AbortSignal.timeout(5000)]
    if (init?.signal) signals.push(init.signal)
    if (requestSignal) signals.push(requestSignal)
    return fetch(input, { ...init, signal: AbortSignal.any(signals) })
  }
}

export const boundedSupabaseFetch = createBoundedSupabaseFetch()

// The Auth SDK can retry a failed token refresh for up to 30 seconds. Bound
// the whole verification operation as well as each network attempt.
export async function withAuthDeadline<T>(operation: Promise<T>, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error('Supabase Auth verification timed out'))
        }, 6000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
