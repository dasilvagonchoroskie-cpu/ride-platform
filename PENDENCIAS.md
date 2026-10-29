# PENDÊNCIAS — Fortaleza Mov

Atualizado em 29/10/2026, etapa 2 (mapa e desempenho) do "Pedido de atualização da plataforma".
Este arquivo diz o que foi **verificado com teste real**, o que é **só teste automático/simulado** e o que **não existe ou não tem teste**. Fica atualizado a cada etapa.

Legenda: **[REAL]** testado de verdade (servidor real ou aparelho real) · **[AUTO]** só teste automático, com dados de mentira · **[SEM TESTE]** existe, mas nada testou · **[NÃO EXISTE]** ainda não foi feito.

---

## 1. Resultado real dos testes (29/10/2026, tarde — montagem 241)

| O quê | Resultado | Onde ver |
|---|---|---|
| Servidor: compilação TypeScript | 0 erros | rodado aqui (`tsc --noEmit`) |
| Servidor: testes automáticos | 31 passaram, 0 falharam (6 grupos) | rodado aqui (`jest`) |
| App do passageiro: análise | nenhum problema | logs/analyze-mobile_passenger.txt (montagem 241) |
| App do passageiro: testes de tela | 48 passaram, 0 falharam, 12 pulados (fotos de tela, que rodam em outra esteira) | logs/test-mobile_passenger.txt |
| App do motorista: análise | nenhum problema | logs/analyze-mobile_driver.txt |
| App do motorista: testes de tela | 55 passaram, 0 falharam, 7 pulados (fotos) | logs/test-mobile_driver.txt |
| Central: análise | nenhum problema | logs/analyze-central_app.txt |
| Central: testes de tela | 31 passaram, 0 falharam, 1 pulado (fotos) | logs/test-central_app.txt |
| Teste de ponta a ponta no servidor real (execução 58) | 252 etapas, 0 falhas | logs/teste-ponta-a-ponta.txt |
| Medição do mapa num Android de teste (esteira "Medir o mapa") | antes e depois, 3 aberturas por app (seção 4) | logs/medir-mapa/ |
| Falhas de segurança nas bibliotecas do servidor (`pnpm audit`) | 5: 1 alta (zod), 4 moderadas (qs, file-type ×2, @nestjs/core) — corrigir na etapa 7 | rodado aqui |

Ambiente: **não existe Flutter nem Android SDK no computador do Claude**. Tudo que é Flutter (análise, testes, APK, AAB) roda no GitHub Actions (esteira `android-apks.yml`, Flutter 3.47.5), que já existe e funciona.

---

## 2. Riscos em ordem (maior primeiro)

