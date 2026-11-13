# Migração do CRM para a VPS da Hostinger — guia simples (PREPARADO, NÃO EXECUTADO)

> Situação em 12/11/2026: decisão do dono = hospedagem definitiva numa VPS da Hostinger, **antes do lançamento**.
> Nada foi comprado, nada foi migrado, o Render e o Supabase de produção continuam como estão.
> Este guia só é seguido quando o dono autorizar o dia da migração.

## O que está nesta pasta
| Arquivo | Para que serve |
|---|---|
| `provisionar.sh` | Prepara a VPS nova: atualizações, Node.js 22, Nginx, HTTPS (Certbot), firewall, Fail2ban, usuário de serviço, pastas fechadas. |
| `instalar-crm.sh` | Baixa o código do GitHub, instala dependências exatas, **roda os testes** e só então troca a versão no ar (guarda as 5 anteriores). |
| `gerar-chaves.sh` | Gera **na VPS** só as chaves que ainda estão vazias (nunca troca uma existente). |
| `crm.env.exemplo` | Modelo das configurações (sem nenhum segredo). Vira `/etc/fortaleza-crm/crm.env`. |
| `crm.service` | Serviço do sistema (liga sozinho, reinicia se cair, processo sem privilégios). |
| `nginx-crm.conf` | Porta de entrada HTTPS (limite de acessos por IP, documentos até 10 MB). |
| `backup-crm.sh` + `crm-backup.timer` | Cópia de segurança **cifrada** todo dia às 03h15 (14 diárias + 8 semanais). |
| `restaurar-backup.sh` | **Testa** uma cópia (padrão) ou restaura de verdade (`--aplicar`, pede confirmação, guarda os dados atuais ao lado). |
| `verificar-saude.sh` + `crm-saude.timer` | A cada 5 min: o CRM responde? disco cheio? cópia de hoje existe? Reinicia se travar. |

## Antes do dia (o dono)
1. **Contratar a VPS** na Hostinger: plano KVM 2 ou maior (2 vCPU, 8 GB), sistema **Ubuntu 24.04 LTS**, região mais próxima do Brasil.
   Na criação, escolher **acesso por chave SSH** (SSH key) em vez de senha, se o painel oferecer.
2. **Domínio**: escolher o endereço do CRM (ex.: `crm.seudominio.com.br`) e criar no DNS um registro **A** apontando para o IP da VPS.
3. **Cofre de senhas**: ter onde guardar as chaves novas (ex.: Bitwarden). Nada de chave em mensagem ou e-mail.
4. Separar as variáveis atuais do Render (Render → Environment): `SNAPSHOT_URL`, `SNAPSHOT_ANON`, `SNAPSHOT_TOKEN`,
   `SNAPSHOT_KEY`, `RESEND_API_KEY`, `FM_DOCS_KEY` e `FM_DADOS_KEY` (se já existirem). **Copiar, não gerar de novo.**

## Dia da migração (≈ 1 h, num horário de pouco movimento)
1. **Preparar a VPS** (terminal da VPS, como root): baixar esta pasta e rodar `bash provisionar.sh`.
2. **Instalar o CRM**: `bash /usr/local/lib/fortaleza-crm/instalar-crm.sh` (ramo `main`; só outro ramo com autorização).
3. **Configurar**: `nano /etc/fortaleza-crm/crm.env` → colar os valores copiados do Render; `PUBLIC_URL=https://<domínio>`;
   manter `SNAPSHOT_MODO=copia`. Depois `bash /usr/local/lib/fortaleza-crm/gerar-chaves.sh` (gera só o que estiver vazio)
   e **guardar as chaves geradas no cofre de senhas**.
4. **HTTPS**: `sed "s/CRM_DOMINIO/<domínio>/g" /etc/nginx/sites-available/fortaleza-crm.modelo > /etc/nginx/sites-available/fortaleza-crm`,
   `ln -s /etc/nginx/sites-available/fortaleza-crm /etc/nginx/sites-enabled/`, `certbot --nginx -d <domínio>`, `nginx -t && systemctl reload nginx`.
