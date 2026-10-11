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
  '[Fortaleza Digital Security — CNPJ a preencher após o registro do MEI]';

// Texto com acentos e parágrafos inteiros (revisão de 11/10/2026): os apps
// juntam as linhas de cada parágrafo. A versão continua 1.0.0 porque a
// plataforma ainda não tem usuários de verdade — depois do lançamento,
// mudança relevante aqui exige subir LEGAL_VERSION (e kTermsVersion nos apps).

export const TERMS_MD = `# Termos de Uso — Fortaleza Mov

Versão ${LEGAL_VERSION} — vigente a partir de sua publicação no aplicativo.

## 1. O que é a Fortaleza Mov

A Fortaleza Mov, operada por ${RAZAO_SOCIAL_PENDENTE}, é uma plataforma de tecnologia que aproxima passageiros e motoristas parceiros para a realização de corridas de carro e de moto (mototáxi). A plataforma **não presta o serviço de transporte diretamente**: ela é uma intermediária que conecta as partes, sendo o motorista parceiro o responsável pela execução da viagem.

## 2. Cadastro

Para usar a Fortaleza Mov é preciso ter 18 anos ou mais e fornecer dados verdadeiros. Motoristas parceiros passam por análise de documentos antes da aprovação, incluindo Carteira Nacional de Habilitação (CNH) válida e documento do veículo (CRLV) em dia, e só começam a receber corridas depois da aprovação presencial na Central.

## 3. Uso proibido da plataforma

É **expressamente proibida** a utilização do serviço para:

- transporte de substâncias ilícitas;
- transporte de armas sem a devida autorização legal;
- transporte de objetos roubados, furtados ou de origem ilícita;
- qualquer atividade criminosa, sob qualquer forma.

**Isenção de responsabilidade.** A plataforma é uma intermediária de tecnologia. O passageiro assume total responsabilidade civil e criminal pelo conteúdo de sua bagagem e por seus atos durante a viagem, isentando o motorista parceiro e a plataforma de qualquer coparticipação criminal em caso de flagrante policial, uma vez que o motorista atua estritamente na prestação do serviço de transporte de boa-fé, sem conhecimento do conteúdo transportado pelo passageiro.

O descumprimento deste item autoriza o bloqueio imediato e definitivo da conta, sem prejuízo das medidas legais cabíveis e da colaboração da plataforma com as autoridades competentes quando solicitada.

## 4. Preços e pagamento

Antes de confirmar, o passageiro vê um **valor aproximado**, calculado com base na bandeira vigente (diurna ou noturna), na distância prevista e na tabela pública exibida no aplicativo. O **valor final é o do taxímetro do motorista**, pelo trajeto realmente feito: bandeirada, quilômetros rodados e tempo parado (espera no embarque e paradas pedidas pelo passageiro, cobradas depois de 3 minutos). Quando a corrida for de preço fechado, isso aparece no aplicativo antes da confirmação.

O pagamento é feito **diretamente ao motorista** (dinheiro, Pix ou cartão na maquininha dele): o dinheiro da corrida não passa pela plataforma. Cupons de desconto são pagos pela plataforma. Os preços podem ser alterados a qualquer momento, valendo a tabela em vigor no instante de cada pedido.

## 5. Responsabilidade do motorista parceiro

O motorista parceiro é responsável por manter a CNH e o licenciamento do veículo em dia, por dirigir com prudência e por cumprir a legislação de trânsito. O motorista parceiro não é empregado da plataforma, atuando como parceiro autônomo. A taxa da plataforma sobre cada corrida é descontada da carteira pré-paga do motorista, conforme as regras combinadas com a Central.

## 6. Cancelamento

Passageiro e motorista podem cancelar uma corrida antes do embarque. Cancelamentos depois que o motorista já estiver a caminho podem gerar cobrança de multa, conforme o valor informado no aplicativo para a bandeira vigente.

## 7. Segurança

Durante a corrida, passageiro e motorista têm o botão SOS, que envia a localização na hora para a Central. O passageiro pode compartilhar a viagem com familiares por um link com o mapa ao vivo.

## 8. Suspensão e encerramento de conta

A plataforma pode suspender ou encerrar contas que violem estes Termos, incluindo o uso da plataforma para fins ilícitos, fraude, agressão ou comportamento que coloque em risco outros usuários. O usuário pode excluir a própria conta a qualquer momento, pelo aplicativo.

## 9. Alterações destes Termos

Estes Termos podem ser atualizados. Mudanças relevantes exigem novo aceite antes de continuar usando o aplicativo.

## 10. Foro

Fica eleito o foro da comarca de Goiatuba, Estado de Goiás, para dirimir quaisquer controvérsias decorrentes destes Termos.

---

Ao tocar em "Aceito os Termos", você declara ter lido e concordado com este documento e com a Política de Privacidade.
`;

