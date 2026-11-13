/**
 * Termos de Uso e Condições Comerciais do aplicativo Fortaleza Move Comércio.
 *
 * AVISO PARA A EQUIPE (13/11/2026): este texto é uma MINUTA TÉCNICA para
 * revisão jurídica. NÃO foi aprovada por advogado e NÃO deve ser tratada como
 * texto jurídico definitivo. Antes do lançamento, um advogado precisa validar
 * (ver "Pontos para validação externa" no fim do arquivo e em docs/COMERCIO.md).
 *
 * Regras que o texto respeita (e que o código garante):
 * - não há carteira, crédito, mensalidade, assinatura nem cobrança automática;
 * - o pagamento é o da plataforma: dinheiro direto ao motorista;
 * - tarifas e comissões são as oficiais da plataforma e não são alteradas aqui.
 *
 * A versão abaixo é gravada junto do cadastro da loja (comercios.termos_versao).
 * Mudança relevante no texto exige subir a versão.
 */
export const COMERCIO_TERMS_VERSION = '0.1.0-minuta';

const OPERADORA = 'Fortaleza Digital Security (Goiatuba – GO, CNPJ em registro)';
const EMAIL_CONTATO = 'fortalezamovegtba@gmail.com';

export const COMERCIO_TERMS_MD = `# Termos de Uso e Condições Comerciais — Fortaleza Move Comércio

Versão ${COMERCIO_TERMS_VERSION}

> **Minuta técnica em revisão.** Este texto ainda não foi aprovado por advogado. Ele descreve como o aplicativo funciona hoje e pode mudar depois da revisão jurídica. Quando mudar, você será avisado e precisará aceitar a nova versão.

## 1. Quem somos e o que é este aplicativo

O Fortaleza Move Comércio é um aplicativo da Fortaleza Move, desenvolvido e operado por ${OPERADORA}. Ele permite que um **estabelecimento comercial** peça que um **motorista parceiro** busque uma encomenda dele e a leve até quem vai receber. O aplicativo **não é um marketplace**: não vende produtos, não tem cardápio nem catálogo e não recebe pedidos de clientes finais da loja.

A Fortaleza Move é uma plataforma de tecnologia que aproxima as partes. **Não presta diretamente o serviço de transporte nem de entrega**: quem executa a entrega é o motorista parceiro.

## 2. Identificação e responsabilidades da loja

Ao se cadastrar, a loja declara que:

- os dados informados (nome fantasia, CNPJ, responsável, telefone, e-mail e endereço) são **verdadeiros e atuais**, e que o responsável tem poderes para cadastrar o estabelecimento;
- o e-mail informado é dela e foi confirmado por ela;
- é a única responsável pelo que envia: a encomenda deve ser **lícita**, estar **bem embalada** e ter descrição **fiel**. É **proibido** enviar itens ilegais, perigosos, inflamáveis, armas, drogas, animais vivos, valores em dinheiro ou itens que o motorista não possa transportar com segurança;
- é responsável por **informar corretamente** o endereço de coleta, o endereço de entrega, o nome e o telefone de quem recebe, e por **repassar a quem recebe o código de entrega**;
- cuida da guarda e do uso da própria conta e responde pelo que for feito com ela. Quem usa o acesso da loja age em nome dela.

## 3. Aprovação e disponibilidade

- O cadastro nasce **aguardando aprovação**. Só a Central da Fortaleza Move aprova, rejeita, suspende ou reativa uma loja; **não existe aprovação automática**.
- A Central pode **rejeitar ou suspender** um cadastro, informando o motivo, por exemplo por dados incorretos, uso indevido ou descumprimento destes termos.
- Mesmo com a loja aprovada, o pedido de entrega depende de a Fortaleza Move **ter liberado as entregas do Comércio** e de a entrega e o tipo de veículo estarem **liberados na cidade da coleta**. Isso pode mudar ou ser suspenso a qualquer momento, e **não há garantia** de que uma entrega esteja disponível em todo lugar e horário.
- **Não há garantia de que um motorista aceite o pedido.** Se nenhum aceitar, o pedido termina como "Nenhum motorista aceitou" e nada é cobrado.

## 4. Responsabilidades da entrega

- O motorista parceiro é responsável por buscar a encomenda, conduzi-la com cuidado e entregá-la a quem recebe, confirmando com o **código de entrega**.
- O motorista recebe apenas os dados **necessários** para a entrega: identificação da loja, endereço de coleta, telefone da loja, endereço de entrega, quem recebe, descrição e observações.
- A Fortaleza Move **não responde** por atraso causado por trânsito, clima, falta de motorista, informação errada passada pela loja ou impossibilidade de contato com quem recebe, nem por **danos, extravio ou conteúdo** da encomenda, salvo quando a lei determinar o contrário. **Pontos para validação jurídica**: limite de responsabilidade, seguro e regras de avaria.
- Se a entrega falhar (por exemplo, ninguém recebe), a situação aparece no acompanhamento e a loja continua responsável pelo pedido, inclusive pelo valor cobrado quando o motorista já tiver coletado.

## 5. Preço, pagamento e gastos

- O preço é o **oficial da plataforma**, mostrado **antes de confirmar** o pedido. O valor final é o apurado pela plataforma ao fim da entrega.
- O pagamento é feito **em dinheiro, diretamente ao motorista**, como nas demais entregas da Fortaleza Move.
- **Não existe carteira da loja, crédito, saldo, assinatura, mensalidade, cobrança automática nem cartão neste aplicativo.** A tela "Gastos" apenas soma as entregas concluídas.
- As tarifas e comissões da plataforma não são alteradas por estes termos. **Ponto para decisão do proprietário**: outras formas de pagamento.

## 6. Cancelamento

- A loja pode cancelar o pedido pelo aplicativo enquanto ele estiver aberto. Valem as **regras de cancelamento da plataforma**: se o motorista já estiver a caminho ou já tiver coletado, **pode haver cobrança**.
- A plataforma pode cancelar um pedido por segurança, falta de motorista ou indisponibilidade do serviço.
- Cancelar não apaga o histórico: o pedido continua registrado no histórico da loja.

## 7. Dados pessoais (LGPD)

- Tratamos os dados da loja e do responsável (nome, CNPJ, CPF quando informado, telefone, e-mail e endereço) para **cadastro, aprovação, operação das entregas, segurança, auditoria e suporte**.
- Dados de quem recebe (nome e telefone) são usados **somente** para a entrega e são compartilhados apenas com o motorista que a realiza. A loja declara ter **base legal** para informá-los.
- **Cada loja enxerga somente os próprios pedidos e dados.** O CPF aparece mascarado no aplicativo e na Central.
- O acompanhamento mostra a posição do motorista **somente durante uma entrega em andamento**, e nunca o telefone do motorista.
- Os dados do tratamento são tratados conforme a **Política de Privacidade** da Fortaleza Move. Ao excluir a conta, o cadastro é removido; se houver entregas no histórico, o cadastro fica sem dados pessoais e suspenso, para preservar o histórico das entregas e da plataforma.
- Pedidos sobre seus dados: ${EMAIL_CONTATO}.

## 8. Limitações da plataforma

- O serviço é fornecido "como está" e pode ficar **indisponível** por manutenção, falha de internet ou de terceiros (mapas, e-mail, notificações).
- A **posição do motorista no mapa** só aparece quando o aparelho dele está enviando localização; pode estar atrasada, e o aplicativo avisa quando estiver. Os **avisos** (sino) aparecem quando o aplicativo consulta o servidor e podem demorar; o aviso no celular (push) depende de configuração que pode não estar ativa.
- Não garantimos prazo de entrega.

## 9. Suspensão e encerramento

A loja pode parar de usar o aplicativo e excluir a conta quando quiser. A Fortaleza Move pode suspender ou encerrar o acesso em caso de descumprimento destes termos, risco à segurança, fraude ou ordem legal.

## 10. Mudanças e contato

Podemos atualizar estes termos. Mudanças relevantes terão nova versão e novo aceite. Dúvidas: ${EMAIL_CONTATO}.

---

### Pontos para validação externa (equipe — não faz parte do texto aceito)

1. Razão social, CNPJ e endereço da operadora (ainda em registro).
2. Limite de responsabilidade por dano/extravio e eventual seguro.
3. Natureza do vínculo entre loja, plataforma e motorista; regras de entrega de produtos regulados (alimentos, medicamentos).
4. Regras de cancelamento e de cobrança por entrega falha.
5. Base legal e papéis na LGPD (controlador/operador) para os dados de quem recebe; prazos de retenção.
6. Foro e lei aplicável.
7. Tratamento de nota fiscal e de recibo da entrega.
`;
