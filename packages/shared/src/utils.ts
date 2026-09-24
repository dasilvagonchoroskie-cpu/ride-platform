/** Utilitarios puros, seguros para rodar no backend e nos apps. */

/** Remove tudo que nao for digito. */
export function onlyDigits(value: string): string {
  return (value ?? '').replace(/\D+/g, '');
}

/** Normaliza telefone brasileiro para E.164 (+55DDNNNNNNNNN). */
export function normalizePhone(raw: string): string {
  const digits = onlyDigits(raw);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  return raw.startsWith('+') ? `+${digits}` : digits;
}

/** Formata telefone E.164 para exibicao: +55 (11) 91234-5678 */
export function formatPhone(raw: string): string {
  const digits = onlyDigits(normalizePhone(raw));
  const match = digits.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (!match) return raw;
  const [, ddd, first, last] = match;
  return `+55 (${ddd}) ${first}-${last}`;
}

/** Valida CPF pelo digito verificador. */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (slice: string): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i += 1) {
      sum += Number(slice[i]) * (slice.length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const d1 = calcDigit(cpf.slice(0, 9));
  const d2 = calcDigit(cpf.slice(0, 10));
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

/** Formata CPF: 000.000.000-00 */
export function formatCpf(value: string): string {
  const cpf = onlyDigits(value).padStart(11, '0').slice(0, 11);
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/** Normaliza placa Mercosul/antiga para maiusculas sem separadores. */
export function normalizePlate(value: string): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Valida placa no padrao antigo (ABC1234) ou Mercosul (ABC1D23). */
export function isValidPlate(value: string): boolean {
  const plate = normalizePlate(value);
  return /^[A-Z]{3}\d{4}$/.test(plate) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(plate);
}

/** Formata placa para exibicao: ABC-1234 ou ABC1D23 */
export function formatPlate(value: string): string {
  const plate = normalizePlate(value);
  if (/^[A-Z]{3}\d{4}$/.test(plate)) return `${plate.slice(0, 3)}-${plate.slice(3)}`;
  return plate;
}

/** Converte centavos para string em BRL: 1234 -> "R$ 12,34" */
export function formatCents(cents: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format((cents ?? 0) / 100);
}

/** Distancia em km entre dois pontos (Haversine). */
export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM_LOCAL * Math.asin(Math.sqrt(h));
}

const EARTH_RADIUS_KM_LOCAL = 6371;

/** Arredonda um valor em centavos para o multiplo mais proximo. */
export function roundCents(value: number): number {
  return Math.round(value);
}

/** Gera um codigo numerico com tamanho fixo (usado para OTP). */
export function generateNumericCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += Math.floor(Math.random() * 10).toString();
  return out;
}

/** Remove acentos e normaliza espacos (busca textual). */
export function slugify(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
