import { APARENCIA_PADRAO, aparenciaDoApp, gravarAparencia, lerAparenciaDe } from './aparencia';

describe('Aparencia do app (etapa 6)', () => {
  it('valor estranho volta ao padrao', () => {
    expect(lerAparenciaDe(null)).toEqual(APARENCIA_PADRAO);
    expect(lerAparenciaDe({ nome: 'x', cor: 'azul', logoId: '../etc' })).toEqual(APARENCIA_PADRAO);
  });

  it('faixa so liga com texto; cor em maiusculas; nome cortado', () => {
    const a = lerAparenciaDe({ nome: '  Goiatuba Mov  ', cor: '#12ab34', bannerAtivo: true, bannerTexto: '  ' });
    expect(a.nome).toBe('Goiatuba Mov');
    expect(a.cor).toBe('#12AB34');
    expect(a.bannerAtivo).toBe(false);
    expect(lerAparenciaDe({ bannerAtivo: true, bannerTexto: 'Promo' }).bannerAtivo).toBe(true);
    expect(lerAparenciaDe({ nome: 'N'.repeat(80) }).nome.length).toBe(30);
  });

  it('o app recebe logo com versao e faixa so quando ligada', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const app = aparenciaDoApp(lerAparenciaDe({ logoId: id, bannerAtivo: true, bannerTexto: 'Corrida 10% off' }));
    expect(app.logoUrl).toBe('/app/logo?v=0f8fad5b');
    expect(app.banner).toEqual({ texto: 'Corrida 10% off' });
    expect(aparenciaDoApp(APARENCIA_PADRAO)).toEqual({ definida: false, nome: 'Fortaleza Mov', cor: '#1E5BB8', banner: null, logoUrl: null });
    expect(aparenciaDoApp(lerAparenciaDe({ atualizadoEm: '2026-10-29T18:00:00Z' })).definida).toBe(true);
  });

  it('gravar junta com o que ja tinha e marca quem mudou', async () => {
    let guardado: unknown = { nome: 'Antigo', cor: '#000000', logoId: '0f8fad5b-d9cb-469f-a165-70867728950e' };
    const upsert = jest.fn(async (q: { update: { value: unknown } }) => {
      guardado = q.update.value;
      return {};
    });
    const db = { setting: { findUnique: jest.fn(async () => ({ value: guardado })), upsert } } as never;
    const a = await gravarAparencia(db, { cor: '#FF0000' }, 'admin-1');
    expect(a.nome).toBe('Antigo');
    expect(a.cor).toBe('#FF0000');
    expect(a.logoId).toBe('0f8fad5b-d9cb-469f-a165-70867728950e');
    expect(a.atualizadoEm).not.toBeNull();
    expect((upsert.mock.calls[0][0] as unknown as { update: { updatedBy: string } }).update.updatedBy).toBe('admin-1');
  });
});
