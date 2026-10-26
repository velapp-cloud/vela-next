/**
 * lib/citas/combinarFechaHora.ts
 *
 * citas.hora_acordada es timestamptz, pero chats.ficha_fecha (date) y
 * chats.ficha_hora (texto tipo "9:00 p.m.") vienen separados desde el
 * formulario de solicitud. Esta funcion los combina en un solo
 * timestamp ISO para poder guardarlo en citas.hora_acordada.
 */
export function combinarFechaHora(fechaISO: string, horaTexto: string): string {
  // fechaISO viene como "2026-07-06" (columna date de Postgres).
  const [anio, mes, dia] = fechaISO.split('-').map(Number);

  // horaTexto viene como "9:00 p.m.", "9:00 pm", "21:00", etc.
  const match = horaTexto
    .toLowerCase()
    .replace(/\./g, '')
    .match(/(\d{1,2}):(\d{2})\s*(am|pm)?/);

  let horas = 12;
  let minutos = 0;

  if (match) {
    horas = parseInt(match[1], 10);
    minutos = parseInt(match[2], 10);
    const periodo = match[3];
    if (periodo === 'pm' && horas < 12) horas += 12;
    if (periodo === 'am' && horas === 12) horas = 0;
  }

  const fecha = new Date(anio, (mes ?? 1) - 1, dia ?? 1, horas, minutos, 0);
  return fecha.toISOString();
}

/**
 * chats.ficha_duracion viene como texto ("2 horas", "1 hora", "30 min",
 * "3 horas"), pero citas.duracion_horas es numeric. Esta funcion lo
 * convierte a un numero de horas (con decimales si hace falta).
 */
export function duracionATexto2Horas(duracionTexto: string): number {
  const texto = duracionTexto.toLowerCase();
  const minutosMatch = texto.match(/(\d+)\s*min/);
  if (minutosMatch) return parseInt(minutosMatch[1], 10) / 60;

  const horasMatch = texto.match(/(\d+(?:\.\d+)?)\s*hora/);
  if (horasMatch) return parseFloat(horasMatch[1]);

  return 1; // respaldo si el texto no calza con ningun patron conocido
}