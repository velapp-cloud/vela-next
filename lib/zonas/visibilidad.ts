/**
 * lib/zonas/visibilidad.ts
 * Puntaje de visibilidad de un perfil para quien está explorando:
 *   2   = la ciudad de quien explora coincide con un municipio elegido por el perfil
 *   1.5 = coincide el departamento (el perfil eligió ese departamento, o un municipio dentro de él)
 *   1   = el perfil eligió "nacional"
 *   0   = el perfil eligió una zona que NO coincide
 * Solo se usa para ORDENAR; nunca oculta perfiles.
 *
 * La ciudad de quien explora sale del registro (DEPARTAMENTOS_SV) o es texto libre,
 * así que se compara sin tildes ni mayúsculas y se deduce su departamento.
 */
import { DEPARTAMENTOS_SV } from '@/lib/paises/departamentosSV';
import { ZONAS_SV } from '@/lib/zonas/elSalvador';

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function coincide(ciudad: string, zona: string): boolean {
  const c = normalizar(ciudad);
  const z = normalizar(zona);
  if (c.length < 3) return false;
  return z.includes(c) || c.includes(z);
}

/** Departamento (normalizado) al que pertenece una ciudad, o null si no se encuentra. */
function departamentoDeCiudad(ciudad: string): string | null {
  const c = normalizar(ciudad);
  if (!c) return null;
  // 1) La ciudad es un departamento por sí misma ("San Salvador").
  for (const dep of Object.keys(DEPARTAMENTOS_SV)) {
    if (normalizar(dep) === c) return normalizar(dep);
  }
  // 2) La ciudad es uno de los municipios del registro.
  for (const [dep, ciudades] of Object.entries(DEPARTAMENTOS_SV)) {
    if (ciudades.some((x) => normalizar(x) === c)) return normalizar(dep);
  }
  // 3) La ciudad aparece en la lista de municipios de ZONAS_SV.
  for (const [dep, munis] of Object.entries(ZONAS_SV)) {
    if (munis.some((m) => coincide(ciudad, m))) return normalizar(dep);
  }
  return null;
}

/** Departamento (normalizado) al que pertenece un municipio de ZONAS_SV. */
function departamentoDeMunicipio(muni: string): string | null {
  for (const [dep, munis] of Object.entries(ZONAS_SV)) {
    if (munis.includes(muni)) return normalizar(dep);
  }
  return null;
}

export function puntajeZona(
  ciudadCliente: string | null | undefined,
  alcance: string | null | undefined,
  departamentos: string[] | null | undefined,
  municipios: string[] | null | undefined,
): number {
  if (!alcance || alcance === 'nacional') return 1;
  const ciudad = ciudadCliente ?? '';
  if (!ciudad.trim()) return 0;

  const depCliente = departamentoDeCiudad(ciudad);

  if (alcance === 'departamento') {
    const deps = (departamentos ?? []).map(normalizar);
    if (depCliente && deps.includes(depCliente)) return 2;
    return (departamentos ?? []).some((d) => coincide(ciudad, d)) ? 2 : 0;
  }

  if (alcance === 'municipio') {
    const munis = municipios ?? [];
    if (munis.some((m) => coincide(ciudad, m))) return 2;
    if (depCliente) {
      const depsDeMunis = munis.map(departamentoDeMunicipio).filter((d): d is string => !!d);
      if (depsDeMunis.includes(depCliente)) return 1.5;
    }
    return 0;
  }

  return 1;
}