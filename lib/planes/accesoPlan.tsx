'use client';

/**
 * lib/planes/accesoPlan.tsx
 * Control de acceso por plan, en un solo lugar.
 *
 * Uso en cualquier pantalla:
 *   const { tieneAcceso, requerir, mostrarPlanes } = useAccesoPlan();
 *   if (!requerir('vistas_extra')) return;   // si el plan no lo incluye, sube la ventana de planes
 *   mostrarPlanes();                         // abre la ventana de planes sin una función en particular
 *
 * Para bloquear una función nueva: agrégala a FUNCIONES con la regla que dice si el plan la incluye.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session/SessionProvider';
import { CAPACIDADES } from '@/lib/planes/capacidades';

type Capacidad = (typeof CAPACIDADES)['basico'];

export type FuncionDePlan = 'vistas_extra' | 'filtros_avanzados';

const ORDEN_PLANES = ['basico', 'premium', 'gold', 'vip'] as const;
type IdPlan = (typeof ORDEN_PLANES)[number];

const FUNCIONES: Record<
  FuncionDePlan,
  { titulo: string; descripcion: string; incluida: (cap: Capacidad) => boolean }
> = {
  vistas_extra: {
    titulo: 'Más formas de ver los perfiles',
    descripcion: 'Las vistas de cuadrícula y de lista son de los planes Gold y VIP.',
    incluida: (cap) => !cap.vistaUnicaForzada,
  },
  filtros_avanzados: {
    titulo: 'Filtros avanzados',
    descripcion: 'Filtrar por ciudad, calificación y preferencias del perfil es de los planes Gold y VIP.',
    incluida: (cap) => cap.filtrosAvanzados,
  },
};

/** Lo que incluye cada plan, para mostrarlo en la ventana. */
function beneficios(id: IdPlan, cap: Capacidad): string[] {
  const lista = [`${cap.perfilesDia} perfiles al día`];
  if (cap.filtrosAvanzados) lista.push('Filtros avanzados');
  if (!cap.vistaUnicaForzada) lista.push('Vistas de cuadrícula y lista');
  if (id === 'vip') lista.push('Ves todos los perfiles, sin límite de zona');
  return lista;
}

type Valor = {
  /** ¿Mi plan incluye esta función? (no muestra nada) */
  tieneAcceso: (f: FuncionDePlan) => boolean;
  /** Si mi plan la incluye devuelve true; si no, sube la ventana de planes y devuelve false. */
  requerir: (f: FuncionDePlan) => boolean;
  /** Abre la ventana con los planes disponibles, sin una función en particular. */
  mostrarPlanes: () => void;
};

const Contexto = createContext<Valor | null>(null);

export function AccesoPlanProvider({ children }: { children: ReactNode }) {
  const { perfil } = useSession();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pedida, setPedida] = useState<FuncionDePlan | null>(null);

  const planActual = (perfil?.plan ?? 'basico') as IdPlan;
  const cap: Capacidad = CAPACIDADES[planActual] ?? CAPACIDADES.basico;

  const tieneAcceso = useCallback((f: FuncionDePlan) => FUNCIONES[f].incluida(cap), [cap]);
  const requerir = useCallback(
    (f: FuncionDePlan) => {
      if (FUNCIONES[f].incluida(cap)) return true;
      setPedida(f);
      setAbierto(true);
      return false;
    },
    [cap],
  );
  const mostrarPlanes = useCallback(() => {
    setPedida(null);
    setAbierto(true);
  }, []);

  const valor = useMemo(() => ({ tieneAcceso, requerir, mostrarPlanes }), [tieneAcceso, requerir, mostrarPlanes]);

  function cerrar() {
    setAbierto(false);
    setPedida(null);
  }

  function elegir(id: IdPlan) {
    cerrar();
    router.push(`/planes?plan=${id}`);
  }

  const info = pedida ? FUNCIONES[pedida] : null;
  const indiceActual = Math.max(0, ORDEN_PLANES.indexOf(planActual));
  // Solo se ofrecen los planes que mejoran el que ya tienes.
  const disponibles = ORDEN_PLANES.slice(indiceActual + 1);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {abierto && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-label="Planes disponibles"
          onClick={cerrar}
        >
          <div
            className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-vela-line bg-vela-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-vela-line" aria-hidden="true" />

            <div className="mb-4 text-center">
              <p className="mb-1 text-3xl" aria-hidden="true">🔒</p>
              <h2 className="text-xl font-bold text-vela-text">{info ? info.titulo : 'Mejora tu plan'}</h2>
              <p className="mt-1 text-sm text-vela-text-dim">
                {info ? info.descripcion : 'Elige el plan que más se ajuste a ti.'}
              </p>
              <p className="mt-1 text-xs text-vela-text-faint">Tu plan actual: {cap.label}</p>
            </div>

            {disponibles.length === 0 ? (
              <p className="rounded-2xl bg-vela-surface p-4 text-center text-sm text-vela-text-dim">
                Ya tienes el plan más alto. ¡Tienes todo desbloqueado!
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {disponibles.map((id) => {
                  const c: Capacidad = CAPACIDADES[id];
                  const desbloquea = info ? info.incluida(c) : false;
                  return (
                    <div
                      key={id}
                      className={`rounded-2xl border p-4 ${
                        desbloquea ? 'border-vela-public bg-vela-public-soft' : 'border-vela-line bg-vela-surface'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-lg font-extrabold text-vela-text">{c.label}</p>
                        {desbloquea && (
                          <span className="rounded-full bg-vela-public px-2.5 py-1 text-[10px] font-extrabold text-white">
                            Desbloquea esto
                          </span>
                        )}
                      </div>
                      <ul className="mb-3 flex flex-col gap-1 text-sm text-vela-text-dim">
                        {beneficios(id, c).map((b) => (
                          <li key={b} className="flex items-start gap-2">
                            <span className="text-vela-public" aria-hidden="true">✓</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => elegir(id)}
                        className="h-12 w-full rounded-full bg-vela-public text-base font-bold text-white"
                      >
                        Elegir {c.label}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={cerrar}
              className="mt-3 min-h-12 w-full text-sm font-semibold text-vela-text-dim"
            >
              Ahora no
            </button>
          </div>
        </div>
      )}
    </Contexto.Provider>
  );
}

export function useAccesoPlan(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error('useAccesoPlan debe usarse dentro de AccesoPlanProvider (está en app/(app)/layout.tsx).');
  return v;
}