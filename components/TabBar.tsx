'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/session/SessionProvider';
import { useTotalSinLeer } from '@/lib/chats/useTotalSinLeer';
import {
  IconoExplorar,
  IconoChats,
  IconoPlanes,
  IconoSeguridad,
  IconoEncuentros,
  IconoPerfil,
} from '@/components/iconos';

const TABS = [
  { href: '/explorar', label: 'Vela', Icono: IconoExplorar },
  { href: '/chat', label: 'Chat', Icono: IconoChats },
  { href: '/planes', label: 'Planes', Icono: IconoPlanes },
  { href: '/seguridad', label: 'Seguridad', Icono: IconoSeguridad },
  { href: '/encuentro', label: 'Encuentro', Icono: IconoEncuentros },
  { href: '/perfil', label: 'Perfil', Icono: IconoPerfil },
];

export default function TabBar() {
  const pathname = usePathname();
  const { perfil } = useSession();
  const sinLeer = useTotalSinLeer(perfil?.id, perfil?.rol as 'cliente' | 'proveedora' | undefined);

  return (
    <nav
      className="
        border-t border-vela-line bg-vela-bg flex justify-around items-center py-2 px-1 sticky bottom-0
        md:order-first md:top-0 md:h-screen md:w-60 md:shrink-0 md:flex-col md:justify-start md:items-stretch
        md:gap-1 md:border-t-0 md:border-r md:py-6 md:px-3
      "
    >
      <Link
        href="/explorar"
        className="hidden md:block px-4 pb-5 font-serif italic text-3xl text-vela-public"
      >
        Vela
      </Link>

      {TABS.map((tab) => {
        const esActual = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex flex-col items-center justify-center gap-1 px-3 h-14 rounded-xl transition-colors
              md:flex-row md:justify-start md:gap-3 md:px-4 md:h-12 md:hover:bg-vela-surface ${
              esActual ? 'text-vela-public md:bg-vela-public-soft' : 'text-vela-text-faint'
            }`}
          >
            {esActual && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-vela-public md:top-1/2 md:left-0 md:translate-x-0 md:-translate-y-1/2 md:h-6 md:w-0.5" />
            )}
            <tab.Icono size={24} stroke={esActual ? 2 : 1.75} aria-hidden="true" />
            {tab.href === '/chat' && sinLeer > 0 && (
              <span className="absolute top-1 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-vela-public px-1 text-[9px] font-bold text-white md:static md:ml-auto">
                {sinLeer > 9 ? '9+' : sinLeer}
              </span>
            )}
            <span className={`text-[10px] md:text-sm ${esActual ? 'font-bold' : 'font-medium'}`}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}