'use client';

/**
 * components/ModalFiltrosExplorar.tsx
 * Ventana de filtros de Explorar (cliente): vista, edad, y filtros avanzados
 * (ciudad, calificación, preferencias). Sin el plan, los avanzados se ven bloqueados
 * y al tocarlos sube la ventana de planes (lo maneja la página con onBloqueado).
 */
import { CATEGORIAS_CHIPS } from '@/lib/chips/chipsPreferencia';
import { IconoCerrar } from '@/components/iconos';

export type Vista = 'tarjeta' | 'cuadricula' | 'lista';

export const EDAD_MINIMA = 18;
export const EDAD_TOPE = 70;

export default function ModalFiltros({
  tieneVistas, esAvanzado, onBloqueado, vista, cambiarVista, busqueda, setBusqueda,
  edadMin, edadMax, setEdadMin, setEdadMax, ciudadFiltro, setCiudadFiltro,
  calMinFiltro, setCalMinFiltro, chipsFiltro, toggleChipFiltro, hayFiltros, onLimpiar, onCerrar,
}: {
  tieneVistas: boolean;
  esAvanzado: boolean;
  onBloqueado: (f: 'vistas_extra' | 'filtros_avanzados') => void;
  vista: Vista; cambiarVista: (v: Vista) => void;
  busqueda: string; setBusqueda: (s: string) => void;
  edadMin: number; edadMax: number; setEdadMin: (n: number) => void; setEdadMax: (n: number) => void;
  ciudadFiltro: string; setCiudadFiltro: (s: string) => void;
  calMinFiltro: number; setCalMinFiltro: (n: number) => void;
  chipsFiltro: string[]; toggleChipFiltro: (c: string) => void;
  hayFiltros: boolean;
  onLimpiar: () => void;
  onCerrar: () => void;
}) {
  const OPCIONES_VISTA: { id: Vista; texto: string }[] = [
    { id: 'tarjeta', texto: 'Tarjeta' },
    { id: 'cuadricula', texto: 'Cuadrícula' },
    { id: 'lista', texto: 'Lista' },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50">
      <div className="bg-vela-bg border border-vela-line rounded-t-[28px] sm:rounded-[28px] max-w-md w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-vela-line">
          <h2 className="text-xl font-bold text-vela-text">Filtros</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="w-11 h-11 rounded-full bg-vela-surface-2 flex items-center justify-center text-vela-text-dim"><IconoCerrar size={20} stroke={2.2} /></button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          <div>
            <label className="text-xs font-semibold text-vela-text-faint">Buscar por alias</label>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Escribe un alias..."
              className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none focus:border-vela-public/60"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-vela-text-faint mb-2">Cómo ver los perfiles</p>
            <div className="flex gap-1 bg-vela-surface-2 rounded-2xl p-1">
              {OPCIONES_VISTA.map((o) => {
                const bloqueada = !tieneVistas && o.id !== 'tarjeta';
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => cambiarVista(o.id)}
                    className={`flex-1 h-11 rounded-xl text-sm font-semibold ${
                      vista === o.id ? 'bg-vela-public text-white' : 'text-vela-text-faint'
                    }`}
                  >
                    {bloqueada && <span aria-hidden="true">🔒 </span>}
                    {o.texto}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-vela-text-faint mb-2">Rango de edad: {edadMin} – {edadMax}</p>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-[11px] text-vela-text-faint mb-1">Desde {edadMin} años</p>
                <input
                  type="range" min={EDAD_MINIMA} max={EDAD_TOPE} value={edadMin}
                  onChange={(e) => setEdadMin(Number(e.target.value))}
                  className="w-full accent-vela-public"
                />
              </div>
              <div>
                <p className="text-[11px] text-vela-text-faint mb-1">Hasta {edadMax} años</p>
                <input
                  type="range" min={EDAD_MINIMA} max={EDAD_TOPE} value={edadMax}
                  onChange={(e) => setEdadMax(Number(e.target.value))}
                  className="w-full accent-vela-public"
                />
              </div>
            </div>
          </div>

          {/* Filtros avanzados: se ven siempre; sin el plan, al tocarlos sube la ventana de planes. */}
          <div className="relative">
            <div
              className={`flex flex-col gap-5 ${esAvanzado ? '' : 'pointer-events-none select-none opacity-50'}`}
              aria-hidden={!esAvanzado}
            >
              <div>
                <label className="text-xs font-semibold text-vela-text-faint">Ciudad</label>
                <input
                  value={ciudadFiltro}
                  onChange={(e) => setCiudadFiltro(e.target.value)}
                  placeholder="Ej. San Salvador"
                  tabIndex={esAvanzado ? 0 : -1}
                  className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none"
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-vela-text-faint mb-2">Calificación mínima: {calMinFiltro > 0 ? `★ ${calMinFiltro}` : 'Cualquiera'}</p>
                <input
                  type="range" min={0} max={5} step={0.5} value={calMinFiltro}
                  onChange={(e) => setCalMinFiltro(Number(e.target.value))}
                  tabIndex={esAvanzado ? 0 : -1}
                  className="w-full accent-vela-public"
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-vela-text-faint mb-2">Preferencias del perfil</p>
                <div className="flex flex-col gap-3">
                  {CATEGORIAS_CHIPS.map((cat) => (
                    <div key={cat.id}>
                      <p className="text-[11px] text-vela-public font-semibold mb-1.5">{cat.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {cat.chips.map((chip) => (
                          <button
                            key={chip}
                            onClick={() => toggleChipFiltro(chip)}
                            tabIndex={esAvanzado ? 0 : -1}
                            className={`px-4 py-2.5 rounded-full text-sm font-medium border ${
                              chipsFiltro.includes(chip) ? 'bg-vela-public-soft border-vela-public text-vela-public' : 'bg-vela-surface-2 border-vela-line text-vela-text-faint'
                            }`}
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {!esAvanzado && (
              <button
                type="button"
                onClick={() => onBloqueado('filtros_avanzados')}
                className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl"
                aria-label="Filtros avanzados: disponibles en Gold y VIP"
              >
                <span className="rounded-full border border-vela-line bg-vela-bg px-4 py-2 text-xs font-bold text-vela-text shadow-lg">
                  🔒 Gold y VIP · Toca para desbloquear
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-vela-line flex gap-3">
          {hayFiltros && (
            <button
              type="button"
              onClick={onLimpiar}
              className="h-14 px-5 rounded-full bg-vela-surface-2 border border-vela-line text-vela-text-dim font-bold text-sm"
            >
              Limpiar
            </button>
          )}
          <button onClick={onCerrar} className="flex-1 h-14 rounded-full bg-vela-public text-white font-bold text-base flex items-center justify-center gap-2">
            Aplicar filtros
            <IconoFlecha />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Flecha de los botones principales (solo diseño). */
function IconoFlecha() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}