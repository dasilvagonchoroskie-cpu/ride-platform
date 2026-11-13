# Publicação da Etapa 2 — versão candidata 2.1.0-rc.1 (PREPARADA, NÃO EXECUTADA)

Ramo `etapa2`. Nada disto foi feito: só acontece com a autorização expressa do dono e o destino confirmado.
Produção hoje = ramo `main` no Render (serviço `crm-fortaleza-move`, deploy manual) + cofre no Supabase.

## 1. O que entra no ar com esta versão
Pessoas/empresas, entregadores, comércios, documentos com cifra, candidatos e avaliador, relatórios em PDF, correções da IA
(confirmação rápida, áudio, novo atendimento, equipe ⇄ IA, origem "site"), 7 documentos do motorista e os arquivos do
WhatsApp guardados direto na ficha. Banco: 7 migrações novas (só criam tabelas/colunas; nada é apagado nem alterado).

## 2. Escolha do destino (decisão do dono)
| | **A. Render atual (agora)** | **B. VPS Hostinger (depois de contratada)** |
|---|---|---|
| Disco | Temporário: some a cada reinício | Persistente |
| Banco | Continua no cofre cifrado (retrato a cada 30 s) | Disco da VPS + cópia cifrada no cofre (`SNAPSHOT_MODO=copia`) |
| Arquivos dos documentos | **Precisa** de um bucket PRIVADO no Supabase Storage (`DOCS_STORAGE=supabase`) — o CRM recusa guardar em disco temporário | Disco da VPS (`DOCS_STORAGE=local`, `FM_DOCS_LOCAL_PERSISTENTE=1`) |
| Hibernação | Dorme após 15 min sem acesso (o cron mantém acordado) | Não dorme |
| Custo | Grátis | Plano da VPS |
| Trabalho extra | Criar bucket privado + chave de serviço do Supabase (você) | Seguir `deploy/hostinger/README.md` |

Recomendação técnica: **B** (o próprio dono já decidiu migrar antes do lançamento). Se quiser testar no celular antes da
VPS, **A** funciona, com o bucket privado. Sem bucket (A) ou sem `FM_DOCS_KEY`, o CRM sobe, mas documentos ficam
desligados e a IA passa para a equipe toda vez que chega um documento (não finge que guardou).

## 3. Variáveis (só os NOMES; valores nunca no GitHub nem em mensagem)
Já existem no Render: `SNAPSHOT_URL`, `SNAPSHOT_ANON`, `SNAPSHOT_TOKEN`, `SNAPSHOT_KEY`, `NODE_ENV`, `TRUST_PROXY`, `COOKIE_SECURE`,
`PUBLIC_URL`, `WA_LIB_DIR`, `RESEND_API_KEY` (e as que você cadastrou antes).
**Novas, obrigatórias para a Etapa 2:**
- `FM_ETAPA2=1` — liga a Etapa 2 (sem ela o CRM roda como hoje: é também o "desligar rápido", ver rollback).
- `FM_DOCS_KEY` — 64 caracteres hexadecimais; cifra os documentos. **Perder = perder os documentos.** Gerar UMA vez e guardar no cofre de senhas.
- `FM_DADOS_KEY` — 64 hexadecimais; cifra CPF/CNPJ (coleta desligada por padrão, mas a chave precisa existir).
**Só no destino A (Render):** `DOCS_STORAGE=supabase`, `DOCS_SUPABASE_URL`, `DOCS_SUPABASE_KEY` (chave de serviço; nunca a pública),
`DOCS_SUPABASE_BUCKET` (bucket PRIVADO).
**Só no destino B (VPS):** ver `deploy/hostinger/crm.env.exemplo`.
Opcionais com padrão bom: `IA_CONFIRMACAO_MS` (6000), `IA_ATRASO_MS` (7000), `IA_MIDIA_REPETIR_MS` (3000,8000), `DOCS_MAX_MB` (10).

