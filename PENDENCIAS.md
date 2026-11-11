# PENDÊNCIAS — Fortaleza Move

Atualizado em 05/11/2026: Clube de Vantagens (seção 0). Antes, 30/10/2026 (fim da tarde): carro no sentido da rua, cor pela disponibilidade e GPS mais preciso (pedido de 30/10 15:20, montagem 285). Antes: pedido de 30/10 01:37 em 7 etapas — etapas 1 a 5 feitas, etapa 6 (ícones) esperando os 3 símbolos, etapa 7 (loja) feita.
Este arquivo diz o que foi **verificado com teste real**, o que é **só teste automático/simulado** e o que **não existe ou não tem teste**.

Legenda: **[REAL]** testado de verdade (servidor real, Android de teste ou esteira) · **[AUTO]** só teste automático, com dados de mentira · **[SEM TESTE]** existe, mas nada testou · **[NÃO EXISTE]** ainda não foi feito.

---

## 00000000. Requisição de continuidade — recuperação de contas R1–R5 (11/11/2026, PR #56)
- [REAL] Ponta a ponta no servidor de verdade (execução 86, 11/11 18:54, autorizada pelo Evandro porque a plataforma ainda não opera): 385 OK, 4 falhas, 4 pulados. Todos os 23 cenários novos de R1, R2, R3 e abuso de códigos passaram. Falhas: as 3 da carteira (intencionais) + 1 "Central carrega cadastros pendentes" que recebeu a página do Render no lugar da resposta: o Render estava trocando de versão naquele minuto por causa de um envio só de documentos de outra sessão (21:53–21:54 UTC). Não é defeito do código; é exatamente o problema que o Build Filter resolve.
- [REAL] R1: trocar/recuperar a senha derruba na hora os outros aparelhos (acesso de 15 min já aberto também cai); só o aparelho que trocou continua.
- [REAL] R2: telefone só muda com código no e-mail da conta (nunca na tela, mesmo com OTP_DEBUG_RETURN); conta sem e-mail não troca telefone; e-mail novo só com código no e-mail novo (app do passageiro pede o código); 48 h entre trocar e-mail e telefone; operador de cidade não aprova nem muda telefone/e-mail.
- [NÃO EXISTE] R2: confirmar o número novo por código no próprio número — depende de SMS (pago). Até lá a prova é o e-mail confirmado.
- [REAL] R3: "Recuperar acesso" na Central (só o dono), conferências do documento sem guardar o documento, auditoria LIBERADA/RECUSADA; e-mail novo obrigatório, senha antiga apagada. Selfie com prova de vida avaliada e não feita (custo + biometria).
- [AUTO] R4: aviso de segurança no e-mail (antigo também, na troca) e nos aparelhos, sem dado pessoal; endereços de teste não recebem.
- [AUTO] R5: "Esqueci a senha" da Central com duas etapas só grava a senha depois do código do autenticador; procedimento excepcional por esteira com aprovação do dono e auditoria (testado num banco de teste local, não em produção); Central travada até ligar o autenticador de novo.
- [AUTO] Despacho manual da Central não manda corrida de teste para motorista real (e vice-versa). O automático já separava.
- [AUTO] Código de 6 números não vai mais para o registro (log) do servidor.
- Esteiras: publicar o servidor só quando muda o servidor; teste de ponta a ponta todo dia às 04:37 (Brasília), MUDAR_CONFIG=nao, e não mais logo depois de publicar.
- [SEM TESTE] Separação do CRM no Render: falta o Evandro pôr o **Build Filter** (docs/RENDER-SEPARAR-CRM.md). Depois disso eu testo (envio só de documento não publica; envio do servidor publica uma vez).
- Pendentes do Evandro: criar o ambiente `recuperacao-excepcional` no GitHub com ele como aprovador (docs/DUAS-ETAPAS-DONO.md); decidir o achado **A9** (chave do teste entra na conta do dono sem as duas etapas — proposta: conta de serviço para as esteiras); Build Filter do Render; ligar as duas etapas com o próprio celular; roteiro L–P no celular (docs/TESTE-DE-RUA.md); desligar OTP_DEBUG_RETURN antes da loja (com as contas de revisão do Google prontas).

