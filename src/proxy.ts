import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createBoundedSupabaseFetch, withAuthDeadline } from '@/lib/supabase/fetch'

/** Refresh a cookie-backed session before Server Components read it. */
export async function proxy(request: NextRequest) {
  // A visitor without a Supabase session has nothing to refresh.
  if (!request.cookies.getAll().some(({ name }) => name.startsWith('sb-'))) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })
  let responseOpen = true
  const controller = new AbortController()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: createBoundedSupabaseFetch(controller.signal) },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          if (!responseOpen) return
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([name, value]) =>
            response.headers.set(name, value)
          )
        },
      },
    }
  )

  // getClaims validates the token and refreshes it when necessary. A network
  // failure is bounded by the fetch timeout; protected routes verify again.
  try {
    const { error } = await withAuthDeadline(supabase.auth.getClaims(), controller)
    if (error) console.error('[proxy] Supabase auth verification failed:', error)
  } catch (error) {
    console.error('[proxy] Supabase auth verification failed:', error)
  }

  responseOpen = false
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
