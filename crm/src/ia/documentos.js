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

// Datas lidas de documentos (dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa ou aaaa-mm-dd) → "AAAA-MM-DD"; null se não for uma data real.
function dataISO(v) {
  const t = String(v || '').trim();
  let d; let m; let a;
  let x = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (x) { d = +x[1]; m = +x[2]; a = +x[3]; } else {
    x = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!x) return null;
    a = +x[1]; m = +x[2]; d = +x[3];
  }
  if (a < 1940 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const DATA_NO_TEXTO = '(\\d{1,2}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{4}|\\d{4}-\\d{2}-\\d{2})';

function normalizarPlaca(v) {
  const m = String(v || '').toUpperCase().match(PLACA);
  return m ? `${m[1]}${m[2]}` : null;
}

function extrairDadosDocumentos(mensagens) {
  const textos = (mensagens || []).filter((m) => m.direcao === 'in' && /📎/u.test(String(m.texto || ''))).map((m) => String(m.texto));
  const tudo = textos.join('\n');
  const r = {};
  const cat = tudo.match(/(?:categoria(?:\s+(?:da\s+)?(?:cnh|habilita[çc][ãa]o))?|cat\.?\s*hab\.?)\s*[:\-]\s*([A-Ea-e]{1,2})\b/i);
  if (cat) { const c = normalizarCategoria(cat[1]); if (c) r.cnh_categoria = c; }
  // Datas da CNH: só de textos lidos que são CNH (a "validade" de outros papéis não entra).
  for (const t of textos.filter((x) => tipoDocumento(x) === 'cnh')) {
    const prim = t.match(new RegExp(`(?:primeira|1[ªa°º]?)\\s*habilita[çc][ãa]o\\s*[:\\-]\\s*${DATA_NO_TEXTO}`, 'i'));
    const val = t.match(new RegExp(`validade(?:\\s+da\\s+(?:cnh|habilita[çc][ãa]o))?\\s*[:\\-]\\s*${DATA_NO_TEXTO}`, 'i'));
    const p1 = prim && dataISO(prim[1]);
    const v1 = val && dataISO(val[1]);
    if (p1 && !r.cnh_primeira_habilitacao) r.cnh_primeira_habilitacao = p1;
    if (v1 && !r.cnh_validade) r.cnh_validade = v1;
  }
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

// Que documento é este texto lido (📎)? Os 7 itens do candidato a motorista: CNH, CRLV, comprovante de residência,
// certidão de antecedentes criminais e as três fotos do veículo (frente, lado, traseira — cada uma é um item).
const TIPOS_DOCUMENTO = ['cnh', 'crlv', 'endereco', 'antecedentes', 'foto_frente', 'foto_lado', 'foto_traseira'];
function tipoDocumento(texto) {
  const t = String(texto || '');
  if (!/📎/u.test(t) && !/^\s*tipo\s*:/im.test(t)) return null;
  const tipo = (t.match(/(?:^|\n|📎)\s*tipo\s*:\s*([^\n]+)/i) || [])[1] || '';
  const alvo = `${tipo}\n${t}`;
  const base = tipo || alvo;
  if (/antecedentes? criminais|certid[ãa]o (judicial |de distribui[çc][ãa]o )?criminal|certid[ãa]o negativa criminal/i.test(base)) return 'antecedentes';
  if (/\bfoto\b[^\n]{0,30}\bve[ií]culo|\bve[ií]culo\b[^\n]{0,20}\b(foto|imagem)\b|imagem do ve[ií]culo/i.test(tipo)) {
    if (/frente|frontal|dianteir/i.test(tipo)) return 'foto_frente';
    if (/lado|lateral|perfil/i.test(tipo)) return 'foto_lado';
    if (/traseir|\btr[aá]s\b|fundo/i.test(tipo)) return 'foto_traseira';
    return null; // foto do veículo sem lado claro: a equipe confere (não conta como nenhum dos três)
  }
  if (/comprovante de (endere[çc]o|resid[êe]ncia)|conta de (luz|energia|[áa]gua|telefone|internet|g[áa]s)|fatura de (energia|[áa]gua|internet|telefone)/i.test(base)) return 'endereco';
  if (/\bcrlv\b|certificado de registro|licenciamento|documento do ve[ií]culo|\brenavam\b/i.test(base)) return 'crlv';
  if (/\bcnh\b|carteira (nacional )?de habilita[çc][ãa]o|habilita[çc][ãa]o/i.test(base)) return 'cnh';
  return null;
}

// Documentos do motorista que já chegaram pela conversa (mensagens do contato com 📎).
function documentosRecebidos(mensagens) {
  const r = Object.fromEntries(TIPOS_DOCUMENTO.map((k) => [k, null]));
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
  // Datas (nascimento, validade, 1ª habilitação) NÃO são números de documento: ficam de fora da máscara
  // (senão "05-10-2008" virava pontinhos e o CRM perdia a validade da CNH).
  const datas = [];
  const semDatas = String(texto || '').replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}\b/g, (d) => { datas.push(d); return `\u0001${datas.length - 1}\u0002`; });
  return semDatas
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, (m) => `***.***.***-${m.slice(-2)}`)
    .replace(/\b\d(?:[\d.\- ]{6,}\d)\b/g, (m) => {
      const digitos = m.replace(/\D/g, '');
      if (digitos.length < 8) return m;
      return `${'•'.repeat(digitos.length - 3)}${digitos.slice(-3)}`;
    })
    .replace(/\u0001(\d+)\u0002/g, (_, i) => datas[Number(i)]);
}

module.exports = { TIPOS_DOCUMENTO, dataISO, mascararNumeros, extrairDadosDocumentos, normalizarCategoria, normalizarPlaca, tipoDocumento, documentosRecebidos };
