/**
 * lib/planes/colorPlan.ts
 * Color y nombre de cada plan. El contorno de color en las fotos de un perfil
 * (Básico / Premium / Gold) solo lo ven las personas con plan VIP.
 * Los perfiles VIP ya se identifican con su insignia "★ VIP" para todo el mundo.
 */
import type { CSSProperties } from 'react';

export const ETIQUETA_PLAN: Record<string, string> = {
  basico: 'Básico',
  premium: 'Premium',
  gold: 'Gold',
  vip: 'VIP',
};

export const COLOR_PLAN: Record<string, string> = {
  basico: '#94A3B8',
  premium: '#A855F7',
  gold: '#EAB308',
};

/** Color del contorno, o null si no corresponde mostrarlo (quien mira no es VIP, o el perfil es VIP). */
export function colorAro(planDelPerfil: string | null | undefined, yoSoyVip: boolean): string | null {
  if (!yoSoyVip || !planDelPerfil) return null;
  return COLOR_PLAN[planDelPerfil] ?? null;
}

/** Estilo listo para poner en el contenedor de la foto. */
export function estiloAro(planDelPerfil: string | null | undefined, yoSoyVip: boolean): CSSProperties | undefined {
  const color = colorAro(planDelPerfil, yoSoyVip);
  return color ? { boxShadow: `0 0 0 3px ${color}` } : undefined;
}