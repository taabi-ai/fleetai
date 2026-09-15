import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { audit } from '@/lib/audit'

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })
        const email = String(credentials.email)
        if (!user?.password) {
          void audit({ action: 'auth.login_failed', entity: 'auth', summary: `Login failed for ${email} (unknown account)`, actor: { email }, status: 401 })
          return null
        }
        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )
        if (!isValid) {
          void audit({ action: 'auth.login_failed', entity: 'auth', entityId: user.id, summary: `Login failed for ${email} (wrong password)`, actor: { id: user.id, email, role: user.role }, status: 401 })
          return null
        }
        if (!user.isActive) {
          void audit({ action: 'auth.login_blocked', entity: 'auth', entityId: user.id, summary: `Login blocked for ${email} (account inactive)`, actor: { id: user.id, email, role: user.role }, status: 403 })
          return null
        }
        void audit({ action: 'auth.login', entity: 'auth', entityId: user.id, summary: `${email} logged in`, actor: { id: user.id, email, role: user.role }, status: 200 })
        return { id: user.id, email: user.email, name: user.name, role: user.role }
      },
    }),
  ],
  events: {
    async signOut(message) {
      const token = (message as { token?: { id?: string; email?: string | null; role?: string } }).token
      if (token?.id) {
        void audit({ action: 'auth.logout', entity: 'auth', entityId: token.id, summary: `${token.email ?? token.id} logged out`, actor: { id: token.id, email: token.email ?? null, role: token.role ?? null }, status: 200 })
      }
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role ?? 'user'
        ;(token as Record<string, unknown>).roleCheckedAt = Date.now()
      } else if (token?.id) {
        // Re-sync role / active flag from DB every 2 minutes so admin changes take effect.
        const checkedAt = Number((token as Record<string, unknown>).roleCheckedAt ?? 0)
        if (Date.now() - checkedAt > 2 * 60 * 1000) {
          const dbUser = await prisma.user.findUnique({ where: { id: token.id as string }, select: { role: true, isActive: true } })
          if (!dbUser || !dbUser.isActive) return null
          token.role = dbUser.role
          ;(token as Record<string, unknown>).roleCheckedAt = Date.now()
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session?.user && token?.id) {
        session.user.id = token.id as string
        session.user.role = (token.role as string) ?? 'user'
      }
      return session
    },
  },
})
