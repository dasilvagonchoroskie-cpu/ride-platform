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
  // Comprovante de endereço: endereço (rua, número, bairro) e cidade, só quando o documento é um comprovante.
  const comprovante = textos.find((t) => tipoDocumento(t) === 'endereco');
  if (comprovante) {
    const end = comprovante.match(/(?:^|\n)\s*endere[çc]o(?:\s+completo)?\s*[:\-]\s*([^\n]{5,200})/i);
    if (end) r.endereco = end[1].trim().slice(0, 200);
    const cid = comprovante.match(/(?:^|\n)\s*cidade(?:\s*\/\s*uf)?\s*[:\-]\s*([^\n]{2,60})/i);
    if (cid) r.cidade = cid[1].trim().replace(/\s*[-\/]\s*[A-Z]{2}$/, '').slice(0, 80);
  }
  return r;
}

// Que documento é este texto lido (📎)? CNH, CRLV (documento do veículo) ou comprovante de endereço.
function tipoDocumento(texto) {
  const t = String(texto || '');
  if (!/📎/u.test(t) && !/^\s*tipo\s*:/im.test(t)) return null;
  const tipo = (t.match(/(?:^|\n|📎)\s*tipo\s*:\s*([^\n]+)/i) || [])[1] || '';
  const alvo = `${tipo}\n${t}`;
  if (/comprovante de (endere[çc]o|resid[êe]ncia)|conta de (luz|energia|[áa]gua|telefone|internet|g[áa]s)|fatura de (energia|[áa]gua|internet|telefone)/i.test(tipo || alvo)) return 'endereco';
  if (/\bcrlv\b|certificado de registro|licenciamento|documento do ve[ií]culo|\brenavam\b/i.test(tipo || alvo)) return 'crlv';
  if (/\bcnh\b|carteira (nacional )?de habilita[çc][ãa]o|habilita[çc][ãa]o/i.test(tipo || alvo)) return 'cnh';
  return null;
}

// Documentos do motorista que já chegaram pela conversa (mensagens do contato com 📎).
function documentosRecebidos(mensagens) {
  const r = { cnh: null, crlv: null, endereco: null };
  for (const m of mensagens || []) {
    if (m.direcao !== 'in') continue;
    const tipo = tipoDocumento(m.texto);
    if (tipo && !r[tipo]) r[tipo] = { mensagem_id: m.id, recebido_em: m.ocorrida_em || m.created_at || null };
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

module.exports = { mascararNumeros, extrairDadosDocumentos, normalizarCategoria, normalizarPlaca, tipoDocumento, documentosRecebidos };
