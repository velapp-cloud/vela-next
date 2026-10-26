/**
 * lib/planes/capacidades.ts
 * Equivalente a CAPACIDADES en session.tsx (Expo) — tabla fija de que
 * habilita cada plan. A diferencia de la version de Expo, aqui NO hay
 * ningun "cap()" que lea de un objeto global — siempre se pasa el
 * plan explicitamente, para que esta funcion sea igual de segura sin
 * importar si se llama del lado del servidor o del cliente.
 */

export type Plan = 'basico' | 'premium' | 'gold' | 'vip';

export type Capacidad = {
  label: string;
  precioSemana: number;
  precioMes: number;
  perfilesDia: number;
  soporte: string;
  verComentarios: boolean;
  guardarFavoritos: boolean;
  compartirPerfil: boolean;
  citasSimultaneas: number;
  filtrosAvanzados: boolean;
  insigniaDestacada: boolean;
  maxFotos: number;
  vistaUnicaForzada: boolean;
  reagendamientosMax: number | null; // null = ilimitado
};

export const CAPACIDADES: Record<Plan, Capacidad> = {
  basico: {
    label: 'Básico', precioSemana: 4.99, precioMes: 9.99, perfilesDia: 10,
    soporte: 'Estándar', verComentarios: false, guardarFavoritos: false,
    compartirPerfil: false, citasSimultaneas: 1, filtrosAvanzados: false,
    insigniaDestacada: false, maxFotos: 2, vistaUnicaForzada: true,
    reagendamientosMax: 3,
  },
  premium: {
    label: 'Premium', precioSemana: 9.99, precioMes: 19.99, perfilesDia: 25,
    soporte: 'Estándar', verComentarios: true, guardarFavoritos: true,
    compartirPerfil: false, citasSimultaneas: 1, filtrosAvanzados: false,
    insigniaDestacada: false, maxFotos: 5, vistaUnicaForzada: true,
    reagendamientosMax: 3,
  },
  gold: {
    label: 'Gold', precioSemana: 14.99, precioMes: 29.99, perfilesDia: 45,
    soporte: 'Prioritario', verComentarios: true, guardarFavoritos: true,
    compartirPerfil: true, citasSimultaneas: 2, filtrosAvanzados: true,
    insigniaDestacada: true, maxFotos: 6, vistaUnicaForzada: false,
    reagendamientosMax: 5,
  },
  vip: {
    label: 'VIP', precioSemana: 19.99, precioMes: 39.99, perfilesDia: 99,
    soporte: 'Prioritario 24/7', verComentarios: true, guardarFavoritos: true,
    compartirPerfil: true, citasSimultaneas: 3, filtrosAvanzados: true,
    insigniaDestacada: true, maxFotos: 8, vistaUnicaForzada: false,
    reagendamientosMax: null,
  },
};

/** Siempre recibe el plan explicitamente — nunca lee de un objeto
 * global. Uso: cap(perfil.plan).maxFotos */
export function cap(plan: Plan): Capacidad {
  return CAPACIDADES[plan] ?? CAPACIDADES.basico;
}
