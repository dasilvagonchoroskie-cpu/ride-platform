/**
 * Situacao de cada carro (Evandro, 09/10/2026: "o motorista comprou mais um
 * carro, ou trocou de carro, para ele atualizar os dados — isso nao pode
 * deixar a desejar").
 *
 * - EM_USO: o carro com que ele trabalha agora (vehicles.is_active). Um so.
 * - GUARDADO: aprovado, mas nao e o de agora (ele troca quando quiser).
 * - PENDENTE: carro novo de motorista ja aprovado — a Central confere a
 *   foto e o documento (CRLV) antes de ele poder usar.
 * - RECUSADO: a Central recusou (motivo aparece para o motorista).
 * - REMOVIDO: o motorista tirou o carro, mas ele tem corridas no historico
 *   (fica guardado no banco, escondido das listas).
 *
 * Guardado na tabela settings (chave "veiculos"), sem mudar o banco: um
 * mapa id do carro -> situacao, fotos e data. Carro fora do mapa = aprovado.
 */
export type SituacaoGuardada = 'PENDENTE' | 'RECUSADO' | 'REMOVIDO';

export interface FichaDoCarro {
  situacao?: SituacaoGuardada;
  motivo?: string | null;
  /** Foto do carro de frente, com a placa (/arquivos/...). */
  foto?: string | null;
  /** Foto do CRLV deste carro (/arquivos/...). */
  crlv?: string | null;
  /** Quando entrou na situacao atual (ISO). */
  em?: string;
}

export type MapaDeCarros = Record<string, FichaDoCarro>;

export const CHAVE_VEICULOS = 'veiculos';

export function lerMapaDeCarros(valor: unknown): MapaDeCarros {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
  const mapa: MapaDeCarros = {};
  for (const [id, v] of Object.entries(valor as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const f = v as Record<string, unknown>;
    const situacao = f.situacao === 'PENDENTE' || f.situacao === 'RECUSADO' || f.situacao === 'REMOVIDO' ? f.situacao : undefined;
    mapa[id] = {
      ...(situacao ? { situacao } : {}),
      motivo: typeof f.motivo === 'string' ? f.motivo : null,
      foto: typeof f.foto === 'string' ? f.foto : null,
      crlv: typeof f.crlv === 'string' ? f.crlv : null,
      ...(typeof f.em === 'string' ? { em: f.em } : {}),
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
