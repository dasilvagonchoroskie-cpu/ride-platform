# Plano: Inteligência + WhatsApp Business no CRM Fortaleza Move

Criado em 04/11/2026. Objetivo: usar o número de WhatsApp Business da plataforma para prestar suporte, com as
conversas dentro do CRM e com IA ajudando o atendimento. **Este arquivo é a memória do projeto:** em uma sessão nova,
leia este arquivo e o `CLAUDE.md` e continue do primeiro marco ainda não concluído (seção 6).

> Fatos sobre WhatsApp/Meta foram pesquisados em 04/11/2026 e mudam com frequência. Antes de implementar cada marco,
> conferir a documentação oficial (developers.facebook.com, "WhatsApp Business Platform") e os termos vigentes.

## 0. Decisão do dono (05/11/2026) e andamento
O dono decidiu seguir com o **pareamento por código em "Dispositivos conectados"**, no número principal, sem número
reserva, assumindo o risco de bloqueio (método não oficial; foi avisado de que "ser dono da conta" não impede o
bloqueio). O plano oficial (seção 1) fica como **migração futura**: o canal é um adaptador (`src/whatsapp/`), então a
troca não reescreve o CRM. Salvaguardas já implementadas: sem importar histórico, grupos/status ignorados, sessão em
`data/wa-auth` (0700, fora de backup/git), fila com pausa e limite de tentativas, só envia com o canal conectado.
**Andamento:** M1, M2, M3 e M4 estão implementados, com testes sobre canal e provedor de IA falsos; **faltam os primeiros
testes reais** (parear e trocar mensagens; chave da IA e "Testar conexão"). Próximo: M5 (base de conhecimento e
resposta automática limitada).

## 1. Decisões (recomendadas para a via oficial)