## 0000000. Requisição 1 — aparelhos, cofre, segurança da Central (11/11/2026, PR #54, APKs 391)
- [REAL] Servidor no ar com: código único por instalação, desconectar UM aparelho (só o dono, com auditoria), renovação presa ao mesmo aparelho, aviso (push) ligado ao aparelho da sessão. Teste de ponta a ponta (execução 85: 363 OK, 3 falhas da carteira que são intencionais, 4 pulados por não mexer em produção): dois celulares na mesma conta, desconecta um, o outro continua; motorista desconectado cai na hora; pedido Popular não toca no carro Conforto.
- [REAL] Correção de segurança: operador da cidade só vê/muda dados pessoais dos motoristas da cidade dele; passageiros só o dono (4 testes automáticos).
- [AUTO] Passageiro e motorista: login e código do aparelho no cofre do celular (flutter_secure_storage 10.0.0 travado); sessão antiga migra sem deslogar; serviços nativos leem o mesmo cofre (CofreNativo.java). Testes automáticos passam (motorista 119, passageiro 106, Central 66). **Falta prova no celular**: instalar o APK 391 por cima do antigo e continuar logado (roteiro A em docs/TESTE-DE-RUA.md).
- Teste de ponta a ponta agora NÃO grava configuração de produção (MUDAR_CONFIG=nao): aparência, aviso de saldo, tarifas e Conforto na cidade aparecem como "PULADO".
- Documentos: docs/SEGURANCA-CENTRAL.md, docs/RECUPERACAO-DE-CONTAS.md (decisões R1–R5), docs/DUAS-ETAPAS-DONO.md (não ligado), docs/TESTE-DE-RUA.md (roteiro A–K), docs/MIGRACAO-HOSTINGER.md (só plano; decisão M1/M2), docs/GOOGLE-PLAY.md + docs/loja/TEXTOS-DA-LOJA.md + recurso gráfico 1024×500.
- Risco de prazo: conta pessoal da Google Play exige 12 testadores por 14 dias + até 7 dias de análise (≈ 3 a 4 semanas).
- Risco operacional: todo envio ao `main` (inclusive relatórios da esteira e o CRM) republica o servidor no Render (~30 s fora). Encaminhado na Requisição de continuidade (seção acima).
- Pendentes do Evandro: R1–R5 aprovadas e feitas (seção acima); Hostinger: direção M1 (sem executar); ligar duas etapas; roteiro no celular.

## Prazo: Play Store em menos de um mês (dito em 11/11/2026)
- Meta do Evandro: plataforma blindada e 100% funcional, publicada na Play Store, até o começo de dezembro/2026.

## 000000. Comissão, categoria e mapa (11/11/2026, PR #50, APKs 383)
- Feito: taxa pelo que o taxímetro marcou mesmo sem medição do celular; chamada só para a categoria escolhida; mapa sem fila de imagens canceladas; Central web com conexão antecipada.
- R$ 40,01 da corrida 886794 (10/11): era teste, Evandro decidiu não devolver.
- Preço fechado continua cobrando o estimado mesmo se a viagem acabar logo (é a regra do modo).
- Conferir no celular: motorista Conforto não recebe mais pedido Popular (e vice-versa); tempo do mapa da Central em Goiatuba.

## 00000. Visual premium (11/11/2026, PR #48, APKs 378)
- Feito: marinho e dourado em todas as telas dos 3 aplicativos e da Central na web; mapa claro normal; testes, análise e compilação passaram (execução 378).
- Falta conferir no celular de verdade: botão "Google Maps" do motorista numa linha só, leitura dos textos ao sol, e se o Evandro quer ajustes de gosto em alguma tela.
- A bandeira do país na tela de telefone do passageiro aparece como desenho quebrado nas fotos do emulador (falta de fonte de emoji no emulador); conferir no celular.

## 0000. Permissões por fabricante, moto, encomenda e Central na web (10–11/11/2026, PRs #41 a #44)
- Feito: motorista e passageiro identificam o celular e mostram os ajustes da marca (Xiaomi, Samsung, Oppo/Realme/OnePlus, Vivo, Huawei, Honor, Asus); cadastro de moto (CNH A); categoria Moto criada DESLIGADA (70% do Popular); encomenda com escolha Moto/Carro e tarifa Entrega de moto (75%); Central na web em https://fortaleza-move-central.onrender.com, instalável (PWA). APKs 364.
- Pendente com o Evandro: ligar a Moto (Central → Categorias) e as entregas (Central → Entregas) quando tiver motoqueiro aprovado; ajustar as tarifas sugeridas.
- Pendente técnico: testar "Abrir ajuste" em celulares de outras marcas (só o Redmi 12 foi provado de verdade); autorizações por fabricante no iPhone quando houver build iOS; incluir a escolha moto/carro da encomenda no teste de ponta a ponta.
- Teste de ponta a ponta: 3 falhas da carteira enquanto "bloquear motorista sem saldo" estiver ligado (o teste supõe desligado).

