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
- Sem o celular e sem os códigos: só eu, com acesso ao banco e com você
  presente, consigo desligar (fica registrado).

## O que muda para a esteira de testes

Nada: o teste de ponta a ponta usa a chave de teste (segredo
`OTP_CHAVE_TESTE` do GitHub) e não depende do autenticador.
