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

export const LEGAL_VERSION = '1.1.0';

// Evandro (11/10/2026): marca Fortaleza Move; quem desenvolve e opera e a
// Fortaleza Digital Security. CNPJ ainda nao existe: entra aqui quando sair.
const OPERADORA = 'Fortaleza Digital Security (Goiatuba – GO, CNPJ em registro)';
const EMAIL_CONTATO = 'fortalezamovegtba@gmail.com';
const WHATSAPP_CONTATO = '(64) 99647-2794';

// Texto com acentos e parágrafos inteiros (revisão de 11/10/2026): os apps
// juntam as linhas de cada parágrafo. Mudança relevante aqui exige subir
// LEGAL_VERSION (e kTermsVersion nos apps). 1.1.0: entrada com a conta Google.

export const TERMS_MD = `# Termos de Uso — Fortaleza Move

Versão ${LEGAL_VERSION} — vigente a partir de sua publicação no aplicativo.

## 1. O que é a Fortaleza Move

A Fortaleza Move, desenvolvida e operada por ${OPERADORA}, é uma plataforma de tecnologia que aproxima passageiros e motoristas parceiros para a realização de corridas de carro e de moto (mototáxi). A plataforma **não presta o serviço de transporte diretamente**: ela é uma intermediária que conecta as partes, sendo o motorista parceiro o responsável pela execução da viagem.

## 2. Cadastro

Para usar a Fortaleza Move é preciso ter 18 anos ou mais e fornecer dados verdadeiros. Motoristas parceiros passam por análise de documentos antes da aprovação, incluindo Carteira Nacional de Habilitação (CNH) válida e documento do veículo (CRLV) em dia, e só começam a receber corridas depois da aprovação presencial na Central.

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

## 7-A. Entregas de encomendas — TEXTO PROVISÓRIO (em revisão jurídica)

*Este item ainda está em revisão e pode mudar antes de a entrega ser ligada na sua cidade. Enquanto a Central não ligar, a entrega não aparece no aplicativo.*

Quando a Central liga a entrega na cidade, o cliente pode pedir que um motorista parceiro leve uma encomenda de um endereço a outro. A entrega segue as mesmas regras da corrida (preço, pagamento direto ao motorista, cancelamento e segurança), com a tarifa própria de entrega mostrada antes de confirmar, e mais estas:

- **Itens proibidos:** dinheiro em espécie, cheques, cartões e títulos; joias e objetos de alto valor; armas, munição, explosivos e fogos de artifício; produtos inflamáveis, tóxicos ou corrosivos (gás, combustível, ácidos); drogas e substâncias ilícitas; medicamentos controlados sem receita; bebida alcoólica ou cigarro para menores de 18 anos; animais vivos; produtos falsificados, roubados ou de origem ilícita; e qualquer item proibido por lei. Vale também o item 3 destes Termos.
- **Peso e tamanho (provisório):** de carro, até 10 kg e que caiba no porta-malas; de moto, até 5 kg e até 40 × 40 × 40 cm, levado em baú ou bolsa do motorista.
- **Embalagem:** o cliente entrega o item fechado e embalado. O motorista pode recusar item mal embalado, acima do limite ou que pareça proibido.
- **Descrição verdadeira:** o cliente descreve o que vai ser levado e responde, civil e criminalmente, pelo conteúdo, nos termos do item 3.
- **Código de entrega:** a entrega só termina quando quem recebe diz ao motorista o código de 4 números que o cliente recebeu no aplicativo. Sem o código, o motorista não entrega.
- **Ninguém para receber (provisório):** o motorista espera alguns minutos (tempo parado cobrado) e, sem ninguém, combina com o cliente a devolução, cobrada como uma nova viagem.
- **Dano ou extravio (provisório):** a plataforma é intermediária e não faz seguro das encomendas. O motorista parceiro responde pelo dano ou extravio que causar, comprovado, até o limite que a plataforma informar; o cliente responde pela embalagem e pela descrição. Itens proibidos não têm qualquer cobertura.

## 8. Suspensão e encerramento de conta

A plataforma pode suspender ou encerrar contas que violem estes Termos, incluindo o uso da plataforma para fins ilícitos, fraude, agressão ou comportamento que coloque em risco outros usuários. O usuário pode excluir a própria conta a qualquer momento, pelo aplicativo.

## 9. Alterações destes Termos

Estes Termos podem ser atualizados. Mudanças relevantes são avisadas no aplicativo.

## 10. Contato

Dúvidas, reclamações e pedidos: e-mail ${EMAIL_CONTATO} ou WhatsApp da Central ${WHATSAPP_CONTATO} (também pelo aplicativo, em Ajuda → Falar com a Central).

## 11. Foro

Fica eleito o foro da comarca de Goiatuba, Estado de Goiás, para dirimir quaisquer controvérsias decorrentes destes Termos.

---

Ao tocar em "Aceito os Termos", você declara ter lido e concordado com este documento e com a Política de Privacidade.
`;

