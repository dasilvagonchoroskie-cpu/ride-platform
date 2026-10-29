import { Prisma } from '@prisma/client';

/**
 * Aparencia do app do passageiro pela Central (etapa 6, Evandro 29/10/2026):
 * nome que aparece no app, cor do destaque, logo e uma faixa de aviso
 * (banner) no Inicio. Guardado em settings (chave "aparencia"): sem mudar o
 * banco. O logo fica na tabela arquivos (tipo LOGO) e sai publico em
 * GET /app/logo (o app mostra antes do login).
 */
export interface Aparencia {
  nome: string;
  /** Cor do destaque, #RRGGBB. */
  cor: string;
  bannerAtivo: boolean;
  bannerTexto: string;
  logoId: string | null;
  atualizadoEm: string | null;
}

export const CHAVE_APARENCIA = 'aparencia';

export const APARENCIA_PADRAO: Aparencia = {
  nome: 'Fortaleza Move',
  // Azul da marca dos apps (AppColors.brand).
  cor: '#1E5BB8',
  bannerAtivo: false,
  bannerTexto: '',
  logoId: null,
  atualizadoEm: null,
};

type Db = Pick<Prisma.TransactionClient, 'setting'>;

export function lerAparenciaDe(valor: unknown): Aparencia {
  const v = valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
  const nome = typeof v.nome === 'string' && v.nome.trim().length >= 2 ? v.nome.trim().slice(0, 30) : APARENCIA_PADRAO.nome;
  const cor = typeof v.cor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v.cor) ? v.cor.toUpperCase() : APARENCIA_PADRAO.cor;
  return {
    nome,
    cor,
    bannerAtivo: v.bannerAtivo === true && typeof v.bannerTexto === 'string' && v.bannerTexto.trim().length > 0,
    bannerTexto: typeof v.bannerTexto === 'string' ? v.bannerTexto.trim().slice(0, 140) : '',
    logoId: typeof v.logoId === 'string' && /^[0-9a-f-]{36}$/i.test(v.logoId) ? v.logoId : null,
    atualizadoEm: typeof v.atualizadoEm === 'string' ? v.atualizadoEm : null,
  };
}

export async function lerAparencia(db: Db): Promise<Aparencia> {
  const s = await db.setting.findUnique({ where: { key: CHAVE_APARENCIA } });
  return lerAparenciaDe(s?.value);
}

export async function gravarAparencia(db: Db, nova: Partial<Aparencia>, adminId: string): Promise<Aparencia> {
  const atual = await lerAparencia(db);
  const valor = lerAparenciaDe({ ...atual, ...nova, atualizadoEm: new Date().toISOString() });
  await db.setting.upsert({
    where: { key: CHAVE_APARENCIA },
    update: { value: valor as never, updatedBy: adminId },
    create: { key: CHAVE_APARENCIA, value: valor as never, updatedBy: adminId, description: 'Aparencia do app do passageiro (nome, cor, logo, faixa)' },
  });
  return valor;
}

/** O que vai no /app/config publico. */
export function aparenciaDoApp(a: Aparencia) {
  return {
    // false: a Central ainda nao mexeu; o app fica com o nome e a cor da
    // propria montagem (app de outro operador).
    definida: a.atualizadoEm !== null,
    nome: a.nome,
    cor: a.cor,
    banner: a.bannerAtivo ? { texto: a.bannerTexto } : null,
    // A versao no endereco faz o celular baixar o logo novo quando ele muda.
    logoUrl: a.logoId ? `/app/logo?v=${a.logoId.slice(0, 8)}` : null,
  };
}
