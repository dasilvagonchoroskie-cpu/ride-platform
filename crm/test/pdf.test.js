'use strict';
// Gerador central de PDF: escritor (documento.js) e layout padrão dos relatórios (relatorio.js). Só dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DocumentoPdf, paraWinAnsi, larguraTexto, quebrarLinhas, cortar, lerPng } = require('../src/pdf/documento');
const { gerarRelatorio } = require('../src/pdf/relatorio');
const { textoPorPagina, validar } = require('./util-pdf');

const LOGO = fs.readFileSync(path.join(__dirname, '..', 'public', 'icons', 'logo.png'));

test('texto em WinAnsi: acentos, aspas curvas, euro e travessão ficam; emoji some sem quebrar', () => {
  assert.equal(paraWinAnsi('ação João Â').toString('latin1'), 'ação João Â');
  const b = paraWinAnsi('“x” — R$ 5 € ✅💬 ok');
  assert.ok(b.includes(147) && b.includes(148) && b.includes(151) && b.includes(128), 'aspas, travessão e euro usam os códigos do WinAnsi');
  assert.equal(b.toString('latin1').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' '), 'x R$ 5 ok', 'emoji removidos');
  assert.equal(paraWinAnsi('a\nb\tc').toString('latin1'), 'a b c', 'quebra de linha e tab viram espaço');
});

test('medidas e quebra de linha respeitam a largura', () => {
  assert.ok(larguraTexto('Fortaleza Move', 10, true) > larguraTexto('Fortaleza Move', 10, false), 'negrito é mais largo');
  const linhas = quebrarLinhas('Um texto razoavelmente comprido que precisa quebrar em várias linhas dentro da caixa', 100, 9, false);
  assert.ok(linhas.length > 2);
  for (const l of linhas) assert.ok(larguraTexto(l, 9, false) <= 100.01, `cabe: ${l}`);
  const longa = quebrarLinhas('A'.repeat(200), 80, 9, false);
  assert.ok(longa.length > 1 && longa.every((l) => larguraTexto(l, 9, false) <= 80.01), 'palavra gigante é cortada');
  assert.ok(cortar('Nome muito comprido de estabelecimento', 60, 9, false).endsWith('…'));
  assert.equal(cortar('Curto', 200, 9, false), 'Curto');
});

test('PNG do logo (RGBA) é lido e o PDF resultante é estruturalmente válido, com várias páginas', () => {
  const png = lerPng(LOGO);
  assert.ok(png.largura > 0 && png.alfa, 'logo com transparência');
  assert.throws(() => lerPng(Buffer.from('não é png')), /PNG/);
  const d = new DocumentoPdf({ paisagem: true });
  d.novaPagina();
  d.imagem(d.registrarImagem(LOGO), 20, 20, 40, 40);
  d.texto('Pagina um — ação', 80, 30, { negrito: true });
  d.novaPagina();
  d.texto('Pagina dois', 20, 20);
  const buf = d.gerar({ titulo: 'Teste — “título” com acento' });
  const v = validar(buf);
  assert.deepEqual(v.erros, []);
  assert.equal(v.paginas, 2);
  assert.deepEqual(textoPorPagina(buf).map((t) => t.includes('ação') || t.includes('dois')), [true, true]);
});

function relatorioBase(linhasN, extra = {}) {
  const linhas = [];
  for (let i = 0; i < linhasN; i++) linhas.push({ celulas: [`Pessoa Fictícia ${i}`, '(85) 99999-0000', 'Fortaleza', i % 2 ? 'Contratado' : 'Novo interessado'], tom: i % 2 ? 'verde' : null });
  return gerarRelatorio({
    titulo: 'Relatório de Teste', subtitulo: 'Lista fictícia', paisagem: true, org: { nome: 'Fortaleza Move', slogan: 'Seu caminho, sua viagem, sua segurança.' }, logo: LOGO,
    filtros: [['Período', '01/11/2026 a 11/11/2026'], ['Situação', 'Contratado']],
    blocos: [
      { tipo: 'indicadores', itens: [{ rotulo: 'Total', valor: String(linhasN) }, { rotulo: 'Contratados', valor: '10', tom: 'verde' }] },
      { tipo: 'distribuicoes', titulo: 'Resumo', itens: [{ titulo: 'Por situação', itens: [{ chave: 'Contratado', total: 3 }] }] },
      { tipo: 'tabela', titulo: 'Pessoas', colunas: [{ titulo: 'Nome', peso: 2 }, { titulo: 'Telefone' }, { titulo: 'Cidade' }, { titulo: 'Situação' }], linhas, totais: linhasN ? [`Total: ${linhasN}`, '', '', ''] : null, vazio: 'Nenhum registro encontrado para os filtros aplicados.' }
    ],
    rodape: { gerado_por: 'Evandro', gerado_em: new Date('2026-11-11T22:30:00Z') }, ...extra
  });
}

test('relatório: identidade, filtros, totais, rodapé com página X de N e continuação do cabeçalho da tabela', () => {
  const buf = relatorioBase(80);
  assert.deepEqual(validar(buf).erros, []);
  const pgs = textoPorPagina(buf);
  assert.ok(pgs.length >= 3, `várias páginas (${pgs.length})`);
  assert.ok(pgs[0].includes('Fortaleza Move') && pgs[0].includes('Relatório de Teste'));
  assert.ok(pgs[0].includes('FILTROS APLICADOS') && pgs[0].includes('Período: 01/11/2026 a 11/11/2026'));
  assert.ok(pgs[0].includes('Emitido em 11/11/2026 às 19:30'), 'data no fuso de Fortaleza (UTC-3)');
  pgs.forEach((t, i) => assert.ok(t.includes(`Página ${i + 1} de ${pgs.length}`), `rodapé da página ${i + 1}`));
  assert.ok(pgs[1].includes('(continuação)') && pgs[1].includes('Situação'), 'tabela repete o cabeçalho ao mudar de página');
  assert.ok(pgs[pgs.length - 1].includes('Total: 80'), 'linha de totais');
  assert.ok(pgs[0].includes('Gerado em 11/11/2026 às 19:30 por Evandro'));
  assert.ok(!pgs.join('').includes('Nenhum registro encontrado'), 'com registros, não aparece o aviso de vazio');
});

test('relatório sem registros diz isso claramente e mantém os filtros e o cabeçalho', () => {
  const buf = relatorioBase(0);
  assert.deepEqual(validar(buf).erros, []);
  const pgs = textoPorPagina(buf);
  assert.equal(pgs.length, 1);
  assert.ok(pgs[0].includes('Nenhum registro encontrado para os filtros aplicados.'));
  assert.ok(pgs[0].includes('Situação: Contratado'), 'os filtros continuam impressos');
});

test('texto malicioso ou gigante não quebra o PDF (parênteses, barras, emoji, 5000 caracteres)', () => {
  const lixo = `) Tj ET /Evil (${'x'.repeat(5000)}) \\ \u0000 ✅ <script>`;
  const buf = gerarRelatorio({
    titulo: lixo, subtitulo: lixo, org: { nome: lixo }, filtros: [['Busca', lixo]],
    blocos: [{ tipo: 'tabela', titulo: lixo, colunas: [{ titulo: 'A' }, { titulo: 'B' }], linhas: [{ celulas: [lixo, lixo] }] }, { tipo: 'nota', texto: lixo }, { tipo: 'pares', itens: [[lixo, lixo]] }]
  });
  assert.deepEqual(validar(buf).erros, []);
});
