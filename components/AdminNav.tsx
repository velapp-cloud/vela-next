'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/revision', label: 'Revisión' },
  { href: '/admin/perfiles', label: 'Perfiles' },
  { href: '/admin/bloqueadas', label: 'Bloqueadas' },
  { href: '/admin/reporte', label: 'Reporte' },
  { href: '/admin/cuenta', label: 'Mi cuenta' },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 bg-vela-bg/95 backdrop-blur border-b border-vela-line">
      <div className="max-w-5xl mx-auto px-6 pt-5 pb-4">
        <p className="font-serif italic text-3xl text-vela-public leading-none">
          Vela
          <span className="not-italic font-sans text-[11px] font-bold tracking-wide ml-2 align-middle" style={{ color: '#F59E0B' }}>
            ADMIN
          </span>
        </p>
        <nav className="flex gap-2 mt-4 overflow-x-auto -mx-1 px-1 pb-0.5">
          {TABS.map((t) => {
            const activo = pathname === t.href || pathname.startsWith(`${t.href}/`);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={activo ? 'page' : undefined}
                className={`h-11 px-5 flex items-center justify-center rounded-full text-sm font-bold whitespace-nowrap border transition-colors ${
                  activo
                    ? 'bg-vela-public border-vela-public text-white'
                    : 'bg-vela-surface-2 border-vela-line text-vela-text-faint'
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}