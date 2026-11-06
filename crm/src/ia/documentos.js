'use strict';
// Extração direta (sem IA) de dados de documentos já lidos (linhas com 📎): categoria da CNH, placa e veículo.
// Serve de reforço: se a IA não devolver esses campos, o CRM pega do texto lido da CNH/CRLV.
const CATEGORIAS = ['AB', 'AC', 'AD', 'AE', 'A', 'B', 'C', 'D', 'E'];
const PLACA = /\b([A-Z]{3})[-\s]?(\d[A-Z0-9]\d{2})\b/;

function normalizarCategoria(v) {
  const t = String(v || '').toUpperCase();
  const m = t.match(/\b(AB|AC|AD|AE|A|B|C|D|E)\b/);
  return m && CATEGORIAS.includes(m[1]) ? m[1] : null;
}

function normalizarPlaca(v) {
  const m = String(v || '').toUpperCase().match(PLACA);
  return m ? `${m[1]}${m[2]}` : null;
}

function extrairDadosDocumentos(mensagens) {
  const textos = (mensagens || []).filter((m) => m.direcao === 'in' && /📎/u.test(String(m.texto || ''))).map((m) => String(m.texto));
  const tudo = textos.join('\n');
  const r = {};
  const cat = tudo.match(/categoria(?:\s+(?:da\s+)?(?:cnh|habilita[çc][ãa]o))?\s*[:\-]\s*([A-Ea-e]{1,2})\b/i);
  if (cat) { const c = normalizarCategoria(cat[1]); if (c) r.cnh_categoria = c; }
  const placaRotulo = tudo.match(/placa\s*[:\-]\s*([A-Za-z]{3}[-\s]?\d[A-Za-z0-9]\d{2})/i);
  const placa = normalizarPlaca(placaRotulo ? placaRotulo[1] : (/crlv|renavam|ve[ií]culo/i.test(tudo) ? tudo : ''));
  if (placa) r.placa = placa;
  const modelo = tudo.match(/(?:marca\s*\/\s*modelo(?:\s*\/\s*vers[ãa]o)?|modelo do ve[ií]culo|modelo)\s*[:\-]\s*([^\n|;]{2,60})/i);
  if (modelo) {
    const cor = tudo.match(/\bcor(?:\s+predominante)?\s*[:\-]\s*([A-Za-zÀ-ú]{3,20})/i);
    const ano = tudo.match(/ano(?:\s+(?:modelo|fabrica[çc][ãa]o))?\s*[:\-]\s*(\d{4})/i);
    r.veiculo = [modelo[1].trim(), cor && cor[1], ano && ano[1]].filter(Boolean).join(', ').slice(0, 120);
  }
  return r;
}

// Mascara números de documentos no texto lido (CPF, RG, registro da CNH, Renavam, chassi numérico...): o cadastro
// não precisa deles, e assim não ficam guardados nem aparecem para toda a equipe. Mantém os 3 últimos dígitos.
function mascararNumeros(texto) {
  return String(texto || '')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, (m) => `***.***.***-${m.slice(-2)}`)
    .replace(/\b\d(?:[\d.\- ]{6,}\d)\b/g, (m) => {
      const digitos = m.replace(/\D/g, '');
      if (digitos.length < 8) return m;
      return `${'•'.repeat(digitos.length - 3)}${digitos.slice(-3)}`;
    });
}

module.exports = { mascararNumeros, extrairDadosDocumentos, normalizarCategoria, normalizarPlaca };
