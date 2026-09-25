/**
 * Termos de Uso e Politica de Privacidade.
 *
 * AVISO PARA A EQUIPE (nao aparece no aplicativo): este texto e um
 * modelo de partida, redigido para cobrir os pontos que a plataforma
 * pediu. Ele NAO substitui a revisao de um advogado antes de publicar o
 * aplicativo nas lojas — em especial a clausula de responsabilidade
 * penal e os dados da empresa (razao social, CNPJ, endereco), que ainda
 * dependem do registro do MEI.
 */

export const LEGAL_VERSION = '1.0.0';

const RAZAO_SOCIAL_PENDENTE =
  '[Fortaleza Digital Security — CNPJ a preencher apos o registro do MEI]';

export const TERMS_MD = `# Termos de Uso — Fortaleza Mov

Versao ${LEGAL_VERSION} — vigente a partir de sua publicacao no aplicativo.

## 1. O que e a Fortaleza Mov

A Fortaleza Mov, operada por ${RAZAO_SOCIAL_PENDENTE}, e uma plataforma de
tecnologia que aproxima passageiros e motoristas parceiros para a
realizacao de corridas. A plataforma **nao presta o servico de
transporte diretamente**: ela e uma intermediaria que conecta as
partes, sendo o motorista parceiro o responsavel pela execucao da
viagem.

## 2. Cadastro

Para usar a Fortaleza Mov e preciso ter 18 anos ou mais e fornecer
dados verdadeiros. Motoristas parceiros passam por analise de
documentos antes da aprovacao, incluindo Carteira Nacional de
Habilitacao (CNH) valida e documento do veiculo (CRLV) em dia.

## 3. Uso proibido da plataforma

E **expressamente proibida** a utilizacao do servico para:

- transporte de substancias ilicitas;
- transporte de armas sem a devida autorizacao legal;
- transporte de objetos roubados, furtados ou de origem ilicita;
- qualquer atividade criminosa, sob qualquer forma.

**Isencao de responsabilidade.** A plataforma e uma intermediaria de
tecnologia. O passageiro assume total responsabilidade civil e
criminal pelo conteudo de sua bagagem e por seus atos durante a
viagem, isentando o motorista parceiro e a plataforma de qualquer
coparticipacao criminal em caso de flagrante policial, uma vez que o
motorista atua estritamente na prestacao do servico de transporte de
boa-fe, sem conhecimento do conteudo transportado pelo passageiro.

O descumprimento deste item autoriza o bloqueio imediato e definitivo
da conta, sem prejuizo das medidas legais cabiveis e da colaboracao da
plataforma com as autoridades competentes quando solicitada.

## 4. Precos e pagamento

O valor de cada corrida e calculado pela plataforma com base na
bandeira vigente no momento do pedido (diurna ou noturna), na
distancia percorrida e no tempo de espera, conforme tabela publica
exibida no aplicativo antes da confirmacao da corrida. Os precos podem
ser alterados pela plataforma a qualquer momento, valendo a tabela em
vigor no instante de cada pedido.

## 5. Responsabilidade do motorista parceiro

O motorista parceiro e responsavel por manter a CNH e o licenciamento
do veiculo em dia, por dirigir com prudencia e por cumprir a
legislacao de transito. O motorista parceiro nao e empregado da
plataforma, atuando como parceiro autonomo.

## 6. Cancelamento

Passageiro e motorista podem cancelar uma corrida antes do embarque.
Cancelamentos apos o motorista ja estar a caminho podem gerar cobranca
de multa, conforme valor informado no aplicativo para a bandeira
vigente.

## 7. Suspensao e encerramento de conta

A plataforma pode suspender ou encerrar contas que violem estes
Termos, incluindo o uso da plataforma para fins ilicitos, fraude,
agressao ou comportamento que coloque em risco outros usuarios.

## 8. Alteracoes destes Termos

Estes Termos podem ser atualizados. Mudancas relevantes exigem novo
aceite antes de continuar usando o aplicativo.

## 9. Foro

Fica eleito o foro da comarca de Goiatuba, Estado de Goias, para
dirimir quaisquer controversias decorrentes destes Termos.

---

Ao tocar em "Aceito os Termos", voce declara ter lido e concordado
com este documento e com a Politica de Privacidade.
`;

