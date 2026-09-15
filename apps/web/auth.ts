/**
 * apps/web/auth.ts — session adapter (replaces the legacy next-auth wiring).
 *
 * Keeps next-auth only as a cookie/session holder. The Credentials provider's
 * `authorize` calls the gateway POST /api/auth/login (legacy path) and stores
 * the returned tokens in the JWT session. `auth()` returns the same shape pages
 * expect (session.user.{id,email,name,role} + perms).
 */

import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

const gatewayBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const res = await fetch(`${gatewayBase}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(credentials),
        })
        if (!res.ok) return null
        const data = await res.json()
        const user = data.user ?? data
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? '',
          role: user.role ?? 'user',
          perms: user.perms ?? [],
          accessToken: data.accessToken ?? data.access_token,
          refreshToken: data.refreshToken ?? data.refresh_token,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role ?? 'user'
        token.perms = (user as { perms?: string[] }).perms ?? []
        token.accessToken = (user as { accessToken?: string }).accessToken
      }
      return token
    },
    async session({ session, token }) {
      if (session?.user && token?.id) {
        session.user.id = token.id as string
        session.user.role = (token.role as string) ?? 'user'
        ;(session.user as { perms?: string[] }).perms = (token.perms as string[] | undefined) ?? []
        ;(session as { accessToken?: string }).accessToken = token.accessToken as string | undefined
      }
      return session
    },
  },
})