export const PRIVACY_MD = `# Política de Privacidade — Fortaleza Mov

Versão ${LEGAL_VERSION} — vigente a partir de sua publicação no aplicativo.

Esta Política explica como a Fortaleza Mov, operada por ${RAZAO_SOCIAL_PENDENTE}, coleta, usa e protege os dados pessoais de passageiros e motoristas parceiros, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD).

## 1. Quais dados coletamos

**De todos os usuários:** nome, telefone, e-mail, gênero e cidade (quando informados), CPF, data de nascimento, endereço (quando informado), foto de perfil (opcional) e a localização por GPS durante o uso do aplicativo.

**De motoristas parceiros, adicionalmente:** número, categoria e validade da CNH, chave Pix, dados do veículo (placa, marca, modelo, ano, cor) e os documentos enviados para análise (foto da CNH, do CRLV, do veículo, comprovante de residência e certidão de antecedentes criminais).

**Durante uma corrida:** a localização GPS do passageiro e do motorista, o trajeto percorrido, o horário de cada etapa (pedido, aceite, embarque, desembarque), o valor, a avaliação e as mensagens trocadas no chat da corrida.

**Contatos de emergência (opcional):** nome e telefone das pessoas que o passageiro cadastrar, para avisá-las em caso de SOS.

## 2. Para que usamos esses dados

- **Localização (GPS):** para encontrar o motorista mais próximo, traçar a rota, calcular a distância e o valor da corrida e permitir que passageiro e motorista se encontrem. O app do motorista usa a localização também em segundo plano enquanto ele está disponível ou em corrida, para receber chamados e registrar o trajeto. A localização só é mostrada à outra parte durante a corrida.
- **CNH e documentos do motorista:** exclusivamente para verificar que o motorista parceiro está habilitado a dirigir e que o veículo está regularizado, como medida de segurança para os passageiros.
- **CPF e data de nascimento:** para confirmar a identidade e a maioridade do usuário.
- **Telefone e e-mail:** para entrar na conta (código enviado por e-mail) e para avisos sobre as corridas.
- **Histórico de corridas:** para mostrar o extrato e o recibo ao usuário, calcular tarifas e taxas, e atender dúvidas ou reclamações.
- **SOS:** a localização e os dados da corrida vão na hora para a Central da plataforma.

Não vendemos dados pessoais a terceiros e não usamos anúncios.

## 3. Onde os dados ficam guardados e quem nos ajuda

Os dados e os documentos ficam no banco de dados da plataforma, com acesso restrito: documentos do motorista só são vistos pelo próprio motorista e pela equipe da Central responsável pela análise do cadastro. Senhas são guardadas de forma cifrada (nunca em texto). Para funcionar, a plataforma usa estes serviços, que tratam dados apenas para prestar o serviço contratado:

- **Render** (servidor) e **Supabase** (banco de dados), com servidores nos Estados Unidos — a transferência internacional segue o art. 33 da LGPD, com cláusulas de proteção de dados desses fornecedores;
- **Google Firebase** (envio de notificações ao celular) e **Google/Gmail** (envio dos códigos de acesso por e-mail);
- **OpenStreetMap** e serviços de rota e de busca de endereço (recebem coordenadas e o texto buscado, sem o nome do usuário);
- **WhatsApp**, somente quando o próprio usuário escolhe compartilhar a viagem, o recibo ou falar com a Central.

## 4. Por quanto tempo guardamos

Os dados são mantidos enquanto a conta estiver ativa e pelo prazo adicional exigido por lei após o encerramento (por exemplo, para fins fiscais ou de defesa em processos). O usuário pode excluir a conta a qualquer momento pelo aplicativo (Conta → Excluir minha conta) ou pela página pública de exclusão, respeitados os prazos legais de guarda que se apliquem ao caso.

## 5. Seus direitos, conforme a LGPD

Você pode, a qualquer momento:

- confirmar a existência de tratamento dos seus dados;
- acessar os dados que temos sobre você;
- corrigir dados incompletos, inexatos ou desatualizados (pelo aplicativo, em Meus dados, ou pela Central);
- solicitar a anonimização, o bloqueio ou a eliminação de dados desnecessários ou tratados em desacordo com a lei;
- solicitar a portabilidade dos seus dados;
- revogar o consentimento dado, quando aplicável;
- se opor a um tratamento realizado com base em outra hipótese legal.

Para exercer qualquer um desses direitos, fale com a Central pelo canal informado no aplicativo (Ajuda → Falar com a Central).

## 6. Compartilhamento de dados

Compartilhamos apenas o necessário para a corrida acontecer: o passageiro vê o nome, a foto, a nota e o veículo do motorista; o motorista vê o nome, a nota e os endereços de embarque e destino do passageiro. O link de "Compartilhar viagem" mostra o primeiro nome do motorista, o veículo, a placa, o embarque, o destino e a posição do carro, sem telefone de ninguém, e deixa de funcionar 30 minutos depois do fim da corrida. Fora isso, dados pessoais não são repassados a terceiros, exceto quando exigido por lei ou ordem judicial.

## 7. Menores de idade

O aplicativo não se destina a menores de 18 anos.

## 8. Alterações desta Política

Esta Política pode ser atualizada para refletir mudanças na forma como tratamos os dados. Mudanças relevantes exigem novo aceite antes de continuar usando o aplicativo.

---

Ao tocar em "Aceito os Termos", você declara ter lido e concordado com esta Política de Privacidade e com os Termos de Uso.
`;