5. **Trazer os dados e ligar**: `systemctl enable --now fortaleza-crm`. Na primeira vez, sem banco no disco, o CRM traz o
   retrato cifrado mais recente do cofre (os mesmos dados do Render) e **assume o cofre**: o Render para de gravar por cima.
   Daí em diante o disco da VPS é a fonte (`SNAPSHOT_MODO=copia`) e o cofre recebe só cópias cifradas.
6. **Conferir** (`journalctl -u fortaleza-crm -n 50` e no navegador): login, motoristas, conversas, documentos abrindo,
   WhatsApp conectado (pode pedir novo pareamento), IA respondendo uma mensagem de teste.
7. **Ligar as rotinas**: `systemctl enable --now fortaleza-crm-backup.timer fortaleza-crm-saude.timer`, rodar uma cópia na
   hora (`systemctl start fortaleza-crm-backup`) e **testar a restauração**: `bash /usr/local/lib/fortaleza-crm/restaurar-backup.sh <arquivo>`.
8. **Suspender (não apagar) o Render**: Render → serviço `crm-fortaleza-move` → *Suspend* (Suspender). Desligar no Supabase o
   cron `crm-manter-acordado` (ele só servia para o Render não dormir).

## Plano de volta (rollback)
- **Problema no código novo**: `ln -sfn /opt/fortaleza-crm/releases/<versão anterior> /opt/fortaleza-crm/app && systemctl restart fortaleza-crm`.
- **Problema na VPS no dia da migração**: parar o CRM na VPS (`systemctl stop fortaleza-crm`) e reativar o Render (*Resume*):
  ao ligar, ele restaura o retrato mais recente do cofre — que já inclui o que foi feito na VPS — e volta a ser o dono.
- **Dados estragados**: `restaurar-backup.sh <cópia> --aplicar` (os dados atuais ficam guardados ao lado, nada é apagado).
- O Render fica **suspenso por pelo menos 30 dias** antes de qualquer decisão de apagar.

## Depois da migração
- **Aplicativo Android**: gerar um APK novo apontando para o domínio novo e preencher `TWA_PACOTE`/`TWA_SHA256` (o
  servidor publica `/.well-known/assetlinks.json`). Sem isso o app abre com a barra do navegador.
- **Integração com o aplicativo do motorista**: o mesmo valor de `FM_INTEGRACAO_SEGREDO` vai para o backend da plataforma
  (ver `docs/integracao-app-motorista.md`). O envio pelo backend ainda precisa ser feito (pendência de desenvolvimento).
- **IA paga (Gemini)**: quando contratar a API paga, só trocar a chave em *Configurações → Inteligência (IA)*; o código não muda.
- **Documentos**: ficam cifrados no disco da VPS (`/var/lib/fortaleza-crm/documentos`), entram na cópia diária e
  **todas as versões são guardadas** (decisão do dono de 12/11).
- **Cópia fora da VPS** (recomendado): configurar `rclone` com um destino do dono e pôr `BACKUP_DESTINO_RCLONE=` no `crm.env`.

## Segurança (o que estes arquivos garantem)
- O CRM só escuta em `127.0.0.1`; a internet fala só com o Nginx (HTTPS, HSTS, limite por IP). Firewall só com SSH/HTTP/HTTPS.
- Processo sem privilégios (`fortaleza-crm`, sem login, `ProtectSystem=strict`, só escreve na pasta de dados).
- Configurações em `/etc/fortaleza-crm` (640) e chaves geradas na própria VPS; nenhum segredo no GitHub nem nestes scripts.
- Atualização só entra se os testes passarem; cópias cifradas e restauração testável; fail-closed (sem cofre não sobe vazio).
- Nenhum sistema é "100% seguro": o que reduz o risco é manter atualizações automáticas ligadas, acesso SSH só por chave
  e conferir a cópia de segurança e o diário (`journalctl -t fortaleza-crm-saude`) de vez em quando.
