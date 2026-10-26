import type { SupabaseClient } from '@supabase/supabase-js';
import { ESTADO_FINALIZADA } from '@/lib/citas/estados';

export async function finalizarEncuentro(supabase: SupabaseClient, citaId: string) {
  await supabase.from('citas').update({ estado_manual: ESTADO_FINALIZADA }).eq('id', citaId);
}

export async function enviarCalificacion(supabase: SupabaseClient, params: {
  citaId: string;
  calificadoPor: string;
  calificadoA: string;
  estrellas: number;
  chips: string[];
  soyCliente: boolean;
}) {
  await supabase.from('resenas').insert({
    cita_id: params.citaId,
    autor_id: params.calificadoPor,
    calificado_id: params.calificadoA,
    estrellas: params.estrellas,
    chips: params.chips,
  });

  const campo = params.soyCliente ? 'cliente_califico' : 'proveedora_califico';
  await supabase.from('citas').update({ [campo]: true }).eq('id', params.citaId);
}

export async function omitirCalificacion(supabase: SupabaseClient, citaId: string, soyCliente: boolean) {
  const campo = soyCliente ? 'cliente_califico' : 'proveedora_califico';
  await supabase.from('citas').update({ [campo]: true }).eq('id', citaId);
}