## 000. Celular vendido (09/11/2026, PRs #32 a #35)
- Feito: corte de sessões na hora, botão Desconectar aparelhos na Central, esteira Desconectar aparelhos. Todas as contas reais derrubadas em 10/11 01:00 UTC.
- [x] 11/11: os apps mandam o aparelho no login (PR #54).

## 00. Auditoria de segurança e qualidade (06/11/2026, PRs #29 e #30)
Corrigido e testado:
- Banco: RLS ligado em todas as tabelas do Supabase (a API pública do Supabase não lê mais nada). Conferido pelo ponta a ponta (rota da Central /admin/seguranca/banco).
- Servidor: Swagger (mapa da API) fora da produção; corpo de até 256 KB fora dos envios de foto (4 MB só em /foto e /logo), 413 para envio grande e 400 para JSON quebrado; limite de pedidos por cliente (antes todos dividiam o mesmo limite atrás do Render); CORS sem "credentials" quando aberto.
- Apps (3): sem backup na nuvem e sem passar dados para outro celular (token e login ficam só no aparelho); código Dart embaralhado na versão final.
- Visual: testes com celular pequeno (320 dp) e letra 30% maior nas telas principais dos 3 apps; 2 estouros corrigidos no motorista (valor da corrida e cartão do carro). Fotos das telas revisadas.
- Já estava certo (conferido): permissões por papel e por cidade, corrida só para quem participa, aceitar só corrida oferecida (com trava), OTP com limite e tentativas, refresh de uso único, 2FA da Central, senha com bcrypt, HTTPS obrigatório e cabeçalhos de proteção, chave do mapa só com login, sem chave no APK, R8 ligado, sem tráfego sem HTTPS.
Pendências da auditoria:
- [OK do Evandro] Zod 4 e Nest 11: fecham 1 alerta alto (Zod, já reduzido pelo limite de 256 KB) e 3 moderados que não se aplicam (file-type e SSE não são usados).
- [Recomendado] Guardar o login no cofre do Android (flutter_secure_storage) em vez do armazenamento comum.
- [Play Console] Declarar: localização em primeiro plano (motorista), serviço de dados (passageiro), tela cheia para chamada (USE_FULL_SCREEN_INTENT) e sobreposição (SYSTEM_ALERT_WINDOW) do motorista.
- [Antes da loja] Endereço próprio do servidor (api.<domínio>) e AAB definitivo; depois a mudança para a Hostinger KVM 2.

## 0. Clube de Vantagens (05/11/2026, PRs #20, #21 e #23)
- Carteirinha sem QR Code e sem página de consulta (pedido do Evandro 05/11 16:10): verde APTO / vermelha NÃO APTO.
- [AUTO] Servidor: regra da recarga (SOMA de R$ 100 em 30 dias, só recarga confirmada, sai da soma depois de 30 dias). Jest 127.
- [AUTO] Central 54 testes; Motorista 103 testes (lista, mapa, WhatsApp, detalhe, vazio, erro, carteirinha verde e vermelha com foto, bússola lembra o norte).
- [REAL] Ponta a ponta execução 78: 374 OK, 0 falhas (sem recarga, R$ 50, R$ 50+60 = APTO, suspenso, app não bloqueado). APK motorista 317.
- Ramo diagnostico-clube ficou no GitHub (só leitura, não roda sozinho); o Claude não consegue apagar ramo por aqui.
- Limitações: o sistema não tem recarga "pendente/cancelada" — a recarga só existe quando a Central lança o crédito. Se a Central lançar errado e tirar com "Remover saldo", a recarga continua contando para o clube.
- [NÃO EXISTE] Parceiros de verdade (esperando o Evandro).

## 1. Resultado real dos testes (30/10/2026, tarde)

| O quê | Resultado | Onde ver |
|---|---|---|
| Servidor: testes automáticos | **109 passaram, 0 falharam** (18 grupos; novo: carros por perto com rumo) | rodado aqui (`jest`) |
| App do passageiro: análise / testes de tela | nenhum problema / **93 passaram, 0 falharam** (12 pulados: fotos) | logs/analyze-mobile_passenger.txt, logs/test-mobile_passenger.txt |
| App do motorista: análise / testes de tela | nenhum problema / **91 passaram, 0 falharam** (7 pulados) | logs/analyze-mobile_driver.txt, logs/test-mobile_driver.txt |
| Central: análise / testes de tela | nenhum problema / **51 passaram, 0 falharam** (1 pulado) | logs/analyze-central_app.txt, logs/test-central_app.txt |
| Teste de ponta a ponta no servidor real | **349 etapas, 0 falhas** (30/10 18:45 UTC; novas: rumo do carro por perto e da corrida, id estável, leitura imprecisa ignorada) | logs/teste-ponta-a-ponta.txt |
| Gerador de ícones | **0 falhas** (transparente, fundo branco, xadrez desenhado e fundo preto) | `python3 scripts/testar-icones.py` |
| APKs 285 | nome no celular, ícone redondo, alvo API 36 e 16 KB conferidos **dentro do APK** pela esteira; chave da TomTom não está dentro; figuras novas do carro e da moto (3 cores) dentro do passageiro e do motorista | esteira Android APKs (montagem 285) |

Ambiente: **não existe Flutter nem Android SDK no computador do Claude** (a internet daqui bloqueia o download). Tudo que é Flutter roda no GitHub Actions.

---

## 2. Riscos em ordem (maior primeiro)

1. **Chamado com a tela apagada / app fechado — [AUTO].** Falta o teste de rua (roteiro em docs/TESTE-DE-RUA.md).
2. **Notificação push chegando no celular — [SEM TESTE] no aparelho.** O servidor aceita a chave do Firebase (conferido em todo ponta a ponta).
3. **GPS na rua, taxímetro e posição — [AUTO].** Falta corrida de rua.
4. **Mapa num celular de verdade em Goiatuba — [SEM TESTE].** Medido só no Android de teste.
5. **Antes da loja: desligar o código na tela (`OTP_DEBUG_RETURN`).** Ligado, conta só com telefone (sem e-mail) recebe o código na tela. Precisa das contas de revisão do Google antes (docs/GOOGLE-PLAY.md, 5.5 e 6.5).
6. **Cota grátis da TomTom é POR MÊS — [REAL no servidor].** Alerta a 70% e modo economia a 80%. **Chamadas por corrida completa (medido no servidor real): 7, sendo 4 rotas** (eram 11 e 8). **Entrega: 4 rotas, igual à corrida.** Ressalva do contrato em docs/TOMTOM-TERMOS.md (para o sócio).
7. **Repositório público — pendente do Evandro.** Passo a passo: docs/PASSO-A-PASSO-EVANDRO.md, item 1. Quando disser "repositório privado", eu confiro o Render e as esteiras.
8. **Chave da TomTom chega ao celular de quem está logado — [REAL].** Falta o Evandro criar a chave só de imagens (`TOMTOM_API_KEY_MAPA`, passo a passo item 2.2).
9. **Termos da TomTom sobre guardar dados — decisão do sócio** (docs/TOMTOM-TERMOS.md).
10. **Verificação em duas etapas da Central — [REAL], mas DESLIGADA na conta do dono** (passo a passo, item 3).
11. **Restauração da cópia do banco — [SEM TESTE] num banco de verdade** (passo a passo, item 4).
12. **Entregas — [REAL] no servidor, DESLIGADAS em todas as cidades.** Tarifa "Entrega" começa igual ao Popular (ajustar antes de ligar). Texto dos Termos (7-A) é **PROVISÓRIO**. 12 decisões para o Evandro e o sócio em docs/ENTREGAS.md. Código de entrega vai pelo WhatsApp (sem SMS).
13. **Categorias Conforto e Premium — [REAL], mas DESLIGADAS** (docs/CIDADE-NOVA.md, passo 10).
14. **Endereço do servidor é o do Render.** Antes da loja: domínio próprio (docs/GOOGLE-PLAY.md, item 2).
15. **Google Play — conta de organização (CNPJ + D-U-N-S, até 28 dias).** Lista completa: docs/GOOGLE-PLAY.md. Regra nova: desde 30/09/2026, no Brasil, apps das lojas precisam estar registrados em desenvolvedor verificado; para APK instalado direto a regra vale a partir de 2027 (registrar também a Central).
16. **Dependências do servidor:** zod (só no zod 4), @nestjs/core e file-type (só com o Nest 11). Troca grande: **só com o seu OK**.
17. **Pagamento com cartão — [NÃO EXISTE], por decisão.** "Meus cartões" mostra só "Em breve".
18. **Banco grátis de 500 MB com as fotos dentro.** Aperta perto de 250–300 motoristas com documentos. A foto do comprovante de entrega (Fase 2) vai fora do banco (plano em docs/ENTREGAS.md).
19. **E-mail só pelo Gmail (~100 por dia).**
20. **Ícones novos — APLICADOS (30/10, montagem dos ícones).** Passageiro: alfinete com pessoa, carro e estrada; motorista: carro com volante; Central: mapa com alfinete. Amarelo sobre #0070B8 a 60%, redondo, legado, monocromático do Android 13+, Play 512 e iPhone. Os PNG vieram transparentes, com uma névoa quase invisível em volta (removida). **[REAL na esteira]** (ícone redondo e monocromático conferidos dentro do APK); **[SEM TESTE]** na tela do seu celular. O logo DENTRO dos apps (emblema com asas no canto) continua o antigo.
21. **20 ruas de Goiatuba para o teste da busca — não recebidas.**
22. **Destinos recentes:** hoje ficam no servidor, só da conta. Se for para ficar **só no celular**, me confirme.

---

## 3. Carro no mapa e GPS (pedido de 30/10 15:20)

| O quê | Situação |
|---|---|
| Carro gira no sentido em que anda (rumo do GPS; sem ele, a direção do caminho; parado, fica o último) — motorista e passageiro | **[REAL]** servidor manda o rumo (90 e 180 conferidos no ponta a ponta) + **[AUTO]** telas (gira, inclusive pelo lado curto de 350 para 10) |
| Cor pela disponibilidade: verde livre, laranja em corrida, cinza offline (as da Central); moto também | **[AUTO]** telas; **[SEM TESTE]** no celular |
| Carros por perto a cada 10 s, mesmo id no dia (o mesmo carro anda, não troca de lugar), posição de ~11 m (era ~55 m) | **[REAL]** servidor + **[AUTO]** |
| GPS do motorista: navegação a cada 1 s e 5 m (era 15 m), filtro (tremida parado, leitura ruim, salto, suaviza) | **[AUTO]** testes do filtro; **[SEM TESTE]** na rua |
| Serviço do Android (app fechado): GPS 3 s / 8 m (era 10 s / 20 m), rede de celular só sem GPS há 30 s, parado reenvia a última boa | compilado na 285; **[SEM TESTE]** na rua |
| Servidor: leitura imprecisa (mais de 60 m) logo após uma boa não mexe no carro | **[REAL]** (leitura de 300 m ignorada no ponta a ponta) |
| GPS do passageiro acompanha andando (antes só trocava se ficasse mais preciso) | **[AUTO]**; **[SEM TESTE]** na rua |

---

## 4. Situação do pedido de 30/10 01:37 (7 etapas)

| Etapa | Situação |
|---|---|
| 1. Segredos: arquivo mestre e docs só com o NOME e o lugar de cada segredo; histórico do Git conferido (só hashes); par novo de chaves da cópia do banco | FEITO (PR #5) |
| 2. Tarifas sem gravar por cima, "Popular" de volta e "Nova categoria nesta cidade" | FEITO (PR #6) — **[REAL]** ponta a ponta 309 OK |
| 3. Caixa de entrada (motorista e passageiro) e aviso de saldo por cidade | FEITO — **[REAL]** servidor (326 OK) + **[AUTO]** telas |
| 4. Economia da TomTom (rota medida uma vez) | FEITO — **[REAL]**: 7 chamadas e 4 rotas por corrida (eram 11 e 8) |
| 5. Entregas, Fase 1 (desligada em todas as cidades) | FEITO — **[REAL]** servidor (345 OK; entrega 4 rotas = corrida) + **[AUTO]** telas; Fase 2 só plano (docs/ENTREGAS.md) |
| 6. Ícones (#0070B8, ~60%, redondo, legado, monocromático, fundo branco) | FEITO (PR #15): os 3 símbolos aplicados; prévia enviada; APKs com os ícones novos |
| 7. Loja | FEITO: docs/GOOGLE-PLAY.md (lista completa), passo a passo itens 6 e 7, docs/CONTAS.md |
| zod 4 / Nest 11 | NÃO mexido (esperando o seu OK) |

---

## 4.1 APKs 265 (30/10/2026, histórico) — conferidos por dentro

| App | Pacote | Versão | Conferido |
|---|---|---|---|
| Passageiro | br.com.fortalezamov.passageiro | 1.0.265 | alvo 36, mínimo 24; mesma assinatura (SHA-1 F2:70:E9:8C:C6:A8:F0:1D:31:4D:9E:3A:45:AE:42:77:3A:8D:96:C3); mesmas permissões da 256; chave da TomTom **não** está dentro; telas novas compiladas ("Chega em ~", "Sem carro perto", "lugares") |
| Motorista | br.com.fortalezamov.motorista | 1.0.265 | idem; telas novas ("Mudar categoria", "Categoria do carro", "Pedir à Central") |
| Central | com.rideplatform.central_app | 1.0.265 | idem; telas novas ("Pedidos de categoria", "Voltar ao padrão nesta cidade", "Ligada nesta cidade") |

Instalam por cima da 256. A 256 continua nos Releases do GitHub (dá para voltar).

---

## 5. Etapa 2 — Mapa e desempenho (medições reais, 29/10/2026)

**Como foi medido.** Esteira nova "Medir o mapa" (`.github/workflows/medir-mapa.yml`): monta o app com um medidor (só nessa montagem; o APK normal não tem), instala num **Android 14 de teste (emulador do GitHub)** com internet de verdade e o servidor real, com contas de teste criadas e apagadas pela própria esteira. Três aberturas por app: **r1** primeira abertura com o GPS sem sinal nos primeiros 8 s (como dentro de casa); **r2** e **r3** reaberturas com o GPS respondendo e as ruas já guardadas. Os tempos são desde que o app começou a rodar (mesma régua antes e depois). Relatórios e fotos da tela: `logs/medir-mapa/antes`, `depois`, `depois-final`.

**Limites da medição (o que NÃO foi medido):** é um emulador nos EUA, não um celular no Brasil; o GPS do emulador é mais lento e instável que o de um celular; a rede é a do GitHub. Serve para comparar antes e depois, não como tempo exato no celular do passageiro. As fotos da tela ficaram como prova visual; a contagem automática pelas fotos não ficou confiável e não foi usada nos números.

### Passageiro — tempo até o mapa aparecer
| Abertura | Antes (montagem 237) | Depois (montagem 241) |
|---|---|---|
| r1 primeira, GPS sem sinal 8 s | 13,8 s (ruas não carregaram em 20 s) | **3,0 s** no centro da cidade do cadastro; ruas 4,3 s; carros 4,5 s |
| r2 reabertura | 12,5 s; ruas 13,8 s; carros 14,0 s | **2,0 s**; ruas 2,6 s; carros 2,8 s |
| r3 reabertura | 7,1 s; ruas 7,6 s; carros 7,7 s | **1,3 s**; ruas 1,9 s; carros 2,5 s |

### Motorista — tempo até o mapa aparecer
| Abertura | Antes | Depois |
|---|---|---|
| r1 primeira, GPS sem sinal | não abriu em 20 s ("Localizando você") | não abriu em 20 s (igual: sem nenhuma posição no celular, espera o GPS) |
| r2 | 3,0 s | 12,5 s (nesta rodada o Android não tinha posição guardada e o GPS do emulador demorou) |
| r3 | 3,4 s | 2,4 s |
O motorista já abria com a última posição do Android; agora também com a guardada pelo próprio app. **Melhora não comprovada no motorista**: as diferenças vieram do GPS do emulador.

### Central — tempo até o mapa aparecer
| Abertura | Antes | Depois |
|---|---|---|
| r1 | 2,4 s; ruas 5,7 s; carros 6,6 s | 2,3 s; ruas 3,1 s; carros 4,2 s |
| r2 | 2,5 s; ruas 3,8 s; carros 4,8 s | 1,3 s; ruas 2,1 s; carros 2,7 s |
| r3 | 1,7 s; ruas 3,6 s; carros 4,1 s | 1,1 s; ruas 1,8 s; carros 2,3 s |
A Central **não mudou nesta etapa** (já não esperava o GPS); a diferença é variação da rede.

### Causas encontradas
1. **GPS (a maior):** o passageiro só mostrava o mapa depois do GPS responder (até 15 s de espera, com a tela "Localizando você"). Medido: o mapa aparecia junto com o GPS, de 7 a 14 s. **Corrigido:** o mapa abre na hora na última posição deste celular (guardada pelo app ou a do Android); na primeira vez, sem posição nenhuma, abre no centro da cidade do cadastro (vem do servidor). Aviso "Atualizando sua localização…" até o GPS chegar; aí o mapa vai até o lugar certo e os carros são buscados de novo. O embarque nunca usa posição velha sem avisar: antes de calcular a corrida o app espera o GPS até 10 s; sem GPS e só com o centro da cidade, não deixa pedir.
2. **Imagens do mapa (OSM público):** chegam 0,5 a 3,3 s depois do mapa; na primeira abertura, numa rodada, não chegaram em 6 s. Sem garantia e fora da política de uso comercial. **Encaminhado:** Google Maps pronto, esperando a chave; OSM fica de reserva (troca pelo servidor).
3. **Chamadas ao servidor:** 0,2 a 2,2 s cada (Central `/admin/eu` até 3 s na primeira). Não seguram o mapa (já eram feitas depois).
4. **Marcadores:** já entravam depois do mapa; carros aparecem 0,2 a 1,1 s depois das ruas.

### Pendente da etapa 2
- (Atualizado 29/10 tarde) O mapa passou para a TomTom (seção 5). A chave do Google Maps virou opcional: com ela, o servidor pode trocar para o Google (`MAPA_PROVEDOR=google`) sem reescrever as telas.
- ~~Primeira abertura do motorista num celular sem posição nenhuma ainda espera o GPS~~ — corrigido na montagem 256 (seção 6): abre na última posição conhecida pelo servidor ou no centro da cidade dele.
- Medir num celular de verdade em Goiatuba (teste de rua).

---

## 6. Troca do mapa para a TomTom (29/10/2026, montagens 242–244)

**Pedido do Evandro (10:59):** mapa, busca e rotas pela TomTom; interface MapProvider; economia (3+ letras, 500 ms, guardado, 1 rota por corrida, guardado de imagens); posição pelo FusedLocationProvider; contador diário local; contingência para 429/403 com "Abrir no Google Maps"; tirar o OpenStreetMap público. Respostas: APIs web da TomTom dentro dos apps Flutter atuais (não o SDK nativo Kotlin), busca e rota pelo servidor, chave entregue pelo servidor a quem está logado.

**Onde está a chave:** só na variável `TOMTOM_API_KEY` do Render e no `.env` do computador do Claude (fora do Git: `.env` e `local.properties` estão no `.gitignore`). Conferido: não está no código, nos testes, nos registros, no histórico do Git nem dentro dos APKs 242 e 244.

| O quê | Situação |
|---|---|
| Busca de destino pela TomTom (servidor real) | **[REAL]** resultados para "Avenida Brasilia" em Goiatuba. Desde 29/10 (noite) a busca fica só na região de operação (pedido do Evandro); "Abrir cidade nova" na Central procura no Brasil todo |
| Endereço do ponto pelo GPS | **[REAL]** "Rua Minas Gerais" |
| Rota pelas ruas | **[REAL]** 24 pontos, 1.375 m |
| Imagens do mapa com login / sem login | **[REAL]** com login vem o endereço TomTom 512 px; sem login: 401 |
| /app/config público sem a chave | **[REAL]** |
| Contador da plataforma (Central) | **[REAL]** o teste lê o uso do dia; passageiro não vê |
| Página pública de acompanhar | **[REAL]** abre sem login (imagens pela rota do próprio servidor) |
| Busca só com 3 letras úteis, 500 ms | **[AUTO]** testes dos 3 apps (o servidor não guarda mais nada desde 29/10, noite) |
| Contador local do dia e modo economia a 80% | **[AUTO]** |
| Contingência (endereço em texto + "Abrir no Google Maps") | **[AUTO]** tela e aviso no mapa; o 429 de verdade não foi provocado (gastaria a cota) |
| Rota 1 vez por etapa (refaz só fora do caminho, com limite) | **[AUTO]** só por leitura do código e testes existentes; falta corrida de rua |
| FusedLocationProvider no passageiro | **[SEM TESTE]** em aparelho (montado e analisado) |
| Imagens da TomTom aparecendo no Android de teste | **[REAL no emulador]** medição "tomtom" (logs/medir-mapa/tomtom): as ruas da TomTom aparecem nos 3 apps (fotos da tela do passageiro e do motorista) |
| Atribuição "© TomTom" visível | corrigido: nos mapas de tela cheia ela ficava atrás do painel de baixo (vista nas fotos da medição); agora vai no alto, à esquerda (abaixo do taxímetro nas telas de corrida). Conferido nas fotos das telas (esteira "Fotos dos apps") |

**Medição "tomtom" (mesma esteira e mesma régua da seção 4; tempo desde o início do app):**

| App | Abertura | Mapa na tela | Primeira imagem de ruas | Carros |
|---|---|---|---|---|
| Passageiro | r1 (1ª, GPS sem sinal) | 2,8 s | 4,1 s | 3,5 s |
| Passageiro | r2 | 2,3 s | 3,0 s | 3,4 s |
| Passageiro | r3 | 1,0 s | 2,0 s | 2,3 s |
| Motorista | r1 (sem posição nenhuma, espera o GPS) | 10,6 s | 11,7 s | — |
| Motorista | r2 | 2,0 s | 2,8 s | — |
| Motorista | r3 | 2,2 s | 3,5 s | — |
| Central | r1 | 1,7 s | 4,0 s | 4,5 s |
| Central | r2 | 1,9 s | 2,9 s | 3,4 s |
| Central | r3 | 1,5 s | 2,5 s | 3,2 s |

Comparando com o OpenStreetMap (montagem 241, seção 4): passageiro 4,3 / 2,6 / 1,9 s até as ruas → 4,1 / 3,0 / 2,0 s com a TomTom (praticamente igual; na 1ª abertura a TomTom ainda pede o endereço das imagens ao servidor, /geo/mapa, 0,2 a 1 s). Central 3,1 / 2,1 / 1,8 s → 4,0 / 2,9 / 2,5 s (um pouco mais lenta nesta rodada; a rede do emulador varia ~1 s entre rodadas). Motorista: a 1ª abertura sem posição nenhuma continuava esperando o GPS (corrigido na 256, seção 6).

**APKs antigos (até 241):** não acham mais o endereço das imagens no /app/config e continuam com o mapa antigo (OpenStreetMap) até instalar a 244.

---

## 7. Primeira abertura do mapa mais rápida (pedido do Evandro, 29/10 14:28: "achei até que não ia aparecer as ruas")

**Causa achada:** a chave da TomTom aceita só ~10 pedidos de imagem por segundo para a plataforma inteira (e 5 por segundo de busca e de rota). A abertura do mapa pedia ~20 imagens de uma vez: as que passavam do limite voltavam 429 ("devagar") e ficavam em branco até mexer no mapa. No servidor, um 429 parava a busca até a meia-noite. No motorista, na primeira vez num celular sem posição nenhuma, o app ficava em "Localizando você…" até o GPS responder (20 s ou mais dentro de casa).

**O que mudou:**
- Apps: só as imagens da tela (~6 em vez de ~20); no máximo 6 baixando juntas e 8 novas por segundo; 429/502/503/504 esperam e tentam de novo (até 4 vezes); um fornecedor de imagens só para todos os mapas; o endereço das imagens (/geo/mapa) que falha tenta de novo em 2, 4, 8, 16 e 30 s (antes: 10 min sem ruas).
- Servidor: fila de 4 pedidos por segundo para busca e rota; 429 espera e tenta de novo e não para mais nada; 403 pausa 30 min.
- Motorista: o cadastro (/drivers/me) traz a última posição que o servidor conhece e o centro da cidade dele; o mapa abre ali e vai para a posição certa quando o GPS chega.

**Medição (Android de teste com a rede limitada a um 4G fraco: 6 Mbit/s, 100–250 ms; tempo desde o início do app):**

| App | Abertura | Antes (244) | Depois (código da 256, medição "4g-final") |
|---|---|---|---|
| Passageiro | 1ª abertura (instalado agora, GPS sem sinal 8 s) | mapa 4,9 s; 1ª rua 6,9 s | **mapa 3,1 s; todas as ruas da tela 4,4 s; 6 imagens, 0 respostas 429** (rodada anterior: 2,8 s / 3,9 s) |
| Passageiro | reaberturas | ruas 3,8 s; na 3ª abertura as ruas **não carregaram em 20 s** | ruas **1,8 s e 2,3 s** |
| Motorista | 1ª abertura (GPS não respondeu nos 20 s) | ficava em "Localizando você…" até o GPS (9,7 s numa rodada; **mais de 20 s** em outra) | **mapa 2,7 s; todas as ruas da tela 3,8 s; 0 respostas 429** — mesmo sem o GPS (foto da tela: ruas de Goiatuba) |
| Motorista | reaberturas | ruas 2,0 s e 2,4 s | ruas 3,2 s e 2,5 s (igual: variação da rede) |

Limites: emulador nos EUA, não celular em Goiatuba; serve para comparar antes x depois.

---

## 8. Etapas 3 a 8 (29/10/2026, tarde e noite)

| O quê | Situação |
|---|---|
| **Etapa 3** — corrida sem destino (taxímetro; o app mostra que o valor é ESTIMADO) | **[REAL]** servidor (preço sem destino, recusa sem marcar a opção) + **[AUTO]** tela |
| Parada extra (até 2) no caminho e no preço | **[REAL]** servidor (a distância aumenta com a parada) + **[AUTO]** |
| "Escolher no mapa" e "Ir sem destino" na busca do destino | **[AUTO]** |
| Busca com token de sessão e fonte da busca por cidade (Central → Cidades) | **[REAL]** servidor + **[AUTO]** |
| Endereços salvos (Casa, Trabalho) no servidor | **[REAL]** |
| **Etapa 4** — destinos recentes vêm do servidor, só da conta; lixeira apaga no servidor e só depois muda a tela; "Apagar histórico de destinos" | **[REAL]** servidor + **[AUTO]** tela (sem rede, nada muda) |
| **Etapa 5** — "Meus cartões" só com "Em breve"; nenhum campo de cartão; pagamento direto ao motorista | **[AUTO]** (o teste pegou o selo "EM BREVE" estourando a largura num celular estreito: corrigido) |
| **Etapa 6** — aparência pela Central: nome, cor, logo e faixa de aviso do app do passageiro (Central → Configurações → App do passageiro → Aparência do app; só o dono grava) | **[REAL]** servidor (operador não muda; app recebe nome e cor; logo público) + **[AUTO]** telas dos 2 apps. A Central ainda não mexeu: o app continua igual até alguém salvar |
| App de outro operador (scripts/novo-app.sh + esteira "App de operador") | **[REAL na esteira]** (exemplo compilado e conferido por dentro) |
| Ícones (scripts/gerar-icones.py) | pronto e testado com um símbolo de exemplo; **esperando os arquivos do Evandro** |
| **Etapa 7** — verificação em duas etapas da Central (Google Authenticator) | **[REAL]** na conta do operador de teste: liga com o código, a senha sozinha não entra, código repetido e desafio alterado são recusados, código de recuperação vale uma vez, desliga |
| Senha provisória do operador (troca obrigatória no 1º acesso; até trocar o servidor recusa a Central) | **[REAL]** |
| Isolamento entre cidades pelo endereço direto (operador de outra cidade não abre motorista nem carteira pelo id) | **[REAL]** |
| Itumbiara na janela "Novo operador" (6 cidades, rolagem) | **[AUTO]** teste de tela rola até Itumbiara e escolhe |
| Documentação de contas e restauração | feita: docs/CONTAS.md (sem nenhuma senha; o repositório é público) |
| Dependências | qs corrigido (6.16.1); sobram 4 que exigem troca grande |
| **Etapa 8** — iPhone | **[REAL na esteira]** os 3 apps compilam (sem assinar) |
