# Ligar as duas etapas na conta do dono (Requisição 1, item 3)

**Status: preparado, NÃO ligado.** Só você liga, com o celular na mão.
O recurso já está pronto e testado (teste de ponta a ponta com uma conta de
operador: ligar, senha sozinha não entra, código repetido não entra, código
de recuperação vale uma vez, desligar).

## O que precisa antes

1. Um celular **seu** (de preferência o que vai ficar com você), com o
   aplicativo **Google Authenticator** instalado pela Play Store. Se for o
   celular emprestado, quando trocar de celular você terá que desligar e
   ligar de novo (ou usar um código de recuperação).
2. Um lugar para guardar os **8 códigos de recuperação** fora do celular
   (papel guardado em casa, ou o gerenciador de senhas). Eles aparecem uma
   vez só.
3. A Central aberta (computador, navegador ou o APK) na sua conta de dono.

## Passo a passo (5 minutos)

1. Central → **Configurações** → cartão **Verificação em duas etapas** →
   **Ligar com o Google Authenticator**.
2. No celular: toque em **Abrir no Google Authenticator** (se a Central
   estiver no mesmo celular). Se a Central estiver no computador: no Google
   Authenticator toque em **+** → **Enter a setup key** ("Inserir chave de
   configuração") e digite a chave que aparece na Central
   (botão **Copiar a chave** ajuda).
3. Digite na Central o código de 6 números que apareceu no Google
   Authenticator → **Ligar**.
4. Aparece a janela **Guarde estes códigos**: toque em **Copiar** e guarde os
   8 códigos (passo "O que precisa antes", item 2).
5. Saia da Central e entre de novo: depois da senha (ou do código do e-mail),
   ela pede o código do Google Authenticator. Se pedir, está ligado.

## Se perder o celular do autenticador

- Entre com a senha e, no lugar do código do autenticador, use **um** dos 8
  códigos de recuperação (cada um vale uma vez). Depois desligue e ligue de
  novo no celular novo.
- Sem o celular e sem os códigos: **procedimento excepcional** (abaixo).

## "Esqueci a senha" com as duas etapas ligadas

Desde a Requisição de continuidade (R5): o código do e-mail sozinho não troca
a senha da Central. Depois do código do e-mail e da senha nova, a Central
pede o código do Google Authenticator (ou um de recuperação). Só então a
senha nova passa a valer e os outros aparelhos são desconectados.

## Procedimento excepcional (perdeu o autenticador E os 8 códigos)

Não é atalho: precisa de **você e do responsável técnico**, e tudo fica na
auditoria. Não existe senha mestra.

### Preparar uma vez (você, no GitHub, 3 minutos)

Sem este passo a esteira roda sem esperar a sua aprovação.

1. github.com → repositório `ride-platform` → **Settings** ("Configurações").
2. Menu da esquerda → **Environments** ("Ambientes") → **New environment**
   ("Novo ambiente").
3. Nome: `recuperacao-excepcional` → **Configure environment**
   ("Configurar ambiente").
4. Marque **Required reviewers** ("Revisores obrigatórios") e adicione o seu
   usuário `dasilvagonchoroskie-cpu`.
5. **Save protection rules** ("Salvar regras de proteção").

### Quando precisar

1. O responsável técnico confere o pedido com você (chamada de vídeo) e
   dispara no GitHub: **Actions** ("Ações") → **Recuperacao excepcional do
   dono** → **Run workflow** ("Executar fluxo de trabalho"), com:
   - e-mail da conta do dono;
   - motivo (ex.: "celular roubado em 20/11, códigos de recuperação perdidos");
   - nome do responsável técnico;
   - a frase exata `EU SOU O DONO E ESTOU PRESENTE`.
2. Você recebe o pedido de aprovação no GitHub (e-mail/app do GitHub) →
   **Review deployments** ("Revisar implantações") → marque
   `recuperacao-excepcional` → **Approve and deploy** ("Aprovar e implantar").
3. A esteira, numa transação só:
   - desliga as duas etapas (o celular perdido e os códigos antigos deixam de
     valer);
   - derruba todas as sessões e aparelhos da conta do dono;
   - grava na auditoria (`RECUPERACAO_EXCEPCIONAL_DONO`): motivo,
     responsável técnico, quem disparou e o link da execução.
   Se o e-mail não for de **uma** conta de dono (operador, passageiro, e-mail
   errado), nada é mudado.
4. Você entra na Central com a senha (ou o código do e-mail). A Central abre
   a tela **Ligue a verificação de novo** e só libera o resto depois de ligar
   o Google Authenticator no celular novo e guardar os 8 códigos novos.

Testado num banco de teste local (não no de produção): dono certo, frase
errada, e-mail de operador e tentativa de injeção no e-mail.

## O que muda para a esteira de testes

Nada: o teste de ponta a ponta usa a chave de teste (segredo
`OTP_CHAVE_TESTE` do GitHub) e não depende do autenticador.
