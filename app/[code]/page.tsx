import { notFound } from 'next/navigation'

import { getUserByCode } from '@/lib/server/albums'
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

  return (
    <DashboardClient
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
