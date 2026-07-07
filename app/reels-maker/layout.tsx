import AdminShell from '@/components/admin/AdminShell'

export default function ReelsMakerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminShell>{children}</AdminShell>
}
