# Integração: aplicativo do motorista → CRM (protocolo v1)

Situação em 12/11/2026 (ramo `etapa2`, **não está em produção**):
- **Lado do CRM: pronto e testado** (`src/integracao.js`, rotas em `src/routes.js`, `test/candidaturas.test.js`).
- **Lado do backend da plataforma (`apps/backend`): NÃO implementado.** Falta o envio (ver "O que falta"). Sem o segredo
  configurado, as rotas do CRM respondem 404 (desligadas).

## Fluxo
1. Candidato se cadastra no aplicativo do motorista → backend envia **POST candidato**.
2. Para cada documento enviado no app → backend envia **POST documento** (o candidato precisa ter sido enviado antes).
3. No CRM o candidato entra em **Candidatos** (etapa "Cadastro recebido" → "Documentação pendente/recebida" sozinha pelos
   documentos). Análise, avaliação presencial e parecer são humanos. **Aprovar/recusar é só do administrador**, com confirmação.
4. A aprovação no CRM **não libera o motorista no aplicativo**: a liberação continua na Central (revisão administrativa do
   backend), como hoje. Integrar as duas decisões é uma pendência que depende de autorização do dono.

## Autenticação (obrigatória em toda chamada)
Segredo compartilhado `FM_INTEGRACAO_SEGREDO` (≥ 32 caracteres; gerado na VPS por `deploy/hostinger/gerar-chaves.sh`;
no backend, a mesma string em `CRM_INTEGRACAO_SEGREDO`). Na troca, o CRM aceita também `FM_INTEGRACAO_SEGREDO_ANTERIOR`.

Cabeçalhos:
| Cabeçalho | Valor |
|---|---|
| `X-FM-Timestamp` | segundos Unix (o CRM aceita ±300 s) |
| `X-FM-Nonce` | 16–64 caracteres `[A-Za-z0-9_-]`, **novo a cada chamada** (repetido → 409) |
| `X-FM-Meta` | só no documento: JSON (até 4000 caracteres) |
| `X-FM-Assinatura` | `v1=<hex do HMAC-SHA256(segredo, base)>` |

```
base = "v1." + timestamp + "." + nonce + "." + MÉTODO + "." + caminho + "." + sha256hex(X-FM-Meta ou "") + "." + sha256hex(corpo bruto)
caminho = "/api/integracoes/app-motorista/candidato"  ou  "/api/integracoes/app-motorista/documento"
```
Assinatura errada, horário fora da janela ou nonce repetido: nada é gravado (401/409, mensagem genérica). Limite: 240
chamadas por minuto por IP.

## POST /api/integracoes/app-motorista/candidato
Corpo JSON (`Content-Type: application/json`, assinado byte a byte como enviado):
```json
{ "externo_id": "id-do-motorista-no-backend", "nome": "Nome Completo", "telefone": "+5585999990000",
  "cidade": "Fortaleza", "veiculo": "Onix 2020 prata", "placa": "ABC1D23", "cnh_categoria": "B",
  "data_cadastro": "2026-11-12T13:00:00.000Z" }
```
- Obrigatórios: `externo_id` (8–64 `[A-Za-z0-9-]`), `nome` (≥ 3), `telefone` (10–13 dígitos). O resto é opcional.
- **Não enviar CPF nem número da CNH** (são ignorados; minimização LGPD).
- Mesmo `externo_id` ou mesmo telefone de uma ficha existente → liga à ficha e **só completa campos vazios**.
- Resposta: `201` (ficha criada) ou `200` (já existia) com `{ ok, registro_id, candidatura_id, criado }`.

## POST /api/integracoes/app-motorista/documento
Corpo = **bytes do arquivo** (JPG, PNG, WEBP ou PDF; até `DOCS_MAX_MB`, padrão 10 MB). `X-FM-Meta`:
```json
{ "externo_id": "id-do-motorista", "documento_externo_id": "id-do-documento-no-backend", "tipo": "CNH_FRONT",
  "nome_arquivo": "cnh.jpg", "enviado_em": "2026-11-12T13:05:00.000Z" }
```
| `tipo` (backend) | No CRM |
|---|---|
| `CNH_FRONT` | CNH |
| `CRLV` | CRLV |
| `RESIDENCE_PROOF` | Comprovante de endereço |
| `CNH_BACK`, `PROFILE_PHOTO`, `VEHICLE_FRONT`, `VEHICLE_BACK`, `VEHICLE_PLATE`, `CRIMINAL_RECORD` | "Outros" com nome fixo (ex.: "Certidão de antecedentes criminais") |

- Mesmo `documento_externo_id` → `200 { repetido: true }` (idempotente; reenvio é seguro).
- Outra foto do mesmo tipo → **nova versão** do mesmo documento (todas as versões ficam guardadas).
- O arquivo passa pelas mesmas regras de qualquer documento (assinatura do tipo, PDF com conteúdo ativo recusado) e é
  cifrado (AES-256-GCM). Candidato não enviado antes → `409 candidato_desconhecido`. Armazenamento desligado → `503`.

## O que falta (pendência de desenvolvimento)
- **Backend**: enviar o candidato ao concluir o cadastro e cada documento ao subir, com fila e nova tentativa (o CRM é
  idempotente), nonce aleatório, relógio sincronizado (NTP) e o segredo fora do repositório. Não foi feito porque o
  ambiente de desenvolvimento não consegue montar/testar o backend (motores do Prisma bloqueados) e porque mexe no sistema
  que está no ar — precisa de autorização do dono.
- Decidir se a aprovação no CRM deve, no futuro, avisar o backend (hoje não avisa).
