import Link from 'next/link';

function IconoFlecha() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export default function Welcome() {
  return (
    <main className="flex-1 flex flex-col justify-between px-6 py-12 max-w-md mx-auto w-full">
      <div />

      <div className="flex flex-col items-center text-center gap-4">
        <h1 className="font-serif italic text-7xl text-vela-public">Vela</h1>
        <p className="text-vela-text-dim text-base max-w-xs">
          Conexiones verificadas, con seguridad real.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/login"
          className="w-full h-14 flex items-center justify-center gap-2 bg-vela-public text-white text-base font-bold rounded-full active:opacity-85 transition"
        >
          Iniciar sesión
          <IconoFlecha />
        </Link>
        <Link
          href="/registro"
          className="w-full h-14 flex items-center justify-center bg-vela-surface-2 border border-vela-line-strong text-vela-text text-base font-bold rounded-full active:opacity-85 transition"
        >
          Crear cuenta
        </Link>
      </div>
    </main>
  );
}