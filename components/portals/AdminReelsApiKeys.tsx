'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  Copy,
  Download,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

import { PORTAL_ADMIN_SESSION_KEY } from '@/lib/portals/constants'

type ApiKey = {
  key: string
  name: string
  createdAt: string
  active: boolean
}

function maskKey(key: string) {
  if (key.length <= 12) return key
  return `${key.slice(0, 8)}${'•'.repeat(10)}${key.slice(-4)}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function AdminReelsApiKeys() {
  const router = useRouter()
  const [adminCode, setAdminCode] = useState<string | null>(null)
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createdKey, setCreatedKey] = useState<ApiKey | null>(null)

  // Revoke
  const [revokingKey, setRevokingKey] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)

  // Reveal
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const fetchKeys = useCallback(async (code: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/reels-api-keys?adminCode=${encodeURIComponent(code)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load keys.')
      setKeys(data.keys ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const code = localStorage.getItem(PORTAL_ADMIN_SESSION_KEY)
    if (!code) {
      router.replace('/admin')
      return
    }
    setAdminCode(code)
    fetchKeys(code)
  }, [router, fetchKeys])

  async function handleCreate() {
    if (!adminCode || !newName.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/admin/reels-api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminCode, name: newName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create key.')
      setCreatedKey(data.key)
      setKeys((prev) => [data.key, ...prev])
      setNewName('')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create key.')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(key: string) {
    if (!adminCode) return
    setRevokingKey(key)
    setConfirmRevoke(null)
    try {
      const res = await fetch(`/api/admin/reels-api-keys/${encodeURIComponent(key)}?adminCode=${encodeURIComponent(adminCode)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to revoke key.')
      setKeys((prev) => prev.map((k) => (k.key === key ? { ...k, active: false } : k)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key.')
    } finally {
      setRevokingKey(null)
    }
  }

  function toggleReveal(key: string) {
    setRevealedKeys((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  function closeCreate() {
    setShowCreate(false)
    setCreatedKey(null)
    setNewName('')
    setCreateError('')
  }

  if (!adminCode) return null

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#10233f]">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin/events')}
              className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Admin
            </button>
            <span className="text-white/30">/</span>
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-yellow-400" />
              <span className="font-semibold text-white">Reels API Keys</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/admin/reels-api-keys/readme"
              download="REELS_API_PARTNER.md"
              className="flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm text-white/70 hover:text-white hover:border-white/40 transition-all"
            >
              <Download className="w-4 h-4" />
              Download README
            </a>
            <button
              onClick={() => { setShowCreate(true); setCreatedKey(null) }}
              className="flex items-center gap-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-4 py-2 text-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              New API Key
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Intro banner */}
        <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
          <p>
            API keys allow partner sites and developers to generate reels using your Reels service.
            Each partner gets their own key — revoke any key individually without affecting others.
            Share the <strong className="text-white/80">README</strong> file with partners so they know how to integrate.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Keys table */}
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="font-semibold text-white">Issued Keys</h2>
            <span className="text-xs text-white/40">{keys.length} key{keys.length !== 1 ? 's' : ''}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-white/40">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading keys…</span>
            </div>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/40">
              <Key className="w-8 h-8 opacity-40" />
              <p className="text-sm">No API keys yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {keys.map((k) => (
                <div key={k.key} className={`px-5 py-4 flex items-center gap-4 ${!k.active ? 'opacity-40' : ''}`}>
                  {/* Status dot */}
                  <div className={`w-2 h-2 rounded-full shrink-0 ${k.active ? 'bg-green-400' : 'bg-white/30'}`} />

                  {/* Name + date */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-white truncate">{k.name}</p>
                    <p className="text-xs text-white/40 mt-0.5">Created {formatDate(k.createdAt)}</p>
                  </div>

                  {/* Key value */}
                  <div className="flex items-center gap-2">
                    <code className="rounded-lg bg-black/30 border border-white/10 px-3 py-1.5 text-xs font-mono text-white/70 select-all">
                      {revealedKeys.has(k.key) ? k.key : maskKey(k.key)}
                    </code>
                    <button
                      onClick={() => toggleReveal(k.key)}
                      className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
                      title={revealedKeys.has(k.key) ? 'Hide key' : 'Reveal key'}
                    >
                      {revealedKeys.has(k.key) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => copyKey(k.key)}
                      className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
                      title="Copy key"
                    >
                      {copiedKey === k.key
                        ? <Check className="w-3.5 h-3.5 text-green-400" />
                        : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Status badge */}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${k.active ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                    {k.active ? 'Active' : 'Revoked'}
                  </span>

                  {/* Revoke */}
                  {k.active && (
                    confirmRevoke === k.key ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-red-400">Revoke?</span>
                        <button
                          onClick={() => handleRevoke(k.key)}
                          disabled={revokingKey === k.key}
                          className="text-xs px-2 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                        >
                          {revokingKey === k.key ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmRevoke(null)}
                          className="text-xs px-2 py-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRevoke(k.key)}
                        className="shrink-0 p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="Revoke key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#10233f] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-yellow-400" />
                {createdKey ? 'Key Created' : 'New API Key'}
              </h3>
              <button onClick={closeCreate} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5">
              {createdKey ? (
                /* Success view */
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    API key created for <strong>{createdKey.name}</strong>
                  </div>
                  <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
                    <p className="text-xs text-yellow-300/70 mb-2 font-medium">COPY THIS KEY — share it with your partner:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs font-mono text-yellow-200 break-all">{createdKey.key}</code>
                      <button
                        onClick={() => copyKey(createdKey.key)}
                        className="shrink-0 p-2 rounded-lg bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 transition-all"
                      >
                        {copiedKey === createdKey.key ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-white/40">
                    Along with this key, send the partner the <strong className="text-white/60">README</strong> file — download it from the top of the page.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <a
                      href="/api/admin/reels-api-keys/readme"
                      download="REELS_API_PARTNER.md"
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-white/20 py-2.5 text-sm text-white/70 hover:text-white hover:border-white/40 transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Download README
                    </a>
                    <button
                      onClick={closeCreate}
                      className="flex-1 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-semibold py-2.5 text-sm transition-all"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                /* Create form */
                <div className="space-y-4">
                  <p className="text-sm text-white/60">Give this key a name so you know who it belongs to (e.g. the partner agency name).</p>
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">Partner / Key Name</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) handleCreate() }}
                      placeholder="e.g. Ayala Land Portal"
                      className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-yellow-500/60 focus:bg-white/8 transition-all"
                      autoFocus
                    />
                  </div>
                  {createError && (
                    <div className="flex items-center gap-2 text-red-400 text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {createError}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={closeCreate}
                      className="flex-1 rounded-xl border border-white/15 text-white/60 hover:text-white py-2.5 text-sm transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={creating || !newName.trim()}
                      className="flex-1 rounded-xl bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold py-2.5 text-sm transition-all flex items-center justify-center gap-2"
                    >
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                      {creating ? 'Creating…' : 'Create Key'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
