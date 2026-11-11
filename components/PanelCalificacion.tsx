'use client';

import { useState } from 'react';
import { CHIPS_POSITIVOS, CHIPS_NEGATIVOS } from '@/lib/calificaciones/chipsCalificacion';

type Props = {
  alias: string;
  procesando: boolean;
  onEnviar: (estrellas: number, chips: string[]) => void;
  onOmitir: () => void;
  /** Si se pasa, aparece el botón "Volver" (sirve para arrepentirse antes de finalizar). */
  onVolver?: () => void;
};

const ETIQUETAS_ESTRELLAS = ['', 'Muy malo', 'Malo', 'Bueno', 'Muy bueno', 'Excelente'];
const COLOR_ESTRELLAS = ['', 'text-red-400', 'text-orange-400', 'text-amber-400', 'text-lime-400', 'text-emerald-400'];

/** Con 4 o 5 estrellas no se puede marcar nada malo. Con 1, 2 o 3 sí. */
const ESTRELLAS_SIN_NEGATIVOS = 4;

/** Ventana de calificación. No se cierra tocando afuera: hay que calificar, omitir o volver. */
export default function PanelCalificacion({ alias, procesando, onEnviar, onOmitir, onVolver }: Props) {
  const [estrellas, setEstrellas] = useState(0);
  const [chips, setChips] = useState<string[]>([]);

  const hayPositivos = chips.some((c) => (CHIPS_POSITIVOS as readonly string[]).includes(c));
  const hayNegativos = chips.some((c) => (CHIPS_NEGATIVOS as readonly string[]).includes(c));

  // Calificación alta: lo malo no está disponible.
  const negativosNoPermitidos = estrellas >= ESTRELLAS_SIN_NEGATIVOS;
  const negativosBloqueados = negativosNoPermitidos || hayPositivos;

  function elegirEstrellas(n: number) {
    setEstrellas(n);
    // Si sube a 4 o 5 estrellas, se quita lo malo que ya había marcado.
    if (n >= ESTRELLAS_SIN_NEGATIVOS) {
      setChips((prev) => prev.filter((c) => !(CHIPS_NEGATIVOS as readonly string[]).includes(c)));
    }
  }

  // Exclusividad: si ya hay chips de un grupo seleccionados, el grupo contrario queda bloqueado.
  function toggleChip(chip: string, esPositivo: boolean) {
    if (esPositivo && hayNegativos) return;
    if (!esPositivo && (hayPositivos || negativosNoPermitidos)) return;
    setChips((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));
  }

  return (
    <div className="fixed inset-0 z-[900] overflow-y-auto bg-black/75" role="dialog" aria-modal="true" aria-label="Calificar encuentro">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-vela-line bg-vela-surface-2">
          {/* Encabezado */}
          <div className="flex flex-col items-center gap-2 border-b border-vela-line bg-gradient-to-b from-amber-500/10 to-transparent px-4 pb-4 pt-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-vela-public text-xl font-extrabold text-white shadow-lg">
              {alias.charAt(0).toUpperCase()}
            </div>
            <p className="text-center text-base font-extrabold text-vela-text">¿Cómo te fue con {alias}?</p>
            <p className="text-center text-xs text-vela-text-dim">Tu opinión es anónima y ayuda a mantener Vela segura</p>

            <div className="mt-1 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => elegirEstrellas(n)}
                  aria-label={`${n} estrellas`}
                  className={`text-4xl leading-none transition-transform active:scale-90 ${
                    n <= estrellas ? `${COLOR_ESTRELLAS[estrellas]} scale-110 drop-shadow` : 'text-vela-line'
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
            <p className={`h-4 text-sm font-extrabold ${estrellas > 0 ? COLOR_ESTRELLAS[estrellas] : 'text-vela-text-dim'}`}>
              {estrellas > 0 ? ETIQUETAS_ESTRELLAS[estrellas] : 'Toca una estrella'}
            </p>
          </div>

          <div className="flex flex-col gap-3 p-4">
            {/* Lo bueno */}
            <div
              className={`rounded-2xl border p-4 transition-opacity ${
                hayNegativos ? 'border-vela-line opacity-40' : 'border-emerald-500/30 bg-emerald-500/5'
              }`}
            >
              <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-emerald-500">
                <span>👍</span> Lo bueno
              </p>
              <div className="flex flex-wrap gap-2">
                {CHIPS_POSITIVOS.map((chip) => {
                  const sel = chips.includes(chip);
                  return (
                    <button
                      key={chip}
                      onClick={() => toggleChip(chip, true)}
                      disabled={hayNegativos}
                      className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-all ${
                        sel
                          ? 'border-emerald-500 bg-emerald-500 text-white shadow'
                          : 'border-emerald-500/40 text-emerald-500 active:scale-95'
                      } disabled:cursor-not-allowed`}
                    >
                      {sel && '✓ '}
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lo malo: solo con 1, 2 o 3 estrellas */}
            <div
              className={`rounded-2xl border p-4 transition-opacity ${
                negativosBloqueados ? 'border-vela-line opacity-40' : 'border-red-500/30 bg-red-500/5'
              }`}
            >
              <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-red-500">
                <span>👎</span> Lo malo
              </p>
              <div className="flex flex-wrap gap-2">
                {CHIPS_NEGATIVOS.map((chip) => {
                  const sel = chips.includes(chip);
                  return (
                    <button
                      key={chip}
                      onClick={() => toggleChip(chip, false)}
                      disabled={negativosBloqueados}
                      className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-all ${
                        sel
                          ? 'border-red-500 bg-red-500 text-white shadow'
                          : 'border-red-500/40 text-red-400 active:scale-95'
                      } disabled:cursor-not-allowed`}
                    >
                      {sel && '✓ '}
                      {chip}
                    </button>
                  );
                })}
              </div>
              {negativosNoPermitidos && (
                <p className="mt-2 text-xs text-vela-text-dim">
                  Con 4 o 5 estrellas solo puedes elegir lo bueno. Si algo salió mal, baja la calificación a 3 o menos.
                </p>
              )}
            </div>

            {(hayPositivos || hayNegativos) && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-vela-surface px-4 py-2.5">
                <p className="text-xs text-vela-text-dim">
                  {hayPositivos
                    ? 'Elegiste lo bueno, así que lo malo queda bloqueado.'
                    : 'Elegiste lo malo, así que lo bueno queda bloqueado.'}
                </p>
                <button onClick={() => setChips([])} className="shrink-0 min-h-11 px-2 text-xs font-bold text-vela-public underline">
                  Limpiar
                </button>
              </div>
            )}

            <button
              onClick={() => onEnviar(estrellas, chips)}
              disabled={procesando || estrellas === 0}
              className="w-full h-14 rounded-full bg-vela-public text-base font-extrabold text-white shadow-lg transition-opacity disabled:opacity-40"
            >
              {procesando ? 'Enviando...' : 'Enviar calificación y finalizar'}
            </button>
            <button
              onClick={onOmitir}
              disabled={procesando}
              className="w-full min-h-11 text-center text-sm font-semibold text-vela-text-dim underline disabled:opacity-50"
            >
              Solo finalizar sin calificar
            </button>
            {onVolver && (
              <button
                onClick={onVolver}
                disabled={procesando}
                className="w-full min-h-11 text-center text-sm font-semibold text-vela-text-faint disabled:opacity-50"
              >
                Volver al encuentro
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}