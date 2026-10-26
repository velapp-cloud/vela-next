import type { SupabaseClient } from '@supabase/supabase-js';
import { ESTADO_FINALIZADA, ESTADO_CANCELADA } from '@/lib/citas/estados';

export type DatosParaCita = {
  chatId: string;
  clienteId: string;
  proveedoraId: string;
  fichaFecha: string;
  fichaHora: string;
  fichaDuracion: string;
  fichaLugar: string;
  fichaTipo: string;
  fichaMensaje: string;
};

export function combinarFechaHora(fecha: string, hora: string): string {
  // fecha: 'YYYY-MM-DD', hora: 'HH:mm' -> timestamp ISO
  return new Date(`${fecha}T${hora}:00`).toISOString();
}

/** Convierte textos como "30 minutos", "1 hora", "1 hora 30 min" o "2 horas" a horas. */
export function duracionAHoras(duracion: string): number {
  const texto = duracion.toLowerCase().replace(',', '.');
  const h = texto.match(/(\d+(?:\.\d+)?)\s*h/);
  const m = texto.match(/(\d+(?:\.\d+)?)\s*m/);
  let horas = 0;
  if (h) horas += parseFloat(h[1]);
  if (m) horas += parseFloat(m[1]) / 60;
  if (horas > 0) return horas;
  const suelto = parseFloat(texto.replace(/[^\d.]/g, ''));
  return Number.isFinite(suelto) && suelto > 0 ? suelto : 1;
}

/** Crea (o actualiza) la cita del chat y devuelve su id. */
export async function confirmarCita(supabase: SupabaseClient, d: DatosParaCita): Promise<string | null> {
  const horaAcordada = combinarFechaHora(d.fichaFecha, d.fichaHora);
  const duracionHoras = duracionAHoras(d.fichaDuracion);

  const { data: existente } = await supabase
    .from('citas')
    .select('id, estado_manual')
    .eq('chat_id', d.chatId)
    .order('hora_acordada', { ascending: false })
    .limit(1)
    .maybeSingle();

  const campos = {
    lugar: d.fichaLugar,
    direccion: d.fichaLugar,
    hora_acordada: horaAcordada,
    duracion_horas: duracionHoras,
    tipo_encuentro: d.fichaTipo,
    mensaje: d.fichaMensaje,
  };

  const yaCerrada = existente?.estado_manual === ESTADO_FINALIZADA || existente?.estado_manual === ESTADO_CANCELADA;

  if (existente && !yaCerrada) {
    // Cita todavia activa/pendiente para este chat: solo actualizamos sus datos.
    await supabase.from('citas').update(campos).eq('id', existente.id);
    return existente.id;
  }

  // No hay cita para este chat, o la que habia ya quedo finalizada/cancelada:
  // creamos una cita NUEVA (la vieja se queda de historial en Encuentro).
  // No se manda estado_manual: la base de datos usa su valor por defecto ('auto').
  const { data: nueva, error } = await supabase
    .from('citas')
    .insert({
      chat_id: d.chatId,
      cliente_id: d.clienteId,
      proveedora_id: d.proveedoraId,
      ...campos,
      cliente_inicio: false,
      proveedora_inicio: false,
      cliente_confirmo: false,
      proveedora_confirmo: false,
      cliente_califico: false,
      proveedora_califico: false,
      en_emergencia: false,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creando la cita:', error.message, error.details, error.hint, error.code);
    throw error;
  }
  return nueva?.id ?? null;
}