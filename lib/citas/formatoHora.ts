/**
 * lib/citas/formatoHora.ts
 * Convierte "HH:MM" o "HH:MM:SS" (24h) a "h:mm AM/PM".
 * Si ya trae AM/PM, lo deja igual. Si viene vacío, devuelve "—".
 */
export function formatoHora12(hora: string | null | undefined): string {
  if (!hora) return '—';
  const h = hora.trim();
  if (/am|pm/i.test(h)) return h;
  const m = h.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return h;
  let horas = parseInt(m[1], 10);
  const minutos = m[2];
  const sufijo = horas >= 12 ? 'PM' : 'AM';
  horas = horas % 12;
  if (horas === 0) horas = 12;
  return `${horas}:${minutos} ${sufijo}`;
}