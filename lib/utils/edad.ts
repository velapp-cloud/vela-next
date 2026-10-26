/**
 * lib/utils/edad.ts
 * Calcula la edad a partir de "YYYY-MM-DD" sin el bug de zona horaria
 * (new Date("YYYY-MM-DD") se interpreta en UTC y en El Salvador puede
 * correr el día).
 */
export function calcularEdad(fechaNacimiento: string | null | undefined): number | null {
  if (!fechaNacimiento) return null;
  const [anio, mes, dia] = fechaNacimiento.slice(0, 10).split('-').map(Number);
  if (!anio || !mes || !dia) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - anio;
  const yaCumplio =
    hoy.getMonth() + 1 > mes || (hoy.getMonth() + 1 === mes && hoy.getDate() >= dia);
  if (!yaCumplio) edad--;
  return edad >= 0 && edad < 120 ? edad : null;
}