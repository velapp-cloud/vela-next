import { createClient } from '@/lib/supabase/client';

// Diferencia entre el reloj del celular y el del servidor.
let desfaseMs = 0;
let ultimaSincronizacion = 0;
let enCurso: Promise<void> | null = null;

/** Hora actual según el servidor (no según el reloj de este celular). */
export function ahoraServidor(): number {
  return Date.now() + desfaseMs;
}

/**
 * Mide la diferencia con el servidor. Se repite cada 5 minutos como máximo.
 * Nunca falla: si no hay conexión se sigue con el reloj del celular.
 */
export function sincronizarHoraServidor(forzar = false): Promise<void> {
  if (!forzar && ultimaSincronizacion && Date.now() - ultimaSincronizacion < 5 * 60_000) {
    return Promise.resolve();
  }
  if (enCurso) return enCurso;

  enCurso = (async () => {
    try {
      const supabase = createClient();
      const antes = Date.now();
      const { data, error } = await supabase.rpc('hora_servidor');
      const despues = Date.now();
      if (error || !data) return;
      const servidor = new Date(data as string).getTime();
      if (!Number.isFinite(servidor)) return;
      // Se asume que la respuesta tardó lo mismo en ir que en volver.
      desfaseMs = servidor - (antes + (despues - antes) / 2);
      ultimaSincronizacion = despues;
    } catch {
      // sin conexión: se usa el reloj del celular
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}