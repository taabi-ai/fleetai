import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { seedFleet } from './seed-fleet'

const prisma = new PrismaClient()

async function main() {
  // Hidden test account
  const testPasswordHash = await bcrypt.hash('5zQK2*9Ppy', 12)
  await prisma.user.upsert({
    where: { email: 'abacus-ff3f4c41@example.com' },
    update: {},
    create: {
      email: 'abacus-ff3f4c41@example.com',
      name: 'Test Admin',
      password: testPasswordHash,
    },
  })

  // Super admin account
  const superAdminHash = await bcrypt.hash('Taabi@2126#', 12)
  await prisma.user.upsert({
    where: { email: 'admin@taabi.ai' },
    update: { role: 'super_admin', isActive: true },
    create: {
      email: 'admin@taabi.ai',
      name: 'Super Admin',
      password: superAdminHash,
      role: 'super_admin',
    },
  })

  // Default navigation menu (only if none defined yet)
  const menuCount = await prisma.menuItem.count()
  if (menuCount === 0) {
    await prisma.menuItem.createMany({
      data: [
        { label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard', order: 1, roles: [] },
        { label: 'Widget Library', path: '/library', icon: 'Library', order: 2, roles: [] },
        { label: 'Marketplace', path: '/marketplace', icon: 'Store', order: 3, roles: [] },
        { label: 'Sales & CRM', path: '/sales', icon: 'Briefcase', order: 10, roles: [] },
        { label: 'Engineering', path: '/engineering', icon: 'GitBranch', order: 11, roles: [] },
        { label: 'Admin', path: '/admin', icon: 'Shield', order: 100, roles: ['super_admin'] },
      ],
    })
  }

  // RBAC roles (upsert; never overwrites permissions edited in /admin/roles)
  const ALL = ['dashboards.view', 'dashboards.edit', 'dashboards.publish', 'dashboards.collaborate', 'ai.use', 'library.publish', 'crm.view', 'crm.manage', 'dora.view', 'dora.manage', 'admin.users', 'admin.roles', 'admin.integrations', 'admin.settings']
  const BASE = ['dashboards.view', 'dashboards.edit', 'dashboards.publish', 'dashboards.collaborate', 'ai.use', 'library.publish']
  const roles = [
    { name: 'user', label: 'User', description: 'Default role for self-registered accounts.', isSystem: true, permissions: BASE },
    { name: 'manager', label: 'Manager', description: 'Team lead: user permissions plus Sales & CRM and engineering read access.', isSystem: true, permissions: [...BASE, 'crm.view', 'dora.view'] },
    { name: 'sales', label: 'Sales / KAM', description: 'Sales, key-account and marketing staff.', isSystem: false, permissions: ['dashboards.view', 'dashboards.edit', 'dashboards.collaborate', 'ai.use', 'crm.view'] },
    { name: 'crm_manager', label: 'CRM manager', description: 'Owns CRM sources and sales scorecards.', isSystem: false, permissions: [...BASE, 'crm.view', 'crm.manage'] },
    { name: 'engineer', label: 'Engineer', description: 'Engineering team: dashboards + DORA metrics.', isSystem: false, permissions: ['dashboards.view', 'dashboards.edit', 'dashboards.collaborate', 'ai.use', 'dora.view'] },
    { name: 'eng_manager', label: 'Engineering manager', description: 'Owns engineering integrations and DORA telemetry.', isSystem: false, permissions: [...BASE, 'dora.view', 'dora.manage'] },
    { name: 'super_admin', label: 'Super admin', description: 'Full access to everything, including the admin console.', isSystem: true, permissions: ALL },
  ]
  for (const r of roles) {
    await prisma.role.upsert({ where: { name: r.name }, update: {}, create: r })
  }

  // Fleet operational data that powers every dashboard widget (idempotent upserts).
  await seedFleet(prisma)

  console.log('Seed completed successfully')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
