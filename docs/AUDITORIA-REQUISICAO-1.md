# Requisição de Serviço 1 — Auditoria e Plano

Data: 11/11/2026. Repositório `ride-platform`, ramo `main` (depois do PR #52).
Fonte: código atual, PRs recentes, esteiras do GitHub, `PENDENCIAS.md`, `docs/`
e leitura (somente leitura) das configurações no banco de produção.

Legenda: ✅ Concluído · 🧪 Implementado, falta testar · 🔧 Em andamento ·
⏳ Pendente de implementação · ❓ Aguardando decisão do proprietário

> Nenhum teste em aparelho real foi feito por mim. Eu só consigo testar no
> emulador da esteira do GitHub. GPS, notificações com tela apagada, taxímetro
> na rua e navegação **só contam como comprovados quando o Evandro testar no
> celular** (roteiro em `docs/TESTE-DE-RUA.md`).

---

## Etapa 1 — Auditoria

### 1. Central

| Item | Situação | O que existe hoje |
|---|---|---|
| Identificação individual do aparelho no login | ⏳ | O servidor já tem a tabela de aparelhos (com modelo e versão do Android) e liga cada sessão a um aparelho. Mas os 3 apps mandam um nome **fixo** (`flutter-android`, `flutter-android-driver`, `flutter-android-central`): dois celulares da mesma pessoa viram **um aparelho só** na lista. |
| Envio do identificador pelos apps | ⏳ | Falta gerar um código único por instalação e mandar junto com o modelo do celular. |
| Lista de aparelhos de cada conta | 🧪 | Rota `GET /admin/usuarios/:id/aparelhos` (só o dono). Funciona, mas mostra um aparelho só por causa do nome fixo. |
| Desconectar **geral** | ✅ | Botão do dono na Central + rota `POST /admin/usuarios/:id/desconectar` + esteira `desconectar-aparelhos.yml`. Corta na hora (sessões, avisos, motorista sai do ar). Testado no teste de ponta a ponta. Registro na auditoria. |
| Desconectar **um aparelho só** | ⏳ | Não existe. Depende do identificador individual. |
| Integração com a revogação de sessões | ✅ | `SessoesService`: toda requisição confere se a conta foi cortada (cache de 30 s; conta bloqueada não fica em cache). |
| Duas etapas (autenticador) na conta do dono | 🧪 ❓ | **Pronto no código** (Google Authenticator, 8 códigos de recuperação, segredo cifrado) e testado no teste de ponta a ponta com uma conta de operador. **Não está ligado na sua conta** (conferido no banco). Ligar depende de você ter um celular com o aplicativo autenticador. |
| Permissões administrativas | ✅ 🧪 | Dono x operador (`SoDonoGuard`), operador preso às cidades dele (`pracas`), ações sensíveis com registro de auditoria, dados pessoais só com motivo. Falta uma revisão final rota por rota (tarefa 4). |
| Recuperação de conta | 🧪 ❓ | Central: "Esqueci a senha" com código no e-mail. Passageiro: "Esqueci minha senha" e entrada por código. Precisa de **decisões suas** para os casos difíceis (ver Decisões, D3). |

### 2. Passageiro

| Item | Situação | O que existe hoje |
|---|---|---|
| Credenciais em `flutter_secure_storage` | ⏳ | Chaves de acesso estão no `SharedPreferences` (arquivo comum do app). O backup do Android já está desligado, o que reduz o risco, mas não é cofre. |
| Identificação do aparelho no login | ⏳ | Nome fixo (ver Central). |
| Gestão de sessões da Central | ✅ | Desconexão geral já derruba o passageiro (testado). |
| GPS real | 🧪 | Funciona no emulador; no Redmi 12 o Evandro usou. Falta roteiro de teste no celular registrado. |
| Notificações (aberto, fundo, fechado) | 🧪 | Firebase nativo (`MensagensService`) e serviço em primeiro plano durante a corrida. Falta prova em aparelho real nos três estados. |
| Tela apagada | 🧪 | Serviço em primeiro plano (`CorridaService`). Falta prova em aparelho real. |
| Mapas TomTom | ✅ 🧪 | Mapa, busca e rota pela TomTom; fila de imagens corrigida em 11/11. |
| Busca de endereço e rota em Goiatuba | 🧪 | Falta roteiro com endereços reais de Goiatuba conferidos no celular. |
| Ícones, bandeira e ajustes visuais | 🧪 | Visual premium entregue (APK 383). A bandeira do Brasil aparece quebrada no emulador (falta fonte de emoji lá); falta conferir no celular. |
| Problemas em aparelhos reais | ❓ | Preciso que você me diga/mostre o que aparecer no celular. |

### 3. Motorista

| Item | Situação | O que existe hoje |
|---|---|---|
| Credenciais em `flutter_secure_storage` | ⏳ | Igual ao passageiro. |
| Identificação do aparelho no login | ⏳ | Nome fixo. |
| Gestão de sessões da Central | 🧪 | Desconexão geral derruba e tira do ar (no código); o teste de ponta a ponta só cobre o passageiro — incluir o motorista (tarefa 11). |
| GPS e localização em segundo plano | 🧪 | Serviço em primeiro plano (`CorridasService`), sem pedir localização em segundo plano (regra da loja). Falta prova na rua. |
| Chamadas com app aberto, fechado e tela apagada | 🧪 | Tela cheia de chamada + Firebase + autorizações por fabricante (ajustadas para o Redmi 12 em 10/11). Falta prova nas outras marcas. |
| Taxímetro em viagem real | 🧪 | Correção de 11/11 (comissão pelo que andou). Falta uma viagem real de ponta a ponta. |
| Mapas e navegação | 🧪 | Botões Google Maps / Waze; falta conferir no celular. |
| Carteira e transações | ✅ 🧪 | Testes automáticos passam; 3 falhas do teste de ponta a ponta são **intencionais** (bloqueio sem saldo ligado). |
| Chamadas por categoria (Popular x Conforto) | 🧪 | Corrigido em 11/11 (cada pedido só toca para a categoria escolhida). Falta teste com dois motoristas reais e um teste automático de ponta a ponta. |
| Permissões especiais por fabricante | 🧪 | Xiaomi, Samsung, Oppo, Vivo, Huawei, Honor, Motorola, Asus. Só o Redmi 12 foi usado de verdade. |

### 4. Segurança e arquitetura

| Item | Situação | Observação |
|---|---|---|
| NestJS + Prisma + PostgreSQL/PostGIS | ✅ | Banco no Supabase (`fortaleza-mov-eua`). |
| Redis | ⚠️ | O servidor só **testa a conexão** com o Redis; nada da plataforma usa Redis hoje. Não muda nada para a loja; entra no plano da Hostinger. |
| Isolamento por cidade e perfil | ✅ | Operador só vê as cidades dele; testes cobrem. |
| Segredos fora do código e dos APKs | ✅ | Chaves no Render / segredos do GitHub; a esteira confere a chave da TomTom antes de cada envio. |
| Auditoria das operações | ✅ | `audit_logs` nas ações da Central. |
| Migrações com volta (rollback) | ⏳ | As próximas tarefas **não precisam mudar o banco** (os campos do aparelho já existem). Se aparecer alguma, vai com SQL de volta junto. |

### 5. Infraestrutura e publicação

| Item | Situação | Observação |
|---|---|---|
| Domínio próprio da API | ❓ | Precisa você registrar o domínio no Registro.br (tem taxa anual). |
| Plano de migração Render → Hostinger KVM 2 | ⏳ | Só plano nesta requisição (não executar). |
| Pacote da loja (AAB) | ✅ | A esteira gera, assinado. |
| Alvo Android 16 e 16 KB | ✅ | A esteira confere. |
| Declarações do Google Play | ⏳ | Rascunhos prontos em `docs/GOOGLE-PLAY.md`; faltam textos finais e vídeo do serviço em primeiro plano. |
| Contas de revisão do Google | ⏳ | Fazer passageiro e motorista de revisão. |
| Desligar o código na tela (`OTP_DEBUG_RETURN`) | ⏳ | Obrigatório antes de publicar; depois das contas de revisão. |
| **Conta do Play Console como empresa** | ❓ 🚨 | Exige **CNPJ + D-U-N-S** (o D-U-N-S pode levar **até 28 dias**). Conta pessoal criada hoje exige **teste fechado com 12 pessoas por 14 dias**. Com menos de um mês, isso é o maior risco do prazo. |

### 6. Regras operacionais (conferido em produção, só leitura)

- Categorias: só **Popular** ligada; Conforto, Premium, Moto, Entrega e Entrega de moto **desligadas** na lista geral. ✅ de acordo.
- **Divergência:** a configuração de entregas da cidade **Goiatuba** está como **ligada** (`entregas.config`: ligada, todos os veículos), enquanto a requisição diz que entregas permanecem desativadas. **Não mexi.** Ver D1.
- Bloqueio do motorista sem saldo: ligado (mínimo R$ 20,00). Mantido.

---

## Etapa 2 — Plano (aguardando sua aprovação)

Ordem: **Central → Passageiro → Motorista**, e infraestrutura em paralelo só
no que é papel/plano (sem mexer em produção).

### Central

1. **Identificador único por aparelho (servidor + 3 apps).** Cada instalação
   gera um código próprio e guarda no cofre do celular; manda no login junto
   com modelo e versão do Android. Central na web manda "Navegador".
   *Pronto quando:* teste automático mostra 2 aparelhos diferentes na mesma
   conta; teste de ponta a ponta lista os dois com o modelo.
2. **Desconectar um aparelho só.** Botão por aparelho na lista da Central
   (só o dono), registro na auditoria; o aparelho cortado cai na hora (a
   chave dele deixa de valer na próxima requisição), os outros continuam.
   *Pronto quando:* teste de ponta a ponta entra com 2 aparelhos, corta um,
   o cortado recebe "sessão encerrada" e o outro segue funcionando.
3. **Duas etapas na sua conta.** Já está pronto no código. Eu preparo o
   passo a passo e você liga quando tiver o celular com o autenticador (D2).
   *Pronto quando:* a sua conta pede o código do autenticador ao entrar.
4. **Revisão de segurança da Central.** Conferir rota por rota quem pode o
   quê (dono, operador, cidade), limites de tentativas e registros de
   auditoria; relatório com o que achar e correções.
   *Pronto quando:* relatório no repositório + testes novos para cada falha
   encontrada.
5. **Recuperação de contas.** Levantamento dos casos (ver D3) e só implemento
   o que você aprovar.

### Passageiro

6. **Cofre do celular (`flutter_secure_storage`).** Chaves de acesso e
   identificador do aparelho vão para o cofre; quem já está logado é
   migrado sem precisar entrar de novo.
   *Pronto quando:* teste automático da migração passa; APK instalado por
   cima do antigo continua logado (prova no emulador **e** no seu celular).
7. **Identificador do aparelho no login** (tarefa 1 no app do passageiro).
8. **Roteiro de teste no celular** (GPS, notificação aberto/fundo/fechado,
   tela apagada, busca e rota com endereços reais de Goiatuba, ícones e
   bandeira). Eu escrevo o roteiro curto; você testa e me manda o que der
   errado; eu corrijo.
   *Pronto quando:* cada linha do roteiro marcada "ok no celular" por você.

### Motorista

9. **Cofre do celular** (igual à 6).
10. **Identificador do aparelho** (igual à 7).
11. **Testes automáticos novos** no teste de ponta a ponta: desconexão do motorista e categoria — motorista
    Popular e motorista Conforto online; pedido Popular só toca no Popular.
    *Pronto quando:* o teste passa na esteira.
12. **Roteiro de rua do motorista** (chamada com app fechado e tela apagada,
    taxímetro numa volta real, navegação, carteira depois da corrida,
    autorizações em outra marca de celular se houver).
    *Pronto quando:* cada linha marcada "ok no celular" por você.

### Infraestrutura e loja (só preparo, nada em produção)

13. **Plano da Hostinger KVM 2** por escrito: instalação, Postgres/PostGIS,
    Redis, variáveis (só nomes), tarefas agendadas, teste completo no
    servidor novo, troca pelo domínio e volta para o Render se der errado.
    Sem executar.
14. **Domínio da API**: assim que você registrar, eu ligo no Render e mudo os
    apps (com o endereço do Render de reserva).
15. **Loja**: textos da ficha, ícone 512, imagem 1024×500, capturas,
    respostas da segurança dos dados, contas de revisão e vídeo do serviço
    em primeiro plano.
16. **Desligar o código na tela** (`OTP_DEBUG_RETURN`) — só depois da 15 e
    com sua autorização.

### Testes em cada etapa

Análise do código, testes automáticos do servidor e dos apps, teste de ponta
a ponta, compilação de lançamento e leitura de erros. No fim de cada etapa eu
separo: **automáticos**, **emulador** e **celular real (seu)**, com números
de aprovados e reprovados.

---

## Decisões que dependem de você

- **D1 — Entregas em Goiatuba:** estão **ligadas** na configuração da cidade
  (as categorias de entrega estão desligadas na lista geral). Quer que fique
  assim, ou eu desligo a de Goiatuba? (Não mexo sem você dizer.)
- **D2 — Duas etapas na sua conta da Central:** ligar agora no celular que
  você usa hoje (da sua mãe), ou esperar o seu celular? Sem ligar, a conta do
  dono fica só com senha + código no e-mail.
- **D3 — Recuperação de conta (casos para você decidir):**
  1. Passageiro/motorista **perdeu o número de telefone**: pode trocar o
     telefone entrando pelo e-mail? Ou só a Central troca?
  2. Pessoa **sem e-mail e sem o telefone antigo**: a Central pode liberar
     depois de conferir documento? Quem na Central pode fazer isso (só o dono
     ou operador também)?
  3. **Dono perdeu o celular do autenticador**: usa um dos 8 códigos de
     recuperação (já existe). Precisa de outro caminho além disso?
  4. Ao recuperar uma conta, **derrubar todos os aparelhos** dela
     automaticamente? (Minha sugestão: sim.)
- **D4 — Conta do Play Console:** já existe CNPJ? Vamos de conta de
  **empresa** (CNPJ + D-U-N-S, até 28 dias) ou **pessoal** (12 testadores por
  14 dias antes de publicar)? Esse é o ponto que mais ameaça o prazo.
- **D5 — Domínio:** qual nome registrar (ex.: `fortalezamove.com.br`)?
