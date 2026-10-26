/**
 * lib/paises/departamentosSV.ts
 * Los 14 departamentos de El Salvador con sus municipios principales
 * — usado en el Paso 3 del registro cuando el pais elegido es El
 * Salvador. Para cualquier otro pais, se usa un campo de texto libre
 * (no es practico mantener una base de ciudades de 50 paises a mano).
 */
export const DEPARTAMENTOS_SV: Record<string, string[]> = {
  'Ahuachapán': ['Ahuachapán', 'Atiquizaya', 'Concepción de Ataco', 'Tacuba'],
  'Santa Ana': ['Santa Ana', 'Chalchuapa', 'Metapán', 'Coatepeque'],
  'Sonsonate': ['Sonsonate', 'Acajutla', 'Izalco', 'Nahuizalco'],
  'Chalatenango': ['Chalatenango', 'La Palma', 'Nueva Concepción', 'Tejutla'],
  'La Libertad': ['Santa Tecla', 'Antiguo Cuscatlán', 'La Libertad', 'Zaragoza', 'Colón'],
  'San Salvador': ['San Salvador', 'Soyapango', 'Mejicanos', 'Apopa', 'Ilopango', 'San Marcos', 'Ayutuxtepeque'],
  'Cuscatlán': ['Cojutepeque', 'Suchitoto', 'San Pedro Perulapán'],
  'La Paz': ['Zacatecoluca', 'Olocuilta', 'San Pedro Masahuat'],
  'Cabañas': ['Sensuntepeque', 'Ilobasco', 'Victoria'],
  'San Vicente': ['San Vicente', 'Apastepeque', 'Tecoluca'],
  'Usulután': ['Usulután', 'Jiquilisco', 'Santiago de María'],
  'San Miguel': ['San Miguel', 'Chinameca', 'Chirilagua'],
  'Morazán': ['San Francisco Gotera', 'Jocoro', 'Corinto'],
  'La Unión': ['La Unión', 'Santa Rosa de Lima', 'Conchagua'],
};

export const NOMBRES_DEPARTAMENTOS_SV = Object.keys(DEPARTAMENTOS_SV);