## 4. Antes de publicar (checklist)
1. `npm test` no commit que vai subir: **199/199** em 13/11 (rodar de novo no dia).
2. **Cópia de segurança verificável:** no Supabase do CRM, SQL Editor:
   `select id, criado_em, length(dados) from cofre.historico order by criado_em desc limit 3;` — anote o `id` mais recente
   (é o ponto de volta). O cofre guarda 1 versão por hora (48 h) e 1 por dia (15 dias).
3. Exportar CSV/PDF do que for importante (opcional, admin) e baixar.
4. Gerar `FM_DOCS_KEY` e `FM_DADOS_KEY` (ex.: no Termux: `openssl rand -hex 32`, duas vezes) e guardar no cofre de senhas.
5. (A) Criar o bucket privado e a chave no Supabase Storage. (B) Seguir o guia da Hostinger até o passo 4.
6. Avisar que o CRM ficará 2–5 min fora durante a publicação.

## 5. Publicação (destino A — Render)
1. Mesclar `etapa2` em `main` (com a autorização) e enviar ao GitHub.
2. Render → serviço → Environment ("Ambiente"): acrescentar as variáveis da seção 3.
3. Render → Manual Deploy ("Publicar manualmente") → Deploy latest commit.
4. Ao ligar, o CRM restaura o banco do cofre, faz uma cópia `pre-migracao-*` antes de CADA migração e aplica as 7 em ordem
   (cada uma numa transação, com verificação de integridade antes e depois). Se uma falhar, ela é desfeita e o CRM não sobe.

## 6. Verificação de saúde (logo depois)
1. `https://<CRM>/api/health` → `{"ok": true}`.
2. Logado como administrador, abrir `https://<CRM>/api/admin/saude` e conferir:
   `versao` = `2.1.0-rc.1`; `etapa2: true`; `banco.quick_check: "ok"`; `migracoes.versao_atual: 7` e `pendentes: []`;
   `documentos.pronto: true` e `documentos.prova: "ok"` (gravou, leu e apagou um arquivo de prova cifrado);
   `whatsapp.estado: "conectado"`; `ia.chave_configurada: true`.
3. Registro do Render: procurar `[migracoes]` (7 aplicadas) e nenhum `erro`.
4. Abrir o CRM no celular, entrar, abrir uma ficha de motorista (7 documentos) e a tela Documentos.
5. Fazer o roteiro `docs/ROTEIRO-TESTES-REAIS.md`.

## 7. Plano de volta (rollback), do mais leve ao mais pesado
1. **Desligar a Etapa 2 sem mexer em código:** apagar `FM_ETAPA2` no Render e reiniciar. O CRM volta a funcionar como hoje; as
   tabelas novas ficam no banco, sem uso. Documentos já guardados continuam cifrados (nada é perdido).
2. **Voltar o código:** Render → Deploys → o último deploy do `main` antigo (commit `379db76`) → "Rollback". O banco migrado
   continua compatível (as migrações só acrescentam).
3. **Voltar os dados** (só se algo estragou dados — perde o que foi feito depois): no Supabase, copiar `dados` da versão anotada
   em `cofre.historico` para `cofre.snapshot` (roteiro em `supabase/cofre.sql`) e reiniciar o serviço.

## 8. Se der errado (recuperação)
- **CRM não sobe e o log diz "cofre":** o cofre não respondeu (fail-closed, não sobe vazio). Ver o Supabase; reiniciar.
- **"Chave FM_DOCS_KEY é diferente":** a chave mudou. Recolocar a chave certa (a do cofre de senhas). Nunca gerar outra.
- **Migração falhou:** o CRM não sobe. No Render a cópia `pre-migracao-*` fica no disco temporário (some ao reiniciar): o ponto de
  volta seguro é a versão anotada em `cofre.historico`. Fazer a opção 1 do rollback e me mandar o log.
- **WhatsApp desconectado:** Configurações → WhatsApp → parear de novo (o número continua o mesmo).
- **Gemini sem cota:** a IA passa para a equipe; nada se perde. Volta sozinho quando a cota renova.
