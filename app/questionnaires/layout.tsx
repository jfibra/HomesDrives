import AdminShell from '@/components/admin/AdminShell'

export default function QuestionnairesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminShell>{children}</AdminShell>
}
