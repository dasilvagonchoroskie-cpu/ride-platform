# Fortaleza Move Comércio — guia de teste em celular real (APK 1.0.3)

Escrito em 12/11/2026. Serve para o Evandro instalar o aplicativo e conferir, passo a passo,
sem mexer em tarifa, comissão, carteira nem Moto.

## O que precisa estar pronto

- O APK `fortaleza-comercio-3.apk` (64 bits; o `-32bits` é só para celular antigo). Foi enviado
  anexado no chat e também está na página de versões do GitHub (release `apk-fortaleza-comercio-mais-recente`).
- O servidor de testes de sempre (Render). O app já vem apontando para ele; não há nada para configurar no celular.
- Um e-mail seu que receba o código de entrada (o código chega por e-mail, não aparece na tela).
- A Central aberta (celular ou navegador) com a conta do **dono** — só o dono aprova lojas.

## Instalar

1. Baixe o APK no celular.
2. Se o Android perguntar, permita instalar: Settings ("Configurações") → Apps → Special app access
   ("Acesso especial a apps") → Install unknown apps ("Instalar apps desconhecidos") → escolha o
   navegador ou o gerenciador de arquivos que você usou → ative Allow from this source ("Permitir desta fonte").
   (Os nomes mudam um pouco conforme a marca do celular.)
3. Abra **Fortaleza Move Comércio**. Ele só pede acesso à internet.

## Teste 1 — cadastro e aprovação (pode fazer já; não aciona motorista)

Use **dados de mentira**. Sugestão: nome fantasia "TESTE Padaria Fictícia", CNPJ de exemplo
11.222.333/0001-81 (tem dígitos válidos), responsável com nome qualquer, telefone seu, endereço
de uma rua de Goiatuba.

1. Entrar com e-mail → digite o código recebido → Cadastrar estabelecimento.
2. Preencha tudo e use **Buscar no mapa** no endereço da loja (sem isso o pedido não tem de onde sair).
3. O app deve mostrar "aguardando aprovação" e **não** mostrar "Nova entrega".
4. Na Central → **Comércios** (menu) → toque na loja → **Aprovar** → confirmar.
5. No app, volte ao início: agora aparece "Nova entrega" e as quatro abas (Entregas, Histórico, Gastos, Conta).
6. Confira que a aba **Conta** não tem carteira, crédito nem mensalidade.
7. Teste os caminhos ruins: na Central **Suspender** (pede motivo) → o app deve mostrar o motivo e não deixar pedir;
   **Reativar** volta ao normal. Um CNPJ inválido ou repetido deve ser barrado no cadastro.

## Teste 2 — a chave geral bloqueada (também não aciona motorista)

1. Com a loja aprovada e a chave **bloqueada** (como está de fábrica), toque em **Nova entrega**.
2. Deve aparecer "Entregas ainda não liberadas" e o pedido **não** abre.
3. Na Central → Comércios, o interruptor "Entregas do Comércio liberadas" deve estar desligado
   ("Bloqueado: nenhuma loja consulta preço nem pede entrega").

## Teste 3 — pedido de verdade (SÓ COM SUA AUTORIZAÇÃO EXPRESSA)

Atenção: no banco de produção a **Entrega já está ligada em Goiatuba** (carro e moto, configuração
de teste de 11/11). Ao liberar a chave do Comércio, um pedido de loja **vai para motoristas reais
online em Goiatuba**. Por isso este teste não foi feito e não será feito sem o seu "pode".

Se você autorizar, o jeito seguro é:

1. Só a conta de **teste do motorista** online (nenhum motorista real online na hora).
2. Central → Comércios → ligar **Entregas do Comércio liberadas** (confirma, fica auditado).
3. No app: Nova entrega → encomenda de mentira → quem recebe (seu outro telefone) → veículo
   (só aparece o que a Central permite na cidade) → **Consultar preço** → conferir que é o preço oficial →
   resumo → **Confirmar pedido**.
4. Conferir no app do motorista de teste: loja, endereço de coleta, telefone da loja, quem recebe,
   descrição e observações aparecem na descrição da entrega.
5. Aceitar → coletar → entregar com o código de 4 números (a loja repassa a quem recebe; o motorista
   nunca recebe o código). Acompanhar a linha do tempo no app (atualiza sozinha a cada 8 segundos).
6. Testar também: cancelar pedido, **Repetir** pelo Histórico (só preenche; pede preço e confirmação de novo),
   tela **Gastos** (só soma entregas feitas), queda de rede ao confirmar (modo avião: o app deve dizer que não
   sabe se foi pedido e, ao voltar, não criar entrega duplicada).
7. Ao terminar: **desligar** a chave na Central e cancelar qualquer entrega que sobrou.

## O que me mandar depois

Print ou descrição de qualquer tela estranha, mensagem de erro, texto cortado, botão que não
respondeu, e em que passo aconteceu. Também diga o modelo do celular e a versão do Android.

## O que ainda não existe (já avisado)

Mapa desenhado no acompanhamento (hoje mostra a posição em texto), ícone próprio do app, termos de uso
para lojas (precisa revisão jurídica), aviso por notificação quando a Central decide, outras formas de
pagamento além de dinheiro direto ao motorista.
