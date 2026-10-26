/**
 * lib/planes/planActivo.ts
 * Un plan de paga está "activo" si la cuenta tiene un plan válido y su
 * fecha de vencimiento (plan_vence_en) no ha pasado.
 * Si plan_vence_en es null (cuentas anteriores a este cambio) se considera activo.
 * Cuando integres pagos reales, solo hay que llenar plan_vence_en al cobrar.
 */
const PLANES_DE_PAGO = ['basico', 'premium', 'gold', 'vip'];

export function tienePlanActivo(
  plan: string | null | undefined,
  venceEn: string | null | undefined,
): boolean {
  if (!plan || !PLANES_DE_PAGO.includes(plan)) return false;
  if (!venceEn) return true;
  return new Date(venceEn).getTime() > Date.now();
}