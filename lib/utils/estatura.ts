/**
 * lib/utils/estatura.ts
 * Máscara de estatura en metros: el usuario escribe solo números y el punto aparece solo.
 * "1" -> "1", "17" -> "1.7", "170" -> "1.70"
 */
export function formatearEstatura(raw: string): string {
  const digitos = raw.replace(/\D/g, '').slice(0, 3);
  if (digitos.length <= 1) return digitos;
  return `${digitos[0]}.${digitos.slice(1)}`;
}

/** Válida si tiene el formato 1.70 y está en un rango humano (1.20 m a 2.40 m). */
export function estaturaValida(valor: string): boolean {
  if (!/^\d\.\d{2}$/.test(valor)) return false;
  const n = parseFloat(valor);
  return n >= 1.2 && n <= 2.4;
}