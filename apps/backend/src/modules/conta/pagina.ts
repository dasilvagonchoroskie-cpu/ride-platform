/**
 * Paginas simples em HTML (publicas, sem login): politica de privacidade,
 * termos e exclusao de conta. A Google Play pede ENDERECOS DE INTERNET para
 * a politica de privacidade e para pedir a exclusao da conta.
 */

export function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Markdown simples (#, ##, listas com -, **negrito**, paragrafos) para HTML. */
export function markdownParaHtml(md: string): string {
  const linhas = md.replace(/\r/g, '').split('\n');
  const saida: string[] = [];
  let paragrafo: string[] = [];
  let lista: string[] | null = null;
  const inline = (t: string) => escapar(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const fecharParagrafo = () => {
    if (paragrafo.length) saida.push(`<p>${inline(paragrafo.join(' '))}</p>`);
    paragrafo = [];
  };
  const fecharLista = () => {
    if (lista) saida.push(`<ul>${lista.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`);
    lista = null;
  };
  for (const bruta of linhas) {
    const l = bruta.trimEnd();
    if (!l.trim()) {
      fecharParagrafo();
      fecharLista();
      continue;
    }
    const titulo = /^(#{1,3})\s+(.*)$/.exec(l);
    if (titulo) {
      fecharParagrafo();
      fecharLista();
      const n = titulo[1].length;
      saida.push(`<h${n}>${inline(titulo[2])}</h${n}>`);
      continue;
    }
    const item = /^\s*[-*]\s+(.*)$/.exec(l);
    if (item) {
      fecharParagrafo();
      lista = lista ?? [];
      lista.push(item[1]);
      continue;
    }
    if (lista && /^\s{2,}\S/.test(bruta)) {
      lista[lista.length - 1] += ' ' + l.trim();
      continue;
    }
    fecharLista();
    paragrafo.push(l.trim());
  }
  fecharParagrafo();
  fecharLista();
  return saida.join('\n');
}

export function pagina(titulo: string, corpo: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)} — Fortaleza Mov</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.55;
         background: #f6f7f9; color: #1b1f24; }
  @media (prefers-color-scheme: dark) { body { background: #0e1116; color: #e6e9ee; } .cartao { background: #171b22 !important; border-color: #2a303a !important; } input { background:#0e1116; color:#e6e9ee; border-color:#2a303a; } }
  header { background: #1e5bb8; color: #fff; padding: 18px 16px; }
  header strong { font-size: 18px; }
  main { max-width: 760px; margin: 0 auto; padding: 16px; }
  .cartao { background: #fff; border: 1px solid #e3e6ea; border-radius: 12px; padding: 18px; margin: 14px 0; }
  h1 { font-size: 24px; } h2 { font-size: 19px; margin-top: 26px; } h3 { font-size: 16px; }
  label { display:block; font-weight: 600; margin: 12px 0 6px; }
  input, textarea { width: 100%; box-sizing: border-box; font-size: 16px; padding: 12px; border-radius: 10px; border: 1px solid #c9ced6; }
  button { margin-top: 16px; width: 100%; font-size: 16px; font-weight: 700; padding: 14px; border: 0; border-radius: 10px; background: #c62828; color: #fff; }
  .fraco { opacity: .75; font-size: 14px; }
  ol li, ul li { margin: 6px 0; }
</style>
</head>
<body>
<header><strong>Fortaleza Mov</strong></header>
<main>
${corpo}
<p class="fraco">Fortaleza Mov — Goiatuba (GO). Contato: fortalezadigitalsecurity@gmail.com</p>
</main>
</body>
</html>`;
}
