import type { SupabaseClient } from '@supabase/supabase-js';
import { PASATIEMPOS } from '@/lib/hobbies/pasatiempos';

const LABEL_POR_HOBBY_ID: Record<string, string> = Object.fromEntries(
  PASATIEMPOS.map((h) => [h.id, h.label]),
);

export type PerfilRico = {
  id: string;
  alias: string;
  avatar_color: string;
  foto_url: string | null;
  estatura: string | null;
  ciudad: string | null;
  idiomas: string | null;
  plan: 'basico' | 'premium' | 'gold' | 'vip' | null;
  chips: string[];
};

function resolverFotoUrl(supabase: SupabaseClient, valor: string): string {
  if (valor.startsWith('http://') || valor.startsWith('https://')) return valor;
  const { data } = supabase.storage.from('fotos-perfil').getPublicUrl(valor);
  return data.publicUrl;
}

export async function obtenerPerfilesRicos(
  supabase: SupabaseClient,
  perfilIds: string[],
): Promise<Record<string, PerfilRico>> {
  const resultado: Record<string, PerfilRico> = {};
  if (perfilIds.length === 0) return resultado;

  const { data: perfiles, error: errPerfiles } = await supabase
    .from('perfiles_publicos')
    .select('id, alias, avatar_color, estatura, ciudad, idiomas, plan, fotos')
    .in('id', perfilIds);

  if (errPerfiles) {
    console.error('No se pudieron cargar perfiles_publicos:', errPerfiles.message);
    return resultado;
  }

  for (const p of (perfiles ?? []) as any[]) {
    const fotos: string[] = Array.isArray(p.fotos) ? p.fotos : [];
    resultado[p.id] = {
      id: p.id,
      alias: p.alias,
      avatar_color: p.avatar_color ?? '#D91F3A',
      foto_url: fotos.length > 0 ? resolverFotoUrl(supabase, fotos[0]) : null,
      estatura: p.estatura ?? null,
      ciudad: p.ciudad ?? null,
      idiomas: p.idiomas ?? null,
      plan: p.plan ?? null,
      chips: [],
    };
  }

  const { data: chips, error: errChips } = await supabase
    .from('perfil_chips_preferencia')
    .select('perfil_id, chip')
    .in('perfil_id', perfilIds);

  if (errChips) {
    console.warn('No se pudieron cargar los chips de preferencia:', errChips.message);
  } else {
    for (const row of chips ?? []) {
      if (resultado[row.perfil_id]) resultado[row.perfil_id].chips.push(row.chip);
    }
  }

  const { data: hobbies, error: errHobbies } = await supabase
    .from('perfil_hobbies')
    .select('perfil_id, hobby_id')
    .in('perfil_id', perfilIds);

  if (errHobbies) {
    console.warn('No se pudieron cargar los hobbies:', errHobbies.message);
  } else {
    for (const row of hobbies ?? []) {
      if (resultado[row.perfil_id]) {
        resultado[row.perfil_id].chips.push(LABEL_POR_HOBBY_ID[row.hobby_id] ?? row.hobby_id);
      }
    }
  }

  return resultado;
}