/**
 * lib/citas/estados.ts
 *
 * Valores reales del enum `estado_manual` de la tabla `citas`,
 * confirmados con pg_enum: auto, activo, finalizada, cancelada.
 * (No existe un valor literal "pendiente" — el estado por defecto,
 * antes de que arranque el cronometro, es "auto".)
 */
export const ESTADO_PENDIENTE = 'auto';
export const ESTADO_ACTIVA = 'activo';
export const ESTADO_FINALIZADA = 'finalizada';
export const ESTADO_CANCELADA = 'cancelada';