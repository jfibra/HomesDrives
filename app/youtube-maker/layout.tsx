import AdminShell from '@/components/admin/AdminShell'

export default function YoutubeMakerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminShell>{children}</AdminShell>
}
