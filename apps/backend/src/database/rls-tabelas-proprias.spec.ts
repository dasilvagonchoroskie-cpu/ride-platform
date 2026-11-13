import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Tabelas que o proprio servidor cria na partida (Comercio, Clube, Entregas...) nascem
 * DEPOIS do ajuste de RLS do PrismaService. Cada uma precisa ligar o RLS na criacao,
 * senao fica aberta na API publica do Supabase ate a proxima partida (auditoria 13/11/2026).
 */
function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho);
    return caminho.endsWith('.ts') && !caminho.endsWith('.spec.ts') ? [caminho] : [];
  });
}

describe('RLS nas tabelas criadas pelo servidor', () => {
  const raiz = join(__dirname, '..');
  const criadas: Array<{ arquivo: string; tabela: string; texto: string }> = [];
  for (const arquivo of arquivosTs(raiz)) {
    const texto = readFileSync(arquivo, 'utf8');
    for (const m of texto.matchAll(/CREATE TABLE IF NOT EXISTS\s+"([A-Za-z0-9_]+)"/g)) {
      criadas.push({ arquivo: arquivo.replace(raiz, 'src'), tabela: m[1], texto });
    }
  }

  it('encontra as tabelas criadas na partida (comercios, comercio_pedidos, entregas, clube)', () => {
    const nomes = criadas.map((c) => c.tabela);
    for (const t of ['comercios', 'comercio_pedidos', 'entregas', 'clube_parceiros', 'clube_beneficios']) expect(nomes).toContain(t);
  });

  it.each(criadas.map((c) => [c.tabela, c.arquivo, c.texto]))('%s (%s) liga o RLS ao ser criada', (tabela, _arquivo, texto) => {
    expect(texto).toContain(`ALTER TABLE "${tabela}" ENABLE ROW LEVEL SECURITY`);
  });
});
