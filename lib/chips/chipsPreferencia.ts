/**
 * lib/chips/chipsPreferencia.ts
 * Mismo contenido que constants/chipsPreferencia.ts en la version de
 * Expo — reemplaza el campo de texto libre "tiempo_para".
 */

export type CategoriaChip = {
  id: string;
  label: string;
  icon: string;
  chips: string[];
};

export const CATEGORIAS_CHIPS: CategoriaChip[] = [
  {
    id: 'lugar',
    label: 'Lugar del encuentro',
    icon: 'location',
    chips: [
      'Hotel', 'Motel', 'Restaurante', 'Café', 'Centro comercial',
      'Parque o al aire libre', 'Apartamento privado', 'Residencia privada',
      'Evento social', 'Bar o discoteca', 'Cine', 'Playa',
    ],
  },
  {
    id: 'compania',
    label: 'Tipo de compañía',
    icon: 'heart',
    chips: [
      'Cena romántica', 'Cita de novios', 'Solo conversación',
      'Acompañamiento a evento', 'Compañía para viaje',
      'Paseo o actividad al aire libre', 'Acompañamiento a compromiso familiar',
      'Salida a bailar', 'Tarde de café y charla', 'Celebración especial',
    ],
  },
  {
    id: 'limites',
    label: 'Límites y condiciones',
    icon: 'shield',
    chips: [
      'Con contacto físico', 'Sin contacto físico', 'Solo en lugares públicos',
      'Transporte propio para ambos', 'Sin fotos ni videos durante el encuentro',
      'Puntualidad estricta', 'Comunicación solo por el chat de Vela',
      'Respeto mutuo ante todo',
    ],
  },
];

export const TODOS_LOS_CHIPS: string[] = CATEGORIAS_CHIPS.flatMap((c) => c.chips);

export const CHIP_A_CATEGORIA: Record<string, string> = Object.fromEntries(
  CATEGORIAS_CHIPS.flatMap((cat) => cat.chips.map((chip) => [chip, cat.label]))
);
