import { notFound } from 'next/navigation'

import { getUserByCode } from '@/lib/server/albums'
import AdminClient from './admin-client'
import DashboardClient from './dashboard-client'

type PageProps = {
  params: Promise<{ code: string }>
}

export default async function UserDashboardPage({ params }: PageProps) {
  const { code } = await params

  const user = await getUserByCode(code).catch(() => null)

  if (!user || user.status !== 'active') {
    notFound()
  }

  if (user.role === 'admin') {
    return (
      <AdminClient
        user={{
          id: String(user.id),
          fullName: user.full_name,
          firstName: user.first_name,
          areaFocused: user.area_focused,
          email: user.email,
          code: user.code,
        }}
      />
    )
  }

  return (
    <DashboardClient
      user={{
        id: String(user.id),
        fullName: user.full_name,
        firstName: user.first_name,
        lastName: user.last_name,
        phoneNumber: user.phone_number,
        areaFocused: user.area_focused,
        email: user.email,
        code: user.code,
        avatarUrl: user.avatar_url ?? null,
        role: user.role,
      }}
    />
  )
}
