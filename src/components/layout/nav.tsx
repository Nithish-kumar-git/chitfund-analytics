'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen, Plus, X, Menu, LogOut } from 'lucide-react'
import { useState } from 'react'
import { logoutAction } from '@/lib/auth/actions'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  exact?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/chits', label: 'Chits', icon: BookOpen },
]

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname()
  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={[
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150',
        isActive
          ? 'bg-[#1E3A5F] text-[#60A5FA] border border-[rgba(59,130,246,0.25)]'
          : 'text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#E2E8F0] border border-transparent',
      ].join(' ')}
      aria-current={isActive ? 'page' : undefined}
    >
      <item.icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      {item.label}
    </Link>
  )
}

/** Desktop sidebar — fixed left panel */
export function Sidebar() {
  return (
    <aside
      className="hidden lg:flex flex-col w-56 shrink-0 bg-[#0A1120] border-r border-[rgba(255,255,255,0.06)] h-screen sticky top-0 print:hidden"
      aria-label="Main navigation"
    >
      {/* Brand */}
      <div className="px-5 py-5 border-b border-[rgba(255,255,255,0.06)]">
        <span className="text-sm font-semibold text-[#E2E8F0] tracking-tight">Chit Fund</span>
        <span className="ml-1 text-[10px] font-mono text-[#059669] uppercase tracking-widest">analytics</span>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      {/* Actions */}
      <div className="px-3 pb-5 flex flex-col gap-2">
        <Link
          href="/chits/new"
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A1120]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Chit
        </Link>
        <form action={logoutAction}>
          <button type="submit" className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#E2E8F0] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}

/** Mobile top bar with hamburger and slide-in drawer */
export function MobileTopbar() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <>
      <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#0A1120] border-b border-[rgba(255,255,255,0.06)] sticky top-0 z-40 print:hidden">
        <span className="text-sm font-semibold text-[#E2E8F0] tracking-tight">
          Chit Fund <span className="text-[10px] font-mono text-[#059669] uppercase tracking-widest">analytics</span>
        </span>
        <button
          onClick={() => setOpen(true)}
          className="p-2 rounded-lg text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#E2E8F0] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
          aria-label="Open navigation menu"
          aria-expanded={open}
          aria-controls="mobile-nav"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          aria-hidden="true"
          onClick={close}
        />
      )}

      {/* Drawer */}
      <div
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={[
          'fixed top-0 left-0 h-full w-64 bg-[#0A1120] border-r border-[rgba(255,255,255,0.06)] z-50 flex flex-col transition-transform duration-200 lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <span className="text-sm font-semibold text-[#E2E8F0]">Navigation</span>
          <button
            onClick={close}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#E2E8F0] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} onClick={close} />
          ))}
        </nav>

        <div className="px-3 pb-6 flex flex-col gap-2">
          <Link
            href="/chits/new"
            onClick={close}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm font-medium transition-colors duration-150"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Chit
          </Link>
          <form action={logoutAction}>
            <button type="submit" onClick={close} className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#E2E8F0] transition-colors duration-150">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
