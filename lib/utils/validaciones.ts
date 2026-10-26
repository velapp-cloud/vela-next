/**
 * lib/utils/validaciones.ts
 * Validaciones simples y compartidas de correo y teléfono.
 */

/** Correo válido: texto@dominio.ext (sin espacios, un solo @, dominio con punto y extensión de 2+ letras). */
export function esCorreoValido(valor: string): boolean {
  const c = valor.trim();
  if (c.length < 6 || c.length > 254) return false;
  if (c.includes('..')) return false;
  const re = /^[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
  if (!re.test(c)) return false;
  const local = c.split('@')[0];
  return local.length <= 64 && !local.endsWith('.');
}

/** Teléfono: El Salvador (+503) exige exactamente 8 dígitos; otros países, entre 6 y 12. */
export function telefonoValidoPara(dial: string, numero: string): boolean {
  const n = numero.replace(/\D/g, '');
  if (dial === '+503') return n.length === 8;
  return n.length >= 6 && n.length <= 12;
}