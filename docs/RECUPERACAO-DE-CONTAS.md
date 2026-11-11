# Recuperação de contas (Requisição 1, item 5)

Data: 11/11/2026. **Nada aqui foi implementado sem decisão sua.** Abaixo:
o que já existe, as regras seguras que eu proponho e os casos que dependem
de você.

## O que já existe hoje

| Quem | Como recupera | Proteções |
|---|---|---|
| Passageiro | "Esqueci minha senha": código no e-mail (ou no telefone quando houver SMS) + senha nova; ou entrar só com o código | código de 6 números, vale 5 min, 5 tentativas; limite de pedidos por minuto |
| Motorista | Entra pelo código (telefone ou e-mail); conta já existente: "vincular conta" com código | mesmo do código acima |
| Central (dono e operador) | "Esqueci a senha": código no e-mail da Central + senha nova | com duas etapas ligadas, ainda pede o código do autenticador |
| Central com duas etapas | Perdeu o celular do autenticador: um dos **8 códigos de recuperação** (cada um vale uma vez) | os códigos só aparecem uma vez, quando liga |
| Qualquer um | Celular perdido/vendido: a Central (só o dono) desconecta **todos** os aparelhos ou **um só** | registro na auditoria |

Lacunas encontradas:

- Ao trocar/recuperar a senha, as renovações caem, mas o acesso que já estava
  aberto em outro celular dura até 15 minutos (achado A4 da revisão).
- Enquanto `OTP_DEBUG_RETURN` estiver ligado, conta **sem e-mail** recebe o
  código na tela — qualquer pessoa que souber o telefone entra. Só é seguro
  depois de desligar (antes da loja).
- Não há caminho para quem perdeu o número **e** não tem e-mail.

## Regras que eu proponho (seguras e simples)

| # | Regra proposta | Por quê |
|---|---|---|
| P1 | Recuperar ou trocar a senha **derruba todos os aparelhos** da conta na hora; só o aparelho que fez a recuperação continua | quem roubou a senha perde o acesso imediatamente |
| P2 | Trocar o **telefone** da conta: só depois de entrar com o **e-mail** já cadastrado (código no e-mail) **e** confirmar o telefone novo com código | evita tomar a conta só com um chip |
| P3 | Sem e-mail e sem o telefone antigo: **só o dono da Central** pode liberar, depois de conferir documento com foto (motorista: o mesmo CPF/CNH do cadastro); fica registrado na auditoria com o motivo | operador de cidade não libera conta (risco de golpe interno) |
| P4 | Toda recuperação manda aviso ("sua senha foi trocada") para o e-mail e os aparelhos da conta | a pessoa percebe se não foi ela |
| P5 | Conta da Central: recuperação **nunca** pula as duas etapas; perdeu autenticador **e** códigos → só com acesso ao banco (você + eu), com registro | protege a conta que manda em tudo |

## Decisões que dependem de você

- **R1** — Aprova P1 (derrubar todos os aparelhos ao recuperar/trocar senha)?
- **R2** — Aprova P2 (trocar telefone só com o e-mail cadastrado)? E quem não
  tem e-mail cadastrado: obrigar cadastrar e-mail no primeiro acesso?
- **R3** — Aprova P3? Só o dono libera, ou operador da cidade também pode?
  Que documento vale (foto do documento + selfie? só CNH para motorista?)
- **R4** — Aprova P4 (aviso de senha trocada)?
- **R5** — Aprova P5 para a conta do dono?

Assim que você responder, eu implemento o que for aprovado, com testes
automáticos e no teste de ponta a ponta.
