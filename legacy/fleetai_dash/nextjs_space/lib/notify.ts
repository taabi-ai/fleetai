import { prisma } from '@/lib/db'
import { sendMail, emailLayout } from '@/lib/mailer'

export type NotifyInput = {
  type?: string
  title: string
  message: string
  link?: string | null
  email?: boolean
}

function appUrl() {
  return (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '')
}

/** Creates in-app notifications for the given users and (optionally) emails them via the configured SMTP server. */
export async function notifyUsers(userIds: string[], input: NotifyInput) {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (ids.length === 0) return
  await prisma.notification.createMany({
    data: ids.map(userId => ({
      userId,
      type: input.type ?? 'info',
      title: input.title,
      message: input.message,
      link: input.link ?? null,
    })),
  })
  if (input.email === false) return
  try {
    const users = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { email: true } })
    const to = users.map(u => u.email).filter(Boolean)
    if (to.length === 0) return
    const url = input.link ? `${appUrl()}${input.link}` : undefined
    await Promise.all(to.map(addr => sendMail({
      to: addr,
      subject: `[FleetAI Dash] ${input.title}`,
      html: emailLayout(input.title, input.message, 'Open dashboard', url),
      text: `${input.title}\n\n${input.message}${url ? `\n\n${url}` : ''}`,
    }).catch(() => false)))
  } catch {
    // Email is best-effort; in-app notification has already been stored.
  }
}
