import { randomUUID } from 'crypto';

/**
 * Configuracao da operacao guardada na tabela `settings`.
 *
 * Nada disto fica fixo no codigo: o dono edita pela Central e os
 * aplicativos leem do servidor.
 */
export const CHAVE_CIDADES = 'operacao.cidades';
export const CHAVE_AVISOS = 'operacao.avisos';
const CHAVE_CONTATO = 'central.contato';

/** Mesmo padrao usado pela carteira do motorista enquanto nao ha outro configurado. */
const WHATSAPP_PADRAO = '5564996472794';

export interface AvisoPassageiro {
  id: string;
  titulo: string;
  texto: string;
  criadoEm: string;
}

/** O minimo que estes helpers precisam do Prisma (facilita o teste). */
export interface SettingsDb {
  setting: {
    findUnique(args: { where: { key: string } }): Promise<{ value: unknown } | null>;
    upsert(args: {
      where: { key: string };
      update: { value: never; updatedBy?: string };
      create: { key: string; value: never; updatedBy?: string; description?: string };
    }): Promise<unknown>;
  };
}

/** "goiatuba - go" e "Goiatuba - GO" sao a mesma cidade. */
export function chaveCidade(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Limpa a lista: tira espacos, vazios e repetidos, mantendo a ordem do dono. */
export function limparCidades(lista: string[]): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const bruto of lista) {
    const nome = bruto.replace(/\s+/g, ' ').trim();
    if (!nome) continue;
    const k = chaveCidade(nome);
    if (vistas.has(k)) continue;
    vistas.add(k);
    saida.push(nome);
  }
  return saida;
}

export async function lerCidades(db: SettingsDb): Promise<string[]> {
  const s = await db.setting.findUnique({ where: { key: CHAVE_CIDADES } });
  const v = s?.value;
  return Array.isArray(v) ? limparCidades(v.filter((x): x is string => typeof x === 'string')) : [];
}

/** Devolve o nome oficial da cidade se ela estiver na lista; senao, null. */
export async function cidadeAtendida(db: SettingsDb, nome: string): Promise<string | null> {
  const lista = await lerCidades(db);
  const k = chaveCidade(nome);
  return lista.find((c) => chaveCidade(c) === k) ?? null;
}

export async function gravarCidades(db: SettingsDb, lista: string[], adminId: string): Promise<string[]> {
  const limpa = limparCidades(lista);
  await db.setting.upsert({
    where: { key: CHAVE_CIDADES },
    update: { value: limpa as never, updatedBy: adminId },
    create: {
      key: CHAVE_CIDADES,
      value: limpa as never,
      updatedBy: adminId,
      description: 'Cidades atendidas (lista mostrada no cadastro do passageiro)',
    },
  });
  return limpa;
}

export async function lerAvisos(db: SettingsDb): Promise<AvisoPassageiro[]> {
  const s = await db.setting.findUnique({ where: { key: CHAVE_AVISOS } });
  const v = s?.value;
  if (!Array.isArray(v)) return [];
  return v
    .filter((a): a is AvisoPassageiro => {
      const x = a as Partial<AvisoPassageiro> | null;
      return !!x && typeof x.id === 'string' && typeof x.titulo === 'string' && typeof x.texto === 'string';
    })
    .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
}

async function gravarAvisos(db: SettingsDb, lista: AvisoPassageiro[], adminId: string): Promise<void> {
  await db.setting.upsert({
    where: { key: CHAVE_AVISOS },
    update: { value: lista as never, updatedBy: adminId },
    create: {
      key: CHAVE_AVISOS,
      value: lista as never,
      updatedBy: adminId,
      description: 'Avisos da Central para os passageiros (sino do aplicativo)',
    },
  });
}

/** Maximo de avisos guardados: os mais antigos saem quando passa disso. */
export const MAX_AVISOS = 30;

export async function publicarAviso(
  db: SettingsDb,
  titulo: string,
  texto: string,
  adminId: string,
  agora = new Date(),
): Promise<AvisoPassageiro[]> {
  const novo: AvisoPassageiro = {
    id: randomUUID(),
    titulo: titulo.trim(),
    texto: texto.trim(),
    criadoEm: agora.toISOString(),
  };
  const lista = [novo, ...(await lerAvisos(db))].slice(0, MAX_AVISOS);
  await gravarAvisos(db, lista, adminId);
  return lista;
}

export async function apagarAviso(db: SettingsDb, id: string, adminId: string): Promise<AvisoPassageiro[]> {
  const lista = (await lerAvisos(db)).filter((a) => a.id !== id);
  await gravarAvisos(db, lista, adminId);
  return lista;
}

export async function whatsappDaCentral(db: SettingsDb): Promise<string | null> {
  const s = await db.setting.findUnique({ where: { key: CHAVE_CONTATO } });
  const v = (s?.value ?? {}) as { whatsapp?: string | null };
  return v.whatsapp !== undefined ? v.whatsapp : WHATSAPP_PADRAO;
}
