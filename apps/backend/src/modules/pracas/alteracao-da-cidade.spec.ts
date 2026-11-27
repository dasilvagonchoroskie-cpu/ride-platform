import { alterarPracaSchema, pracaSchema } from './pracas.controller';
import { lerListaDePracas } from './pracas.store';

const nova = { nome: 'Teutonia', uf: 'rs', latitude: -29.44, longitude: -51.8 };

describe('Cadastro e alteracao de cidade', () => {
  it('cidade nova ganha os valores padrao, com o codigo de embarque ligado', () => {
    expect(pracaSchema.parse(nova)).toMatchObject({ raioKm: 60, ativa: true, fonteBusca: 'tomtom', exigirCodigoEmbarque: true, uf: 'RS' });
  });

  it('alteracao leva so o que veio: nada volta ao padrao sozinho', () => {
    expect(alterarPracaSchema.parse({})).toEqual({});
    expect(alterarPracaSchema.parse({ exigirCodigoEmbarque: false })).toEqual({ exigirCodigoEmbarque: false });
    expect(alterarPracaSchema.parse({ ativa: false })).toEqual({ ativa: false });
  });

  it('a chave so aceita sim ou nao', () => {
    expect(alterarPracaSchema.safeParse({ exigirCodigoEmbarque: 'nao' }).success).toBe(false);
    expect(alterarPracaSchema.safeParse({ exigirCodigoEmbarque: null }).success).toBe(false);
  });

  it('a chave desligada continua desligada depois de gravar e ler', () => {
    const [p] = lerListaDePracas([{ ...nova, id: 't', raioKm: 25, ativa: true, exigirCodigoEmbarque: false }]);
    expect(p.exigirCodigoEmbarque).toBe(false);
    expect(lerListaDePracas([{ ...nova, id: 't' }])[0].exigirCodigoEmbarque).toBe(true);
  });
});