1. **Pagamento com cartão — [NÃO EXISTE].** Hoje o passageiro paga direto ao motorista (dinheiro, Pix ou maquininha) e a comissão sai da carteira pré-paga do motorista. **O app do passageiro NÃO tem "Meus Cartões"**: o menu mostra "Pagamento: Direto ao motorista". Nenhum gateway, nenhuma tokenização, nenhum webhook. Gateway exige CNPJ (ainda não tem).
2. **Chamado com a tela apagada / app fechado — [AUTO].** O vigia nativo e a tela cheia do chamado foram testados só com testes automáticos e na montagem; falta o teste de rua com dois celulares.
3. **Notificação push chegando no celular — [SEM TESTE] no aparelho.** O servidor aceita a chave do Firebase (verificado no /api/health em todo teste de ponta a ponta), mas a entrega no celular não tem teste automático.
4. **GPS na rua, taxímetro e posição — [AUTO].** Envio de posição no máximo a cada 4 s (desde 23/10) testado só com leituras de mentira. Desde a montagem 241 o mapa abre na última posição guardada e o GPS acerta depois: o embarque espera o GPS até 10 s antes de calcular a corrida; testado no emulador, falta na rua.
5. **Mapa (imagens) — medido [REAL no emulador], falta celular de verdade.** Ainda usa o servidor público `tile.openstreetmap.org` (pela política do OSM, não serve para uso comercial pesado). O Google Maps (SDK do celular, grátis e sem limite) já está pronto no código e **espera a chave dos apps** do Evandro; o servidor escolhe qual usar (`MAPA_PROVEDOR`). Medição na seção 4. O tempo num celular de verdade, no 4G de Goiatuba, ainda não foi medido.
6. **Busca de endereço e rota — [REAL], mas sem garantia.** Nominatim + Photon (reserva) e OSRM público: o teste de ponta a ponta faz consultas reais e passou hoje, mas são serviços gratuitos sem garantia; podem limitar ou bloquear a qualquer momento.
7. **Administrador sem verificação em duas etapas — [NÃO EXISTE].** Entra com senha (ou código por e-mail). Ele controla todas as cidades e o dinheiro.
8. **Dependências do servidor:** zod (alta: consumo de memória com listas enormes; a correção só existe no zod 4, troca grande — hoje mitigado pelo limite de 4 MB por pedido), qs (moderada, corrige sem risco), file-type e @nestjs/core (moderadas; só com o Nest 11).
9. **Operador sem troca de senha obrigatória no 1º acesso — [NÃO EXISTE].** O dono define a senha e ela vale direto.
10. **Isolamento entre cidades — [REAL].** O teste de ponta a ponta cria um operador de Goiatuba e confere que ele vê só a cidade dele (visão geral, carteiras, relatório), não muda tarifas e não acessa a limpeza de dados. Falta teste dedicado de "operador tenta abrir dado de outra cidade pelo endereço direto" (etapa 7).
11. **Endereços recentes/favoritos do passageiro — ficam SÓ NO CELULAR.** Não existe histórico de endereços no servidor nem lixeira que apague no servidor (etapa 4). O histórico de CORRIDAS fica no servidor e é só da conta [REAL].
12. **"Excluir minha conta" — [REAL].** O teste de ponta a ponta exclui a conta do passageiro pelo app e confere que ela não entra mais; ao excluir um motorista, o histórico de corridas do passageiro continua. Ainda não existe "Apagar tudo" separado; cartões não existem.
13. **Banco grátis de 500 MB com as fotos dentro.** Aperta perto de 250–300 motoristas com documentos.
14. **E-mail só pelo Gmail (~100 por dia).** A Brevo (reserva grátis) ainda não tem conta.
15. **Aparência pela Central (logo, cores, nome, banner) — [NÃO EXISTE].**
16. **Ícones novos — não recebidos.** No repositório estão os ícones atuais (assets/icones/fortaleza-mov-*.png). Os arquivos central.png, motorista.png, passageiro.png e os 3 *-simbolo.png ainda não chegaram.
17. **Flavors por operador e script de app novo — [NÃO EXISTE].** iOS: não existe a pasta ios nos apps e não dá para compilar iOS sem Mac e conta Apple.
18. **Itumbiara no cadastro de operador.** Está cadastrada (o teste de hoje vê as 6 cidades: Goiatuba, Teutônia, Bom Jesus de Goiás, Buriti Alegre, Joviânia, Itumbiara). Na janela "Novo operador" ela é a última da lista: suspeita de rolagem; confirmar com teste de tela na etapa 7.
19. **Cópia do banco — [REAL].** Cópia diária criptografada funcionando (19 cópias, a última em 28/10). A restauração foi testada só com cópia de teste, não num banco de verdade.
20. **Documentação de contas e hospedagem — falta** (etapa 7). Já conferido hoje: o Render está na conta dasilvagonchoroskie@gmail.com; o conector do Supabase usado pelo Claude está ligado na conta gestaodefrota2027@gmail.com (só o projeto da frota) e **não alcança o banco da Fortaleza Mov** (projeto fortaleza-mov-eua). O servidor continua acessando o banco normalmente.

---

## 3. O que já existe para cada parte do pedido (para não refazer)

- **A) Mapa:** flutter_map com OpenStreetMap nos 3 apps; endereço do mapa vindo do servidor (`/api/app/config` → `mapa`); guardado de 200 MB. Google Maps já está no código, desligado.
- **B) Destino e busca:**
  - JÁ TEM: pino fixo no centro ("Marcar no mapa") com uma consulta 0,7 s depois de parar; busca digitada com mínimo de 3 letras e espera de 0,65 s; busca passando pelo servidor (`/geo/search`, `/geo/reverse`, `/geo/rota`); viés pela posição; preço final calculado no servidor; motoristas favoritos.
  - FALTA: "Não informar destino", parada extra, "Meus favoritos" de endereço; o Confirmar ainda libera enquanto o endereço é buscado (vai como "Ponto marcado no mapa") e não tem Editar; as 3 letras ainda contam "rua/av."; não tem token de sessão; fonte da busca por cidade e base própria de ruas no PostGIS.
- **C) Histórico:** corridas no servidor, só da conta. Endereços recentes só no celular.
- **D) Aparência:** nada na Central. Ícones atuais no repositório.
- **E) Pagamentos:** carteira pré-paga do motorista (centavos, extrato, comissão), cupom pago pela plataforma, saque PIX manual pela Central. Sem cartão e sem gateway.
- **F) Segurança:** dono x operador por cidade (já existe e é testado); log de auditoria (audit_logs) já grava aprovações, carteira e exclusões.
- **G) CI:** esteira dos APKs/AAB assinados, teste de ponta a ponta, fotos das telas, cópia do banco e auditoria das dependências já existem.

---

## 4. Etapa 2 — Mapa e desempenho (medições reais, 29/10/2026)

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
- Chave dos apps do Google Maps (Evandro) → montar com Google, medir de novo ("google") e decidir o padrão.
- Primeira abertura do motorista num celular sem posição nenhuma ainda espera o GPS (ele precisa do GPS para trabalhar).
- Medir num celular de verdade em Goiatuba (teste de rua).

