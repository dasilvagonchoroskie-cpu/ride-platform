import { beneficioSchema, codigoDoMotorista, codigoDoQr, lerCodigoDoQr, nomeCurto, parceiroSchema, situacaoDoMotorista, VALIDADE_DO_QR_MS } from './clube.regras';
import { idDoLogo } from './clube.service';

const SEGREDO = 'segredo-de-teste-que-nao-e-o-real';
const ID = '2b7c9a1e-3f4d-4c5b-9a8e-1f2e3d4c5b6a';

describe('Clube de Vantagens - cadastro do parceiro', () => {
  const base = { nome: 'Loja', categoria: 'Outros', endereco: 'Rua A, 100 - Centro', vantagens: 'Condição especial' };

  it('aceita o minimo e completa os campos opcionais', () => {
    const p = parceiroSchema.parse(base);
    expect(p).toMatchObject({ descricao: '', horario: '', condicoes: '', ativo: true });
  });

  it('normaliza telefone e WhatsApp (so numeros, com 55)', () => {
    const p = parceiroSchema.parse({ ...base, telefone: '(85) 3333-4444', whatsapp: '85 99999-8888' });
    expect(p.telefone).toBe('558533334444');
    expect(p.whatsapp).toBe('5585999998888');
    expect(parceiroSchema.parse({ ...base, whatsapp: '' }).whatsapp).toBeNull();
  });

  it('recusa telefone sem DDD, nome vazio e endereco curto', () => {
    expect(parceiroSchema.safeParse({ ...base, whatsapp: '99999' }).success).toBe(false);
    expect(parceiroSchema.safeParse({ ...base, nome: ' ' }).success).toBe(false);
    expect(parceiroSchema.safeParse({ ...base, endereco: 'Rua' }).success).toBe(false);
    expect(parceiroSchema.safeParse({ ...base, latitude: 120 }).success).toBe(false);
  });

  it('beneficio tem condicoes livres (sem percentual fixo)', () => {
    const b = beneficioSchema.parse({ titulo: 'Preço especial na troca de óleo', condicoes: 'Apresentar a identificação digital' });
    expect(b).toMatchObject({ ativo: true, ordem: 0 });
    expect(beneficioSchema.safeParse({ titulo: '' }).success).toBe(false);
  });
});

describe('Clube de Vantagens - carteirinha (QR Code)', () => {
  it('o codigo do QR volta para o mesmo motorista e nao mostra o id', () => {
    const agora = Date.UTC(2026, 10, 5, 12);
    const { codigo, validoAte } = codigoDoQr(ID, SEGREDO, agora);
    expect(codigo).not.toContain(ID);
    expect(validoAte.getTime()).toBe(agora + VALIDADE_DO_QR_MS);
    expect(lerCodigoDoQr(codigo, SEGREDO, agora + 60_000)).toEqual({ driverId: ID, validoAte, vencido: false });
  });

  it('vence depois de 10 minutos', () => {
    const agora = Date.UTC(2026, 10, 5, 12);
    const { codigo } = codigoDoQr(ID, SEGREDO, agora);
    expect(lerCodigoDoQr(codigo, SEGREDO, agora + VALIDADE_DO_QR_MS + 1)?.vencido).toBe(true);
  });

  it('codigo alterado, de outro segredo ou lixo nao vale', () => {
    const { codigo } = codigoDoQr(ID, SEGREDO);
    const [iv, corpo, tag] = codigo.split('.');
    const trocado = corpo[0] === 'A' ? 'B' + corpo.slice(1) : 'A' + corpo.slice(1);
    expect(lerCodigoDoQr(`${iv}.${trocado}.${tag}`, SEGREDO)).toBeNull();
    expect(lerCodigoDoQr(codigo, 'outro-segredo')).toBeNull();
    expect(lerCodigoDoQr('abc', SEGREDO)).toBeNull();
    // Ultima letra trocada so nos bits que o base64 ignora: tambem recusa.
    const ultima = tag[tag.length - 1];
    const vizinha = String.fromCharCode(ultima.charCodeAt(0) ^ 1);
    expect(lerCodigoDoQr(`${iv}.${corpo}.${tag.slice(0, -1)}${vizinha}`, SEGREDO)).toBeNull();
    expect(lerCodigoDoQr('', SEGREDO)).toBeNull();
  });

  it('dois QR do mesmo motorista sao diferentes (nao da para copiar um velho)', () => {
    expect(codigoDoQr(ID, SEGREDO).codigo).not.toBe(codigoDoQr(ID, SEGREDO).codigo);
  });

  it('identificador interno curto e fixo por motorista', () => {
    expect(codigoDoMotorista(ID)).toMatch(/^FM-[0-9A-F]{8}$/);
    expect(codigoDoMotorista(ID)).toBe(codigoDoMotorista(ID));
    expect(codigoDoMotorista(ID)).not.toBe(codigoDoMotorista(ID.replace('a', 'b')));
  });

  it('pagina publica mostra so o primeiro nome e a inicial', () => {
    expect(nomeCurto('Evandro da Silva Gonchoroski')).toBe('Evandro G.');
    expect(nomeCurto('Maria')).toBe('Maria');
    expect(nomeCurto('  ')).toBe('Motorista');
    expect(nomeCurto(null)).toBe('Motorista');
  });

  it('situacao do cadastro', () => {
    expect(situacaoDoMotorista('APPROVED', false).codigo).toBe('ATIVO');
    expect(situacaoDoMotorista('APPROVED', true).codigo).toBe('SUSPENSO');
    expect(situacaoDoMotorista('PENDING', false).codigo).toBe('PENDENTE');
    expect(situacaoDoMotorista('BLOCKED', false).codigo).toBe('SUSPENSO');
  });

  it('logotipo: so apaga arquivo com endereco proprio', () => {
    expect(idDoLogo(`/arquivos/${ID}`)).toBe(ID);
    expect(idDoLogo('https://outro.site/x.png')).toBeNull();
    expect(idDoLogo(null)).toBeNull();
  });
});
