# Firebase (aviso push) — Fortaleza Move

Atualizado em 13/11/2026. Só descreve o que está no código. **Nenhuma chave aparece aqui**: os valores
ficam no Render e em `infra/firebase-apps.b64` (configuração pública, vai dentro do APK de qualquer jeito).

## Para que serve
Só **aviso push** (Firebase Cloud Messaging, API v1): acordar o celular do motorista com um chamado novo, avisar o
passageiro das etapas da corrida (aceita, chegando, chegou, iniciou, terminou, cancelada) e mandar avisos simples
(ex.: "dados atualizados", desconexão de aparelho). **Não** guarda dados: o banco é o PostgreSQL (Supabase) e só o
servidor fala com ele. A Central não usa Firebase.

## Quem tem push hoje
| App | Push | Como liga |
|---|---|---|
| Passageiro (`br.com.fortalezamov.passageiro`) | Sim (**sem prova no celular**) | `firebase.xml` gerado na esteira dos APKs |
| Motorista (`br.com.fortalezamov.motorista`) | Sim (**sem prova no celular**) | idem |
| Central | Não (alerta de SOS e cadastro funcionam com o app aberto/minimizado) | — |
| Comércio | **Não tem Firebase.** O aviso da loja é o sino dentro do app. | Depende do dono registrar o app no projeto (ver abaixo) |

## Como as peças se encaixam
1. **Projeto Firebase** `fortaleza-mov` (criado pelo Evandro em 09/10/2026). O `google-services.json` do projeto,
   codificado em base64, está em `infra/firebase-apps.b64`.
2. **Esteira dos APKs** (`android-apks.yml`, passo "Ligar o aviso push (Firebase)"): roda
   `scripts/firebase-config.py`, que cria `res/values/firebase.xml` (e `keep.xml`) em cada app que estiver no arquivo e
   **falha a esteira** se o arquivo do app não nascer. Quem não está no arquivo continua só com o vigia próprio.
3. **App**: dependência `firebase-messaging` (BoM 33.7.0); ao entrar, manda o endereço de push do celular ao servidor.
4. **Servidor** (`apps/backend/src/integrations/notifications/`):
   - `fcm.ts` assina o JWT da conta de serviço, troca por acesso do Google (vale 1 h, guardado) e envia. Sem biblioteca extra.
   - `push.service.ts` guarda o endereço no aparelho da sessão (tabela `devices`, coluna `fcm_token`), tira o mesmo
     endereço de outra conta que usava o celular, apaga o endereço quando o Google diz que não existe mais
     (app desinstalado) e esquece o endereço ao sair da conta ou ao **desconectar um aparelho**.
   - Variáveis do servidor (Render → Environment): `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`.
     Sem elas o push fica **desligado** e o servidor segue normal.
5. **Conferência na subida**: o servidor manda uma mensagem para um endereço que não existe; "endereço inválido"
   prova que o Google aceitou a chave. O resultado aparece em `/health` → `dependencies.push`
   (`desligado`, `conferindo`, `ok` ou `falhou`). O teste de ponta a ponta confere esse campo.

## Operação
- **Ver se está funcionando:** `/health` com `push: "ok"`. `falhou` = olhar o registro do servidor ("Push (Firebase) com problema").
- **Trocar a chave da conta de serviço:** gerar outra no console do Firebase, gravar nas três variáveis `FCM_*` no
  Render e reiniciar. Nunca colocar a chave no repositório, em chat ou em log. A `FCM_PRIVATE_KEY` pode ter `\n`
  escrito: o servidor converte em quebra de linha.
- **Mudou o `google-services.json`** (app novo registrado): atualizar `infra/firebase-apps.b64` e gerar APKs de novo.
  Confira se o pacote do app está na lista `APPS` de `scripts/firebase-config.py`.
- **Chamado não acorda o celular:** conferir (1) `/health` push ok, (2) o motorista entrou depois da versão com
  push (o endereço é gravado no login), (3) bateria/economia do fabricante, (4) Central → detalhe do motorista → **Aparelhos**
  mostra o aparelho.

## Falta (não decidido por mim)
- **Prova no celular real** do push com o app fechado (roteiro em `docs/TESTE-DE-RUA.md`). Hoje só o servidor foi provado (`/health` ok).
- **Firebase do Comércio:** exige registrar o app `br.com.fortalezamov.comercio` no projeto e atualizar o
  `google-services.json`; é conta do dono. Enquanto isso, o aviso é o sino dentro do app.
- Cota/custo do FCM: o envio é gratuito; qualquer plano pago do Google Cloud só entra com autorização.
