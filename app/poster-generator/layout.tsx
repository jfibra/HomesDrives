import AdminShell from '@/components/admin/AdminShell'

export default function PosterGeneratorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminShell>{children}</AdminShell>
}
