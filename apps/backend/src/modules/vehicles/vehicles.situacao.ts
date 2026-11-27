/**
 * Situacao de cada carro (Evandro, 09/10/2026: "o motorista comprou mais um
 * carro, ou trocou de carro, para ele atualizar os dados — isso nao pode
 * deixar a desejar").
 *
 * - EM_USO: o carro com que ele trabalha agora (vehicles.is_active). Um so.
 * - GUARDADO: aprovado, mas nao e o de agora (ele troca quando quiser).
 * - PENDENTE: carro novo de motorista ja aprovado — a Central confere a
 *   foto e o documento (CRLV) antes de ele poder usar. Tambem volta para
 *   ca o carro liberado que teve marca, modelo, ano ou cor mudados pelo
 *   motorista (Evandro, 27/11/2026).
 * - RECUSADO: a Central recusou (motivo aparece para o motorista).
 * - SUSPENSO: a Central suspendeu o carro (nao roda ate ser reativado; o
 *   motivo aparece para o motorista). A suspensao e do VEICULO: nao mexe na
 *   autorizacao da cidade para a categoria nem para entregas.
 * - REMOVIDO: o motorista tirou o carro, mas ele tem corridas no historico
 *   (fica guardado no banco, escondido das listas).
 *
 * Guardado na tabela settings (chave "veiculos"), sem mudar o banco: um
 * mapa id do carro -> situacao, fotos e data. Carro fora do mapa = aprovado.
 */
export type SituacaoGuardada = 'PENDENTE' | 'RECUSADO' | 'SUSPENSO' | 'REMOVIDO';

export interface DadosDoCarro {
  brand: string;
  model: string;
  year: number;
  color: string;
}

/** Mudanca de dados feita pelo motorista num carro que ja estava liberado. */
export interface AlteracaoDoCarro {
  /** Como o carro estava quando a Central o liberou. */
  antes: DadosDoCarro;
  /** Quando o motorista mudou (ISO). */
  em: string;
  /** Era o carro em uso: aprovado, volta a ser (se ele nao escolheu outro). */
  eraEmUso: boolean;
}

const normal = (t: string) => t.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

/** Mudou de verdade? Maiuscula/minuscula e espaco sobrando nao contam. */
export function dadosMudaram(a: DadosDoCarro, b: DadosDoCarro): boolean {
  return normal(a.brand) !== normal(b.brand) || normal(a.model) !== normal(b.model) || a.year !== b.year || normal(a.color) !== normal(b.color);
}

function lerAlteracao(v: unknown): AlteracaoDoCarro | null {
  if (!v || typeof v !== 'object') return null;
  const a = v as Record<string, unknown>;
  const d = a.antes as Record<string, unknown> | undefined;
  if (!d || typeof d.brand !== 'string' || typeof d.model !== 'string' || typeof d.year !== 'number' || typeof d.color !== 'string') return null;
  return {
    antes: { brand: d.brand, model: d.model, year: d.year, color: d.color },
    em: typeof a.em === 'string' ? a.em : '',
    eraEmUso: a.eraEmUso === true,
  };
}

/**
 * Quem ja foi liberado alguma vez (aprovado agora, ou suspenso/bloqueado
 * depois de aprovado): carro novo ou dado mudado passa pela Central.
 */
export function jaFoiAprovado(d: { status: string; approvedAt?: Date | null }): boolean {
  return d.status === 'APPROVED' || !!d.approvedAt;
}

export interface FichaDoCarro {
  situacao?: SituacaoGuardada;
  motivo?: string | null;
  /** Foto do carro de frente, com a placa (/arquivos/...). */
  foto?: string | null;
  /** Foto do CRLV deste carro (/arquivos/...). */
  crlv?: string | null;
  /** Quando entrou na situacao atual (ISO). */
  em?: string;
  /**
   * Categoria que o motorista pediu (29/10/2026) e a Central ainda nao
   * conferiu. A categoria que vale e a do carro (vehicles.category).
   */
  categoriaPedida?: string | null;
  categoriaPedidaEm?: string | null;
  /** Motivo da ultima recusa de categoria (o motorista ve). */
  categoriaMotivo?: string | null;
  /**
   * Validade do CRLV (AAAA-MM-DD), anotada pela Central (13/11/2026). Informativa: o
   * sistema mostra se esta vencida, mas nao bloqueia o carro por conta propria.
   */
  crlvValidade?: string;
  /** Presente enquanto a Central nao confere uma mudanca de dados. */
  alteracao?: AlteracaoDoCarro | null;
  /** Suspenso sem nunca ter sido liberado: ao reativar volta para a conferencia. */
  voltarParaConferencia?: boolean;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Dia de hoje em Brasilia (AAAA-MM-DD). */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** Data valida no formato AAAA-MM-DD (e que existe no calendario)? */
export function diaValido(v: unknown): v is string {
  if (typeof v !== 'string' || !DIA.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Vencido = a validade e anterior a hoje (no dia da validade ainda vale). Sem data: null. */
export function vencido(validade: string | null | undefined, agora: Date = new Date()): boolean | null {
  if (!validade || !diaValido(validade)) return null;
  return validade < hojeEmBrasilia(agora);
}

export type MapaDeCarros = Record<string, FichaDoCarro>;

export const CHAVE_VEICULOS = 'veiculos';

export function lerMapaDeCarros(valor: unknown): MapaDeCarros {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
  const mapa: MapaDeCarros = {};
  for (const [id, v] of Object.entries(valor as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const f = v as Record<string, unknown>;
    const situacao =
      f.situacao === 'PENDENTE' || f.situacao === 'RECUSADO' || f.situacao === 'SUSPENSO' || f.situacao === 'REMOVIDO' ? f.situacao : undefined;
    const alteracao = lerAlteracao(f.alteracao);
    mapa[id] = {
      ...(situacao ? { situacao } : {}),
      ...(alteracao ? { alteracao } : {}),
      ...(f.voltarParaConferencia === true ? { voltarParaConferencia: true } : {}),
      motivo: typeof f.motivo === 'string' ? f.motivo : null,
      foto: typeof f.foto === 'string' ? f.foto : null,
      crlv: typeof f.crlv === 'string' ? f.crlv : null,
      ...(typeof f.em === 'string' ? { em: f.em } : {}),
      ...(typeof f.categoriaPedida === 'string' && f.categoriaPedida ? { categoriaPedida: f.categoriaPedida } : {}),
      ...(typeof f.categoriaPedidaEm === 'string' ? { categoriaPedidaEm: f.categoriaPedidaEm } : {}),
      ...(typeof f.categoriaMotivo === 'string' && f.categoriaMotivo ? { categoriaMotivo: f.categoriaMotivo } : {}),
      ...(diaValido(f.crlvValidade) ? { crlvValidade: f.crlvValidade } : {}),
    };
  }
  return mapa;
}

export type SituacaoDoCarro = 'EM_USO' | 'GUARDADO' | SituacaoGuardada;

export function situacaoDoCarro(carro: { id: string; isActive: boolean }, mapa: MapaDeCarros): SituacaoDoCarro {
  const s = mapa[carro.id]?.situacao;
  if (s) return s;
  return carro.isActive ? 'EM_USO' : 'GUARDADO';
}

/** O carro pode ser usado para trabalhar (aprovado e nao removido)? */
export function carroLiberado(id: string, mapa: MapaDeCarros): boolean {
  return !mapa[id]?.situacao;
}