/**
 * Politica de Privacidade dos aplicativos Passageiro e Motorista. Cada frase
 * descreve o que o sistema faz: ao mudar o que e coletado, compartilhado,
 * apagado ou por quanto tempo fica guardado, atualize o texto e a data.
 */
export const PRIVACY_MD = `# Política de Privacidade — Fortaleza Move

Versão ${LEGAL_VERSION} — atualizada em 27 de novembro de 2026.

Esta Política explica como são tratados os dados pessoais de quem usa os aplicativos **Fortaleza Move** (passageiro) e **Fortaleza Move Motorista**, conforme a Lei Geral de Proteção de Dados Pessoais (Lei 13.709/2018 — LGPD). Ela descreve o que o sistema faz hoje, incluindo o que ainda é guardado sem prazo automático de exclusão. Ela não trata do aplicativo Fortaleza Move Comércio, do aplicativo da Central nem do sistema de atendimento (CRM). Dúvidas sobre eles podem ser enviadas pelo mesmo canal abaixo.

## 1. Quem é o responsável pelos seus dados

**Controlador:** Evandro da Silva Gonchoroski, pessoa física, responsável pela Fortaleza Move e pela marca Fortaleza Digital Security, em Goiatuba – GO. Até a data desta versão não há CNPJ.

**Canal de privacidade e contato do encarregado:** o próprio Evandro da Silva Gonchoroski, pelo e-mail ${EMAIL_CONTATO} ou pelo WhatsApp ${WHATSAPP_CONTATO}.

## 2. Quais dados tratamos

**Passageiro — cadastro:** nome, telefone, e-mail, CPF, gênero e cidade. São opcionais: foto de perfil, endereços salvos, motoristas salvos, contatos de emergência e senha (guardada somente em forma embaralhada, que não permite lê-la).

**Motorista — cadastro:** nome, telefone, e-mail, CPF, data de nascimento, cidade onde trabalha, foto de perfil, número, categoria e validade da CNH, chave Pix e dados do veículo (placa, marca, modelo, ano, cor, categoria, validade do CRLV e fotos).

**Motorista — documentos para análise:** fotos da CNH, do CRLV e do veículo, comprovante de residência e certidão de antecedentes criminais, quando enviados ou pedidos para a aprovação. Parte do cadastro também pode ser feita ou atualizada pela equipe da Central, com os dados que você informar a ela.

**Motorista — operação:** os períodos em que ficou disponível, os chamados recebidos e a resposta a eles, as corridas, os ganhos, as taxas, o saldo e o extrato da carteira, os pedidos de saque, os pedidos de alteração de dados e o resultado das análises.

**Corridas:** endereços e coordenadas de embarque, paradas e destino, horário de cada etapa, a posição registrada nas mudanças de etapa, distância, duração, valor, cupom, motivo de cancelamento, agendamento, forma de pagamento escolhida, avaliações, comentários e mensagens do chat da corrida.

**Pagamento:** a corrida é paga direto ao motorista (dinheiro, Pix ou cartão na maquininha dele). Os aplicativos não pedem nem guardam número de cartão ou senha de banco.

**Entregas:** quando a entrega estiver ligada na cidade, o nome e o telefone de quem recebe e a descrição do item.

**Corrida aberta pela Central ou pelo motorista a pedido de um cliente:** o nome, o telefone e os endereços informados por essa pessoa.

**Localização no passageiro:** é usada com o aplicativo aberto, para mostrar o mapa, calcular o valor, procurar motoristas próximos e marcar o embarque. O ponto de embarque fica registrado na corrida. Se você acionar o SOS, a sua posição é enviada à Central e atualizada enquanto o alerta estiver sendo transmitido.

**Localização no motorista:** é usada enquanto você está **Disponível** ou em corrida, **inclusive com o aplicativo fechado ou a tela desligada**, com um aviso fixo na barra do celular. Ela serve para enviar chamados próximos, mostrar o carro ao passageiro e medir a corrida. No servidor, a posição ao vivo do motorista é substituída pela mais nova a cada envio (guardamos a última); as posições das mudanças de etapa ficam registradas na corrida, junto com a distância medida pelo celular.

**Aparelho, acesso e segurança:** um código que identifica a instalação do aplicativo, o modelo do aparelho, a versão do sistema e do aplicativo, o código de notificações, o endereço IP, data e hora dos acessos e as sessões abertas. Quando você pede um código de acesso, registramos o e-mail ou telefone, o IP e o horário. Também guardamos a versão dos Termos e desta Política que você aceitou, com data e hora, e registros de ações administrativas feitas no sistema.

**Entrar com Google:** quando essa opção estiver disponível no aplicativo e você a usar, recebemos do Google o seu nome, o seu e-mail e um código que identifica a conta. Não recebemos a sua senha do Google nem acessamos o seu Gmail, contatos, fotos ou arquivos.

**Dados de outras pessoas informados por você:** contatos de emergência (nome e telefone de até 3 pessoas) e destinatários de entregas. Informe somente dados de quem saiba disso. Essas pessoas também podem usar o canal de privacidade. Os contatos de emergência aparecem para a equipe da Central quando você aciona o SOS. O sistema não envia mensagem automática a eles: no aplicativo, você mesmo pode escolher avisá-los pelo seu WhatsApp.

**O que não coletamos:** a agenda de contatos do celular, SMS, registro de chamadas, a sua galeria (somente a imagem que você escolher enviar) e identificadores de publicidade. Os aplicativos não têm anúncios nem ferramentas de análise de publicidade.

## 3. Para que usamos os dados e com qual base legal

- **Criar e manter a conta, procurar motorista, fazer e cobrar a corrida ou entrega, conversar no chat, mostrar histórico e enviar avisos:** execução do contrato de uso e dos procedimentos anteriores a ele (art. 7º, V, da LGPD).
- **Analisar documentos e dados do motorista e do veículo, inclusive a certidão de antecedentes quando pedida:** execução do contrato e dos procedimentos para aprovar o parceiro (art. 7º, V) e interesse legítimo na segurança dos passageiros (art. 7º, IX).
- **Proteger contas, limitar tentativas de acesso, prevenir fraudes e apurar abusos:** interesse legítimo (art. 7º, IX).
- **Atender o botão SOS e outras situações de risco:** proteção da vida e da integridade física (art. 7º, VII).
- **Cumprir obrigações previstas em lei e atender ordens de autoridades:** obrigação legal ou regulatória (art. 7º, II).
- **Guardar registros necessários para responder reclamações e processos:** exercício regular de direitos (art. 7º, VI).

Os recursos opcionais (como foto do passageiro, endereços salvos e Entrar com Google) só são usados se você escolher usá-los. As permissões do celular podem ser retiradas a qualquer momento nos ajustes do aparelho; sem a localização, algumas funções deixam de funcionar.

Não vendemos dados pessoais. O sistema escolhe automaticamente para quem enviar um chamado, usando critérios como disponibilidade e proximidade. Você pode pedir informações ou a revisão pelo canal de privacidade (art. 20 da LGPD).

## 4. Permissões do celular

- **Localização:** no passageiro, durante o uso do aplicativo; no motorista, também com o aplicativo fechado enquanto estiver Disponível ou em corrida.
- **Notificações:** avisos de corrida, chamados, mensagens e comunicados do serviço.
- **Funcionamento em segundo plano:** no passageiro, para acompanhar a corrida e avisar você, sem coletar localização em segundo plano; no motorista, para receber chamados e manter a localização enquanto estiver Disponível ou em corrida.
- **Câmera e imagens:** somente quando você escolhe tirar ou enviar uma foto.
- **Somente no motorista — aparecer sobre outros aplicativos, tela cheia e manter o celular acordado:** para o chamado aparecer a tempo.
- **Internet e vibração:** para o aplicativo se comunicar com o servidor e chamar a sua atenção.

## 5. Com quem os dados são compartilhados

**Entre passageiro e motorista:** o passageiro vê o nome, a foto, a nota, o veículo, a placa e a posição do motorista. O motorista vê o nome, a nota e os endereços da corrida. Para combinar o embarque ou resolver um objeto esquecido, um pode ver o telefone do outro durante a corrida e por até 24 horas depois do fim.

**Link "Compartilhar viagem":** quem receber o link vê o primeiro nome do motorista, o veículo, a placa, o embarque, o destino e a posição do carro, sem telefone. O link deixa de funcionar 30 minutos depois do fim da corrida. Envie-o somente a pessoas de confiança.

**Equipe da Fortaleza Move:** a equipe autorizada da Central, incluindo os responsáveis pela Central de uma cidade quando houver, acessa os dados necessários para aprovar cadastros, atender, cuidar da segurança, da operação e das finanças.

**Fornecedores usados para o serviço funcionar:**

- **Integrator Host:** hospedagem do servidor, do banco de dados e dos documentos.
- **GitHub:** guarda as cópias de segurança do banco, criptografadas antes de saírem do servidor.
- **Google:** envio de notificações pelo Firebase (o aviso pode conter dados da corrida e o texto de uma mensagem do chat), envio de e-mails pelo Gmail e, quando disponível, o Entrar com Google. O aplicativo também contém o componente do Google Maps; o mapa em uso na data desta versão é o da TomTom.
- **Brevo:** serviço reserva para envio de e-mails.
- **TomTom:** mapas, busca de endereços e rotas. Nas buscas e rotas feitas pelo servidor, enviamos o texto buscado ou as coordenadas, sem o seu nome. As imagens do mapa podem ser pedidas diretamente pelo celular, e então a TomTom recebe o endereço IP e a área do mapa consultada.

**Serviços que você mesmo aciona:** ao escolher usar o WhatsApp, o Waze, o Google Maps ou o telefone, os dados que você enviar ou abrir passam a ser tratados também por esses serviços, conforme as regras deles.

**Autoridades:** dados podem ser fornecidos quando houver obrigação legal ou ordem de autoridade competente, ou quando necessários para exercer direitos ou proteger a vida.

## 6. Transferência internacional

Alguns fornecedores são empresas estrangeiras ou usam servidores fora do Brasil, como os de hospedagem, cópia de segurança, notificações, e-mail e mapas. O endereço de rede do servidor da plataforma está registrado em nome de um provedor no Canadá. Por isso, os seus dados podem ser armazenados ou tratados fora do Brasil, na medida necessária para prestar o serviço que você pediu (art. 33, IX, combinado com o art. 7º, V, da LGPD) e para as demais finalidades permitidas pela lei. Você pode pedir mais informações pelo canal de privacidade.

## 7. Cookies e dados de navegação

- **Aplicativos:** guardam no celular as informações necessárias para manter você conectado e lembrar preferências.
- **Páginas desta Política, de exclusão de conta e de download:** na data desta versão, não gravam cookies.
- **Site move.fortalezadigitalsecurity.com.br:** não usa cookies nem ferramenta de análise de visitas. Ele usa o armazenamento do navegador para guardar textos e novidades públicas, lembrar que o aviso de instalação foi fechado e funcionar com internet ruim. O site é hospedado no GitHub Pages, busca conteúdo no Supabase e carrega uma biblioteca pela jsDelivr. Esses serviços recebem dados técnicos do acesso, como o endereço IP.
- **Página do link "Compartilhar viagem":** carrega a biblioteca do mapa pelo serviço unpkg, que recebe dados técnicos do acesso, como o endereço IP.
- **Registros do servidor:** o servidor registra acessos (por exemplo, IP, data, hora e endereço acessado) para segurança e correção de falhas.

## 8. Segurança

- A comunicação entre os aplicativos e o servidor usa conexão criptografada (HTTPS).
- Senhas são guardadas somente em forma embaralhada, e os códigos de acesso vencem em poucos minutos.
- Há limites para tentativas e pedidos repetidos.
- Fotos e documentos só abrem com login. A CNH, o CRLV, o comprovante de residência, a certidão e as demais fotos de documentos são abertos pelo próprio motorista e pela equipe da Central; a foto de perfil e a foto da frente do veículo podem ser vistas por outros usuários conectados.
- A cópia de segurança diária do banco é criptografada.

Nenhum sistema é totalmente livre de riscos. Em caso de incidente de segurança, serão feitas as comunicações exigidas pela LGPD.

## 9. Por quanto tempo guardamos

- **Conta, cadastro, documentos e fotos:** enquanto a conta ou o cadastro de motorista existir. Veja no item 10 o que acontece na exclusão.
- **Histórico de corridas e entregas, registros financeiros, avaliações, mensagens do chat, alertas de SOS, registros administrativos e registros de pedidos de código de acesso:** na data desta versão, **não há exclusão automática por prazo**. São mantidos para o histórico, a segurança, as obrigações legais e a defesa de direitos. Você pode pedir a eliminação do que não precisar mais ser guardado.
- **Avisos da caixa de entrada do aplicativo:** apagados automaticamente após 30 dias.
- **Registros de acesso do servidor na internet:** substituídos em rodízio diário, mantidos por cerca de 14 dias. Outros registros técnicos são substituídos conforme o limite de tamanho.
- **Cópia de segurança diária:** ficam as 7 cópias mais recentes. Um dado apagado continua nelas até serem substituídas. Antes de manutenções que limpam a base, o sistema também pode guardar até 3 cópias internas no próprio banco de dados.

## 10. Como excluir a conta e os dados

**Pelo aplicativo:**

- **Passageiro:** Conta → Excluir minha conta.
- **Motorista:** Menu → Cadastro → Excluir minha conta.

**Pela internet, sem precisar do aplicativo:** https://api.fortalezadigitalsecurity.com.br/api/conta/exclusao — o pedido é atendido pela equipe em até 7 dias, e podemos confirmar que a conta é sua. Também é possível pedir pelo canal de privacidade.

A mesma conta pode ser usada como passageiro e como motorista. **A exclusão feita pelo aplicativo ou pelo pedido na internet encerra os dois perfis.** Ela não é feita enquanto houver corrida em andamento (nem, no caso do passageiro, corrida agendada). O saldo que restar na carteira do motorista é perdido: peça o saque antes.

**São apagados do cadastro:** nome, telefone, e-mail, CPF, data de nascimento, senha, foto de perfil, endereços salvos, motoristas salvos, contatos de emergência e as sessões e aparelhos da conta. Para o motorista, também o cadastro de motorista, a CNH, as fotos de documentos, os veículos, a carteira, o extrato, os saques, a última posição, os períodos disponíveis e os chamados.

**Podem continuar guardados:** o histórico de corridas e entregas (com endereços, coordenadas, horários e valores), ligado a um cadastro sem o seu nome ou sem o vínculo com o motorista; as mensagens do chat e os comentários de avaliação, **com o texto que foi escrito**; alertas de SOS, com a localização; registros administrativos, que podem conter, por exemplo, dados do veículo ou o contato informado num pedido de exclusão; os registros de pedidos de código (e-mail ou telefone, IP e horário); os avisos da caixa de entrada, até o prazo de 30 dias; os registros do servidor e as cópias de segurança, pelos prazos do item 9. Quando a conta não tem nenhum histórico, o cadastro é removido por inteiro, mas registros de acesso e cópias de segurança seguem os mesmos prazos.

Para pedir a eliminação ou a anonimização do que continuou guardado, use o canal de privacidade. Vamos analisar o pedido e manter somente o que a lei permitir (art. 16 da LGPD), explicando o motivo.

## 11. Seus direitos

Pela LGPD (art. 18), você pode pedir:

- a confirmação de que tratamos seus dados;
- o acesso aos dados;
- a correção de dados incompletos, errados ou desatualizados;
- a anonimização, o bloqueio ou a eliminação de dados desnecessários, excessivos ou tratados em desacordo com a lei;
- a portabilidade dos dados, nos termos da regulamentação;
- a eliminação dos dados tratados com o seu consentimento, observadas as exceções da lei;
- a informação sobre com quem os dados foram compartilhados;
- a informação sobre a possibilidade de não consentir e o que acontece nesse caso;
- a revogação do consentimento.

Você também pode se opor a um tratamento feito em desacordo com a lei. Parte dos dados pode ser corrigida no próprio aplicativo, em **Meus dados**. Para os demais pedidos, escreva para ${EMAIL_CONTATO} ou chame no WhatsApp ${WHATSAPP_CONTATO}. Podemos pedir informações para confirmar a sua identidade. Os pedidos são atendidos manualmente; a declaração completa de acesso aos dados é fornecida em até 15 dias, como prevê o art. 19. Você também pode apresentar reclamação à Agência Nacional de Proteção de Dados (ANPD).

## 12. Menores de idade

Os aplicativos são destinados a maiores de 18 anos. Não há verificação automática de idade no cadastro do passageiro. No cadastro do motorista, os dados e documentos passam pela análise da Central. Se você souber que um menor criou uma conta, avise pelo canal de privacidade para que ela seja analisada e encerrada.

## 13. Mudanças nesta Política

Esta Política pode ser atualizada quando o serviço ou a lei mudar. A data da última atualização aparece no começo do texto, e a versão em vigor fica disponível nos aplicativos e no endereço https://api.fortalezadigitalsecurity.com.br/api/legal/privacidade.

---

Ao tocar em "Aceito os Termos", você declara ter lido esta Política de Privacidade e concordado com os Termos de Uso.
`;
