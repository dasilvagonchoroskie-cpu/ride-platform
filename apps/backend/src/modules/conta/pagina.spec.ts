import { escapar, markdownParaHtml, pagina } from './pagina';

describe('paginas publicas', () => {
  it('converte o markdown da politica em HTML', () => {
    const html = markdownParaHtml('# Titulo\n\nTexto **forte** aqui\ncontinua.\n\n## Parte\n\n- item um\n  continua\n- item <dois>\n');
    expect(html).toContain('<h1>Titulo</h1>');
    expect(html).toContain('<p>Texto <strong>forte</strong> aqui continua.</p>');
    expect(html).toContain('<h2>Parte</h2>');
    expect(html).toContain('<li>item um continua</li>');
    expect(html).toContain('<li>item &lt;dois&gt;</li>');
  });

  it('escapa o que vem de fora e monta a pagina', () => {
    expect(escapar('<script>"x"</script>')).toBe('&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
    const p = pagina('Excluir conta', '<h1>Oi</h1>');
    expect(p).toContain('<!doctype html>');
    expect(p).toContain('<title>Excluir conta — Fortaleza Mov</title>');
  });
});
