import { DIAS_NA_CAIXA } from '../../integrations/notifications/caixa-de-entrada.service';
import { markdownParaHtml } from '../conta/pagina';
import { PRIVACY_MD } from './legal-content';

/** A politica e um texto publico: o que ela promete tem de continuar de pe. */
describe('Politica de Privacidade', () => {
  it('tem os temas pedidos pela LGPD e pela loja', () => {
    for (const titulo of [
      'responsável pelos seus dados',
      'Quais dados tratamos',
      'base legal',
      'Permissões do celular',
      'compartilhados',
      'Transferência internacional',
      'Cookies e dados de navegação',
      'Segurança',
      'quanto tempo guardamos',
      'excluir a conta',
      'Seus direitos',
      'Menores de idade',
    ]) {
      expect(PRIVACY_MD).toMatch(new RegExp(`^## \\d+\\. .*${titulo}`, 'm'));
    }
  });

  it('identifica o responsavel, o canal e os dois aplicativos', () => {
    expect(PRIVACY_MD).toContain('Evandro da Silva Gonchoroski');
    expect(PRIVACY_MD).toContain('fortalezamovegtba@gmail.com');
    expect(PRIVACY_MD).toContain('**Fortaleza Move** (passageiro)');
    expect(PRIVACY_MD).toContain('**Fortaleza Move Motorista**');
    expect(PRIVACY_MD).toContain('Ela não trata do aplicativo Fortaleza Move Comércio');
  });

  it('o prazo dos avisos e o mesmo que o sistema aplica', () => {
    expect(PRIVACY_MD).toContain(`apagados automaticamente após ${DIAS_NA_CAIXA} dias`);
  });

  it('nao promete o que o sistema nao faz', () => {
    expect(PRIVACY_MD).not.toMatch(/até 30 dias|até 5 anos|CNPJ em registro/);
    expect(PRIVACY_MD).toContain('não há exclusão automática por prazo');
    expect(PRIVACY_MD).toContain('não envia mensagem automática');
  });

  it('vira pagina de internet sem sobrar marcacao', () => {
    const html = markdownParaHtml(PRIVACY_MD);
    expect(html).not.toContain('**');
    expect(html).not.toContain('${');
    expect(html).not.toContain('undefined');
    expect(html.match(/<h2>/g)?.length).toBe(13);
    // O aplicativo so desenha "#" e "##".
    expect(PRIVACY_MD).not.toMatch(/^###/m);
  });
});
