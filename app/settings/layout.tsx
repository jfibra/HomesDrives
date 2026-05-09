import AdminShell from '@/components/admin/AdminShell'

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminShell>{children}</AdminShell>
}