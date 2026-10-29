# PENDÊNCIAS — Fortaleza Mov

Atualizado em 29/10/2026, etapa 1 do "Pedido de atualização da plataforma".
Este arquivo diz o que foi **verificado com teste real**, o que é **só teste automático/simulado** e o que **não existe ou não tem teste**. Fica atualizado a cada etapa.

Legenda: **[REAL]** testado de verdade (servidor real ou aparelho real) · **[AUTO]** só teste automático, com dados de mentira · **[SEM TESTE]** existe, mas nada testou · **[NÃO EXISTE]** ainda não foi feito.

---

## 1. Resultado real dos testes (29/10/2026, 08h, horário de Brasília)

| O quê | Resultado | Onde ver |
|---|---|---|
| Servidor: compilação TypeScript | 0 erros | rodado aqui (`tsc --noEmit`) |
| Servidor: testes automáticos | 30 passaram, 0 falharam (6 grupos) | rodado aqui (`jest`) |
| App do passageiro: análise | nenhum problema | logs/analyze-mobile_passenger.txt (montagem 238) |
| App do passageiro: testes de tela | 42 passaram, 0 falharam, 12 pulados (são as fotos de tela, que rodam em outra esteira) | logs/test-mobile_passenger.txt |
| App do motorista: análise | nenhum problema | logs/analyze-mobile_driver.txt |
| App do motorista: testes de tela | 51 passaram, 0 falharam, 7 pulados (fotos) | logs/test-mobile_driver.txt |
| Central: análise | nenhum problema | logs/analyze-central_app.txt |
| Central: testes de tela | 30 passaram, 0 falharam, 1 pulado (fotos) | logs/test-central_app.txt |
| Teste de ponta a ponta no servidor real (execução 57) | 252 etapas, 0 falhas | logs/teste-ponta-a-ponta.txt |
| Falhas de segurança nas bibliotecas do servidor (`pnpm audit`) | 5: 1 alta (zod), 4 moderadas (qs, file-type ×2, @nestjs/core) | rodado aqui |

Ambiente: **não existe Flutter nem Android SDK no computador do Claude**. Tudo que é Flutter (análise, testes, APK, AAB) roda no GitHub Actions (esteira `android-apks.yml`, Flutter 3.47.5), que já existe e funciona.

---

## 2. Riscos em ordem (maior primeiro)

1. **Pagamento com cartão — [NÃO EXISTE].** Hoje o passageiro paga direto ao motorista (dinheiro, Pix ou maquininha) e a comissão sai da carteira pré-paga do motorista. **O app do passageiro NÃO tem "Meus Cartões"**: o menu mostra "Pagamento: Direto ao motorista". Nenhum gateway, nenhuma tokenização, nenhum webhook. Gateway exige CNPJ (ainda não tem).
2. **Chamado com a tela apagada / app fechado — [AUTO].** O vigia nativo e a tela cheia do chamado foram testados só com testes automáticos e na montagem; falta o teste de rua com dois celulares.
3. **Notificação push chegando no celular — [SEM TESTE] no aparelho.** O servidor aceita a chave do Firebase (verificado no /api/health em todo teste de ponta a ponta), mas a entrega no celular não tem teste automático.
4. **GPS na rua, taxímetro e posição — [AUTO].** Envio de posição no máximo a cada 4 s (desde 23/10) testado só com leituras de mentira.
5. **Mapa (imagens) — [SEM TESTE] de tempo.** Usa o servidor público `tile.openstreetmap.org`, que pela política do OSM não serve para uso comercial pesado. O tempo até o mapa aparecer **ainda não foi medido** (etapa 2). O endereço do mapa já vem do servidor (troca sem app novo) e o guardado no celular é de até 200 MB.
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
20. **Documentação de contas e hospedagem — falta** (etapa 7).

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
