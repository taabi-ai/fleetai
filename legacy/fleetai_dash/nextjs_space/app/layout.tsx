import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler'
import { SessionProvider } from 'next-auth/react'
import { NewRelicRum } from '@/components/new-relic-rum'

export const dynamic = "force-dynamic";

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })
const jakartaSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: 'FleetAI Dash — AI-Powered Fleet Dashboard',
  description: 'Build dynamic fleet management dashboards with AI. Drag-and-drop widgets for Fleet, TMS, ADAS, Fuel, and EV monitoring.',
  icons: {
    icon: '/favicon-taabi-v1.svg',
    shortcut: '/favicon-taabi-v1.svg',
  },
  openGraph: {
    title: 'FleetAI Dash',
    description: 'AI-Powered Fleet Dashboard Builder',
    images: ['/og-image.png'],
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </head>
      <body className={`${dmSans.variable} ${jakartaSans.variable} ${jetbrainsMono.variable} font-sans`}>
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            disableTransitionOnChange
          >
            {children}
            <Toaster />
            <ChunkLoadErrorHandler />
          </ThemeProvider>
        </SessionProvider>
        <NewRelicRum />
      </body>
    </html>
  )
}
