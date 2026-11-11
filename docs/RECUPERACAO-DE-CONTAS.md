# Recuperação de contas

Requisição 1, item 5 (proposta, 11/11/2026). As regras R1–R5 foram aprovadas
pelo Evandro na **Requisição de continuidade** (11/11/2026) e implementadas
no PR #56.

## Como funciona agora

| Quem | Como recupera | Proteções |
|---|---|---|
| Passageiro | "Esqueci minha senha": código no e-mail (ou no telefone quando houver SMS) + senha nova; ou entrar só com o código | código de 6 números, vale 5 min, 5 tentativas, uso único; no máximo 6 códigos por hora para o mesmo contato; limite de pedidos por minuto |
| Motorista | Entra pelo código (telefone ou e-mail); conta já existente: "vincular conta" com código | igual |
| Central (dono e operador) | "Esqueci a senha": código no e-mail da Central + senha nova | com duas etapas ligadas, a senha nova **só passa a valer depois** do código do Google Authenticator (R5) |
| Central com duas etapas | Perdeu o celular do autenticador: um dos **8 códigos de recuperação** (cada um vale uma vez) | os códigos só aparecem uma vez, quando liga |
| Central sem autenticador **e** sem os 8 códigos | Procedimento excepcional (R5, abaixo) | dono + responsável técnico, aprovação do dono no GitHub, auditoria |
| Passageiro/motorista sem telefone antigo **e** sem e-mail | "Recuperar acesso" na Central, **só o dono** (R3) | documento com foto conferido, auditoria |
| Qualquer um | Celular perdido/vendido: o dono desconecta **todos** os aparelhos ou **um só** | auditoria |

## Regras aprovadas e como ficaram

### R1 — Troca ou recuperação de senha ✅ implementado

- Trocar a senha (logado) ou recuperar ("Esqueci minha senha") derruba **na
  hora** todos os outros aparelhos da conta: as renovações são revogadas e o
  acesso de 15 min que já estava aberto **também cai** (não espera vencer).
- Só o aparelho que fez a troca continua conectado (o servidor guarda qual é
  em `users.metadata.sessoesExceto`).
- Token sem aparelho (versões antigas dos apps) também cai.
- Testado: automático (servidor) e no servidor real (ponta a ponta, ver o
  relatório da execução da madrugada).

### R2 — Troca de telefone e de e-mail ✅ implementado (com uma ressalva)

- Trocar o telefone exige o **código enviado ao e-mail da conta**. Esse
  código **nunca aparece na tela**, nem com `OTP_DEBUG_RETURN` ligado.
