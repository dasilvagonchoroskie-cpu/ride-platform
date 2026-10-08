/**
 * Fortaleza Mov — envia os codigos de acesso pelo Gmail (gratis).
 *
 * O servidor (Render) chama este script por HTTPS; o script manda o e-mail
 * pela conta Google em que ele foi publicado. Sem SMTP (o plano gratis do
 * Render bloqueia) e sem pagar provedor. Limite do Gmail comum: cerca de
 * 100 e-mails por dia.
 *
 * Instalacao (uma vez): script.google.com > Novo projeto > colar este codigo
 * > trocar o SEGREDO pelo que o Claude mandou > Implantar > Nova implantacao
 * > App da Web (Executar como: Eu; Quem pode acessar: Qualquer pessoa) >
 * autorizar > copiar a URL do app da Web e mandar ao Claude.
 *
 * NUNCA coloque o segredo verdadeiro neste arquivo do GitHub (o repositorio
 * e publico): ele so vai no script dentro da conta Google.
 */
const SEGREDO = 'TROQUE_PELO_SEGREDO_QUE_O_CLAUDE_MANDOU';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (!d || d.segredo !== SEGREDO) return saida({ ok: false, erro: 'segredo' });
    const para = String(d.para || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) return saida({ ok: false, erro: 'para' });
    const opcoes = { name: String(d.nome || 'Fortaleza Mov').slice(0, 60) };
    if (d.html) opcoes.htmlBody = String(d.html);
    MailApp.sendEmail(para, String(d.assunto || 'Fortaleza Mov').slice(0, 200), String(d.texto || ''), opcoes);
    return saida({ ok: true, restantes: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return saida({ ok: false, erro: String(err).slice(0, 300) });
  }
}

/** Abrir a URL no navegador mostra se o script esta no ar. */
function doGet() {
  return saida({ ok: true, servico: 'Fortaleza Mov - e-mail', restantes: MailApp.getRemainingDailyQuota() });
}

function saida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