1. **Canal: API oficial (WhatsApp Business Platform / Cloud API) com "Coexistência".** A coexistência permite manter o
   número no app WhatsApp Business do celular e, ao mesmo tempo, conectá-lo à API. Mensagens do app aparecem no CRM e
   as do CRM aparecem no app; o histórico recente é sincronizado. Alguns recursos do app mudam depois de ativar
   (conferir a lista atual antes: ex.: listas de transmissão e chamadas). Não desinstalar o app (desconecta a conta).
   Exige app WhatsApp Business atualizado (versão mínima citada pelos provedores: 2.24.17).
   **Pareamento:** a coexistência também usa QR code (ou código), mas dentro do fluxo oficial da Meta ("Embedded
   Signup"): o app WhatsApp Business recebe uma mensagem para escanear o QR. O CRM não recebe um "código para colar";
   ele recebe um token trocado de servidor para servidor. Isso **não** é o menu "Dispositivos conectados" do app.
   **Quem pode fazer esse fluxo:** a documentação da Meta diz que o onboarding de usuários do app (coexistência)
   exige ser Solution Partner ou Tech Provider; fóruns de desenvolvedores mostram dúvida se uma empresa que só quer
   conectar o próprio número consegue fazer isso sozinha. Caminhos: (a) **provedor (BSP) com suporte a coexistência**
   faz o signup e entrega API/webhook (mais simples; tem mensalidade do provedor além das mensagens; muitos expõem API
   parecida com a Cloud API, confirmar); (b) virar Tech Provider (processo pesado e sem volta); (c) número dedicado só
   de API, sem o app. Decidir no M0 comparando preço, suporte em português e suporte a coexistência.
2. **Não usar bibliotecas não oficiais** (Baileys, whatsapp-web.js e similares): violam os termos e o número de suporte
   pode ser bloqueado. É o número principal da operação; o risco não compensa. Isso inclui qualquer solução que peça
   para você conectar o CRM em **"Dispositivos conectados"** (o mecanismo do WhatsApp Web): lá só deveriam entrar
   aplicativos oficiais; ferramentas de terceiros que imitam esse pareamento são não oficiais.
3. **IA com o atendente no controle primeiro.** A IA sugere, resume e classifica; o humano aprova. Resposta automática
   só depois, e só para perguntas frequentes com base de conhecimento (marco 5).
4. **IA permitida:** Meta restringe, desde 15/01/2026, assistentes de IA de uso geral distribuídos pelo WhatsApp. Bot de
   suporte da própria empresa continua permitido. Regras: a IA responde só sobre a plataforma (base de conhecimento
   própria), não é o "produto", e as conversas não podem ser usadas para treinar modelo de uso geral.
5. **Provedor de IA:** escolhível em Configurações (Anthropic/Claude, DeepSeek, OpenAI, OpenRouter ou qualquer serviço
   de formato OpenAI), chamado **somente pelo servidor**. As chaves ficam em arquivos 0600 em `data/` ou variáveis de
   ambiente, fora do git, nunca no front-end.
6. **Hospedagem:** o webhook do WhatsApp exige **URL pública com HTTPS**. O Termux no celular não é alcançável de
   fora. Para testes: túnel (ex.: Cloudflare Tunnel). Para produção: servidor com HTTPS (roteiro de quinta-feira no
   `CLAUDE.md`).

## 2. Custos (Brasil, conferir tabela vigente)
- Mensagem livre dentro da **janela de 24 h** (aberta quando o cliente escreve) é gratuita; a janela renova a cada
  mensagem do cliente. Isso cobre quase todo suporte.
- Fora da janela só vale **template aprovado**, cobrado por mensagem entregue (marketing > utilitário). Utilitário
  dentro da janela aberta é gratuito. Cobrança é por mensagem desde 01/07/2025.
- Mensagens enviadas pelo app WhatsApp Business continuam gratuitas.
- IA: custo por uso da API de IA (por mensagem processada). Definir teto mensal e alerta.

## 3. O que o dono precisa providenciar
- Conta **Meta Business** (business.facebook.com) e **verificação da empresa** (CNPJ/documentos).
- App no **Meta for Developers** com o produto WhatsApp; WABA vinculada ao número.
- Número em **WhatsApp Business app** já ativo (para coexistência). Não pode estar conectado a outro provedor de API.
- **Escolher o provedor (BSP)** que fará o pareamento oficial da coexistência (ver seção 1) ou decidir pelo número dedicado.
- Token permanente (usuário do sistema), ID do número, ID da conta, **App Secret** e um **token de verificação do webhook**.
- Chave da API do provedor de IA escolhido (marco 4 em diante), com saldo/recarga na conta dele.
- Textos para a base de conhecimento (perguntas frequentes, regras, preços, prazos, política de atendimento).
- Aviso de privacidade/consentimento (LGPD) para o atendimento por WhatsApp e uso de IA.

## 4. Arquitetura
**Entrada:** `GET /webhooks/whatsapp` (verificação da Meta) e `POST /webhooks/whatsapp` (mensagens e status).
- Validar a assinatura `X-Hub-Signature-256` com o App Secret (corpo bruto, comparação em tempo constante).
- Responder 200 rápido e processar em seguida; **idempotência** pelo id da mensagem (a Meta reenvia).
- Rota pública, sem sessão: fora do `requireAuth`, com limite de taxa e corpo máximo.

**Dados novos (SQLite):** `wa_contatos` (telefone em E.164, nome, vínculo com motorista/passageiro/parceiro),
`wa_conversas` (contato, situação aberta/pendente/resolvida, responsável, não lidas, última mensagem, fim da janela de
24 h), `wa_mensagens` (direção, tipo, texto, id externo único, situação de entrega, erro, criado em), `wa_templates`
(nome, idioma, categoria, situação), `ia_registros` (conversa, tarefa, entrada resumida, saída, custo, aprovado por).
Mídia (áudio, imagem, documento): baixar da Meta (link expira), guardar em `data/` com limite de tamanho e tipos.

**Saída:** envio via Graph API com fila e novas tentativas; bloquear texto livre fora da janela de 24 h (oferecer
template); registrar status (enviada, entregue, lida, falhou) vindo do webhook.

**Interface:** nova tela "Conversas": lista com não lidas e busca, conversa, atribuir a um gestor, marcar resolvida,
criar tarefa e cadastrar motorista/passageiro/parceiro a partir da conversa, alerta de janela de 24 h. Usa o padrão atual
(JS puro, `ui.esc` em tudo, sem scripts inline por causa da CSP).

**Permissões:** definir em `src/policy.js` quem vê conversas (sugestão: admin e gestor), quem envia template e quem
configura integração e IA (admin). Toda ação relevante vai para a auditoria.

## 5. Inteligência (do mais seguro ao mais autônomo)
- **A. Assistente do atendente:** resumo da conversa; classificação (assunto, urgência, perfil: motorista, passageiro,
  parceiro); extração de dados (nome, cidade, placa etc.) para preencher o cadastro; **sugestão de resposta** que o
  atendente edita e envia. Nada é enviado sozinho.
- **B. Base de conhecimento:** perguntas frequentes e regras da plataforma gerenciadas no CRM; a IA só responde com
  base nelas; se não souber, diz que vai passar para um humano.
- **C. Resposta automática limitada:** só para temas liberados (ex.: como se cadastrar, documentos exigidos), em
  horário definido, com "falar com atendente" sempre disponível, transferência para humano em reclamação, urgência ou
  pergunta fora do escopo, e **nunca inventar** preço, prazo ou regra.
- **D. Automação de acompanhamento:** sugerir follow-up e tarefas a partir das conversas.
- **Áudios:** o CRM precisa de um serviço de transcrição à parte (a API de IA usada aqui trata texto e imagem). Decidir
  depois se vale o custo.

**Proteções obrigatórias:** humano no controle nas fases A e B; registro de tudo que a IA gerou; enviar à IA só o
mínimo necessário (sem documentos, senhas ou dados desnecessários); teto de gasto e limite por conversa; resposta da IA
tratada como texto não confiável (nunca executada, sempre escapada); defesa contra injeção de prompt (a mensagem do
cliente é dado, não instrução); opção "falar com humano"; regras de retenção e exclusão (LGPD).

## 6. Marcos (fazer na ordem; cada um termina com testes e README/CLAUDE.md atualizados)
- [ ] **M0 — Base pronta:** CRM rodando no servidor definitivo com HTTPS (roteiro de quinta-feira) ou túnel para teste;
  **provedor (BSP) escolhido** (ou decisão por número dedicado) e número pareado em modo de teste.
- [~] **M1 — Recebimento (feito sobre o canal por pareamento; falta validar no WhatsApp real):** webhook com assinatura e idempotência; tabelas; tela "Conversas" somente leitura.
  Aceite: mensagem enviada ao número aparece no CRM, uma vez só, vinculada ao contato pelo telefone.
- [~] **M2 — Envio (feito; falta validar no real; sem templates/janela de 24 h, que são da via oficial):** responder pelo CRM; janela de 24 h; status de entrega; templates; coexistência testada (o que
  se responde no app aparece no CRM e vice-versa). Aceite: ida e volta funcionando, bloqueio fora da janela.
- [~] **M3 — Integração com o CRM (feito: vínculo por telefone e manual, tarefa, atribuição, resolvida, busca, auditoria; falta criar cadastro a partir da conversa):** vínculo com motorista/passageiro/parceiro, criar cadastro e tarefa a partir da
  conversa, atribuição, resolvida, busca, auditoria. Aceite: atendimento completo sem sair do CRM.
- [x] **M4 — IA assistente (implementada; falta validar com a API real e conversas reais):** resumo, classificação, extração e sugestão de resposta, com registro e teto de
  custo. Aceite: atendente usa sugestões; nada é enviado sem clique.
- [ ] **M5 — Base de conhecimento e resposta automática limitada (fases B e C).** Aceite: teste com roteiro de
  perguntas (inclusive tentativas de burlar o bot) sem resposta inventada; transferência para humano funcionando.
- [ ] **M6 — Relatórios:** tempo de resposta, volume por assunto, custo de IA e de templates.

## 7. Riscos e pontos de atenção
- Coexistência é considerada menos estável que número dedicado de API; se o app ficar muito tempo sem uso ou for
  desinstalado, a conexão pode cair. Avaliar número dedicado só para a API se isso virar problema.
- Se o pareamento depender de um provedor, o CRM passa a depender dele (preço, estabilidade, formato da API). Isolar o
  envio/recebimento atrás de uma camada própria (adaptador) para poder trocar de provedor sem reescrever o CRM.
- Políticas da Meta mudam (IA, categorias de template, preços). Rever os termos antes de cada marco.
- Qualidade do número: enviar marketing em excesso derruba a classificação do número. Só falar com quem escreveu ou deu consentimento.
- Segredos (token da Meta, App Secret, chave de IA) apenas em `.env` no servidor, fora do git e dos backups em Downloads.
- Mensagens e telefones são dados pessoais (LGPD): base legal, aviso, retenção, exclusão a pedido, acesso por perfil.

## 8. Como retomar em uma sessão nova
Cole no chat, junto com o zip mais recente do CRM:

> Leia o CLAUDE.md e o PLANO-IA-WHATSAPP.md do projeto. Continue do primeiro marco não concluído. Antes de mexer no
> código, me diga em que marco estamos e o que falta eu providenciar.