export const PRIVACY_MD = `# Politica de Privacidade — Fortaleza Mov

Versao ${LEGAL_VERSION} — vigente a partir de sua publicacao no aplicativo.

Esta Politica explica como a Fortaleza Mov, operada por
${RAZAO_SOCIAL_PENDENTE}, coleta, usa e protege os dados pessoais de
passageiros e motoristas parceiros, em conformidade com a Lei Geral de
Protecao de Dados (Lei 13.709/2018 — LGPD).

## 1. Quais dados coletamos

**De todos os usuarios:** nome, telefone, e-mail (quando informado),
CPF, data de nascimento e localizacao por GPS durante o uso do
aplicativo.

**De motoristas parceiros, adicionalmente:** numero e categoria da
CNH, validade da CNH, dados do veiculo (placa, marca, modelo, ano,
cor), e os documentos enviados para analise (foto da CNH, foto do
CRLV, foto do veiculo e comprovante de residencia).

**Durante uma corrida:** a localizacao GPS do passageiro e do
motorista, o trajeto percorrido e o horario de cada etapa da viagem
(pedido, aceite, embarque, desembarque).

## 2. Para que usamos esses dados

- **Localizacao (GPS):** para encontrar o motorista mais proximo,
  tracar a rota, calcular a distancia da corrida e permitir que
  passageiro e motorista se encontrem. A localizacao so e
  compartilhada entre as duas partes de uma corrida especifica
  enquanto ela estiver em andamento.
- **CNH e documentos do motorista:** exclusivamente para verificar
  que o motorista parceiro esta habilitado a dirigir e que o veiculo
  esta regularizado, como medida de seguranca para os passageiros.
- **CPF e data de nascimento:** para confirmar a identidade e a
  maioridade do usuario.
- **Historico de corridas:** para exibir o extrato ao usuario, para
  calculo de tarifas e comissoes, e para atendimento em caso de
  duvida ou reclamacao sobre uma corrida.

Nao vendemos dados pessoais a terceiros.

## 3. Onde os dados ficam guardados

Os documentos enviados pelos motoristas (fotos de CNH, CRLV e veiculo)
sao armazenados de forma criptografada em servico de nuvem operado
pela Cloudflare. O acesso a esses arquivos e restrito à equipe
responsavel pela analise de cadastro e a auditorias de seguranca.

## 4. Por quanto tempo guardamos

Os dados sao mantidos enquanto a conta estiver ativa e pelo prazo
adicional exigido por lei apos o encerramento (por exemplo, para fins
fiscais ou de defesa em processos). O usuario pode solicitar a exclusao
da conta a qualquer momento pelo aplicativo, respeitados os prazos
legais de guarda que se apliquem ao caso.

## 5. Seus direitos, conforme a LGPD

Voce pode, a qualquer momento:

- confirmar a existencia de tratamento dos seus dados;
- acessar os dados que temos sobre voce;
- corrigir dados incompletos, inexatos ou desatualizados;
- solicitar a anonimizacao, o bloqueio ou a eliminacao de dados
  desnecessarios ou tratados em desacordo com a lei;
- solicitar a portabilidade dos seus dados;
- revogar o consentimento dado, quando aplicavel;
- se opor a um tratamento realizado com base em outra hipotese legal.

Para exercer qualquer um desses direitos, entre em contato pelo canal
informado no aplicativo, na secao Conta.

## 6. Compartilhamento de dados

Compartilhamos apenas o necessario para a corrida acontecer: o
passageiro ve o nome, a foto, a nota e o veiculo do motorista
escalado; o motorista ve o nome e o endereco de embarque e destino do
passageiro. Fora isso, dados pessoais nao sao repassados a terceiros,
exceto quando exigido por lei ou ordem judicial.

## 7. Menores de idade

O aplicativo nao se destina a menores de 18 anos.

## 8. Alteracoes desta Politica

Esta Politica pode ser atualizada para refletir mudancas na forma como
tratamos os dados. Mudancas relevantes exigem novo aceite antes de
continuar usando o aplicativo.

---

Ao tocar em "Aceito os Termos", voce declara ter lido e concordado com
esta Politica de Privacidade e com os Termos de Uso.
`;
