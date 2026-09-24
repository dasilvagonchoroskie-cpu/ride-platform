/** Mascara de telefone enquanto o usuario digita: (11) 91234-5678 */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D+/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function maskPlate(plate: string): string {
  return plate.toUpperCase();
}

export { formatMoney, formatDistance, formatDuration, formatDateTime } from './geo';
