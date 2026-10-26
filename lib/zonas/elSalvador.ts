/**
 * lib/zonas/elSalvador.ts
 * 14 departamentos y 44 municipios (división territorial vigente desde 2024).
 */

export const ZONAS_SV: Record<string, string[]> = {
  'Ahuachapán': ['Ahuachapán Norte', 'Ahuachapán Centro', 'Ahuachapán Sur'],
  'Cabañas': ['Cabañas Este', 'Cabañas Oeste'],
  'Chalatenango': ['Chalatenango Norte', 'Chalatenango Centro', 'Chalatenango Sur'],
  'Cuscatlán': ['Cuscatlán Norte', 'Cuscatlán Sur'],
  'La Libertad': ['La Libertad Norte', 'La Libertad Centro', 'La Libertad Oeste', 'La Libertad Este', 'La Libertad Costa', 'La Libertad Sur'],
  'La Paz': ['La Paz Oeste', 'La Paz Centro', 'La Paz Este'],
  'La Unión': ['La Unión Norte', 'La Unión Sur'],
  'Morazán': ['Morazán Norte', 'Morazán Sur'],
  'San Miguel': ['San Miguel Norte', 'San Miguel Centro', 'San Miguel Oeste'],
  'San Salvador': ['San Salvador Norte', 'San Salvador Oeste', 'San Salvador Este', 'San Salvador Centro', 'San Salvador Sur'],
  'San Vicente': ['San Vicente Norte', 'San Vicente Sur'],
  'Santa Ana': ['Santa Ana Norte', 'Santa Ana Centro', 'Santa Ana Este', 'Santa Ana Oeste'],
  'Sonsonate': ['Sonsonate Norte', 'Sonsonate Centro', 'Sonsonate Este', 'Sonsonate Oeste'],
  'Usulután': ['Usulután Norte', 'Usulután Este', 'Usulután Oeste'],
};

export const DEPARTAMENTOS = Object.keys(ZONAS_SV);

export type AlcanceVisibilidad = 'nacional' | 'departamento' | 'municipio';

export function resumenVisibilidad(
  alcance: AlcanceVisibilidad | null | undefined,
  departamentos: string[] | null | undefined,
  municipios: string[] | null | undefined,
): string {
  if (alcance === 'departamento' && departamentos && departamentos.length > 0) {
    return `Departamento: ${departamentos.join(', ')}`;
  }
  if (alcance === 'municipio' && municipios && municipios.length > 0) {
    return `Municipio: ${municipios.join(', ')}`;
  }
  return 'A nivel nacional (todo El Salvador)';
}