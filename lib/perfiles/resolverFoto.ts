import type { SupabaseClient } from '@supabase/supabase-js';

export function resolverFotoUrl(supabase: SupabaseClient, valor: string): string {
  if (valor.startsWith('http://') || valor.startsWith('https://')) return valor;
  const { data } = supabase.storage.from('fotos-perfil').getPublicUrl(valor);
  return data.publicUrl;
}