- Conta sem e-mail: não troca o telefone ("cadastre e confirme um e-mail em
  Meus dados primeiro").
- Trocar o e-mail exige o **código enviado ao e-mail novo** (prova que é da
  pessoa). O e-mail antigo recebe o aviso (R4).
- Depois de trocar o e-mail, o telefone só pode ser trocado **48 h depois**
  (quem tomou uma sessão não troca e-mail e telefone em seguida).
- E-mail e telefone no mesmo pedido: recusado.
- Motorista: telefone e e-mail mudam por pedido à Central; agora **só o dono**
  aprova ou muda telefone/e-mail (operador de cidade não). Os outros dados
  (endereço, Pix, CNH) o operador da cidade continua aprovando.
- **Ressalva (conflito técnico):** "exigir confirmação do novo telefone" só é
  possível com SMS, que não existe hoje (custa dinheiro; sem SMS o código do
  telefone vai para o e-mail). Hoje a prova é o e-mail confirmado + o número
  novo não pode ser de outra conta. Quando o SMS for contratado, a
  confirmação do número novo entra no mesmo fluxo (pendência registrada).

### R3 — Perdeu o telefone antigo **e** o e-mail ✅ implementado

- Central → Motoristas ou Passageiros → abrir a pessoa → **Recuperar acesso**
  ("Recover access"). Só aparece e só funciona para o **dono**; o servidor
  recusa operador de cidade.
- O dono confere por **chamada de vídeo ou pessoalmente** um documento com
  foto e marca: rosto igual ao da foto, nome igual, CPF igual e, para
  motorista, número da CNH igual ao do cadastro.
- **Nada do documento é enviado nem guardado** (nem foto, nem número): só o
  tipo (CNH, RG, outro com foto) e as marcações.
- Faltou uma conferência: **não libera**, ninguém é derrubado, e fica
  registrado como RECUSADA.
- Liberado: aviso (R4), todos os aparelhos caem, o e-mail novo (obrigatório)
  entra no lugar, a **senha antiga deixa de valer** e a pessoa entra com o
  código que chega no e-mail novo e cria outra senha.
- Auditoria (`audit_logs`, ação `RECUPERACAO_ASSISTIDA`): quem fez, motivo,
  tipo de documento, conferências, campos trocados e resultado — sem o
  e-mail/telefone novos.
- **Selfie com prova de vida: avaliada e não implementada.** Fazer direito
  exige um serviço pago de verificação de presença (para não aceitar foto de
  foto) e guardar biometria, que é dado sensível na LGPD. A chamada de vídeo
  com o dono cumpre o mesmo papel sem guardar nada. Se um dia houver volume,
  avaliar um serviço especializado (decisão sua, tem custo).

### R4 — Avisos de segurança ✅ implementado

- Senha trocada, senha recuperada, telefone trocado, e-mail trocado,
  recuperação pela Central e duas etapas redefinidas mandam:
  - e-mail para o endereço cadastrado (na troca de e-mail, também o antigo);
  - aviso (push) para os aparelhos ainda ligados, antes de serem
    desconectados;
  - registro no sino de notificações da conta.
- O texto diz o que aconteceu, a data e a hora de Brasília e o que fazer se
  não foi a pessoa ("Esqueci minha senha" + e-mail da Central). Nunca leva
  código, telefone ou documento.
- Contas do teste automático não recebem e-mail.

### R5 — Conta do dono da Central ✅ implementado

- "Esqueci a senha" da Central com duas etapas ligadas: o código do e-mail
  **não basta**. A senha nova só é gravada depois do código do Google
  Authenticator (ou de um código de recuperação). Antes, a senha mudava
  primeiro e o autenticador era pedido depois.
- Perdeu o autenticador **e** os 8 códigos: **procedimento excepcional**
  (`docs/DUAS-ETAPAS-DONO.md`, "Procedimento excepcional"):
  - roda só pela esteira "Recuperacao excepcional do dono" do GitHub;
  - o responsável técnico dispara com o motivo e a frase de confirmação;
  - o dono aprova no GitHub (ambiente `recuperacao-excepcional`);
  - desliga o autenticador antigo, apaga os códigos antigos, derruba todas
    as sessões e grava na auditoria (`RECUPERACAO_EXCEPCIONAL_DONO`);
  - a Central fica travada até o dono ligar o Google Authenticator de novo
    no celular novo.
- Não existe senha mestra nem atalho no aplicativo ou no servidor para isso.
- **Achado relacionado (A9, `docs/SEGURANCA-CENTRAL.md`):** a chave do teste
  automático (`OTP_CHAVE_TESTE`) hoje entra na conta do dono sem as duas
  etapas. Precisa de decisão sua antes de mudar (afeta as esteiras).

## Pendências desta parte

- Ambiente `recuperacao-excepcional` no GitHub com você como aprovador
  (passo a passo em `docs/DUAS-ETAPAS-DONO.md`). Sem isso, a esteira roda sem
  esperar a sua aprovação.
- Decisão A9 (chave do teste e conta do dono).
- Confirmação do número novo por SMS (quando houver SMS).
- Teste no celular real: roteiro L–P em `docs/TESTE-DE-RUA.md`.
