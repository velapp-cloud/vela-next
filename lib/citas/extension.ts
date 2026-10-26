import type { SupabaseClient } from '@supabase/supabase-js';

export async function solicitarExtension(supabase: SupabaseClient, citaId: string, minutos: number) {
  await supabase.from('citas').update({
    extension_pendiente: true,
    extension_minutos_pendiente: minutos,
  }).eq('id', citaId);
}

export async function cancelarExtension(supabase: SupabaseClient, citaId: string) {
  await supabase.from('citas').update({
    extension_pendiente: false,
    extension_minutos_pendiente: null,
  }).eq('id', citaId);
}

export async function responderExtension(supabase: SupabaseClient, params: {
  citaId: string;
  aceptar: boolean;
  minutosPendientes: number;
  acumuladosActuales: number;
}) {
  if (params.aceptar) {
    await supabase.from('citas').update({
      extension_pendiente: false,
      extension_minutos_pendiente: null,
      extension_minutos_acumulados: params.acumuladosActuales + params.minutosPendientes,
    }).eq('id', params.citaId);
  } else {
    await supabase.from('citas').update({
      extension_pendiente: false,
      extension_minutos_pendiente: null,
    }).eq('id', params.citaId);
  }
}