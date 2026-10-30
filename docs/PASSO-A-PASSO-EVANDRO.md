# O que só o Evandro pode fazer — passo a passo pelo celular

Cada passo leva poucos minutos. Nomes dos botões: em inglês como aparecem na
tela, com a tradução entre parênteses. **Nunca mande senha ou chave no chat**:
elas vão direto no lugar indicado.

---

## 1. Tornar o repositório privado (fazer primeiro)

Antes, apague a chave antiga do Google Maps que ficou no histórico (passo 1.1):
esconder não apaga o que já foi copiado.

**1.1 Apagar a chave antiga do Google Maps (a chave antiga do Google Maps (Lord Perfumaria), a da Lord Perfumaria)**
1. Abra console.cloud.google.com com a conta onde a chave foi criada.
2. Menu ☰ → APIs & Services ("APIs e serviços") → Credentials ("Credenciais").
3. Na lista API Keys ("Chaves de API"), abra a que começa com a chave antiga do Google Maps (Lord Perfumaria).
4. Se a Lord Perfumaria usa essa chave: Regenerate key ("Gerar chave de novo")
   e me mande só o aviso "troquei" (a chave nova eu ponho onde precisar sem
   ela aparecer). Se não usa: Delete ("Excluir").

**1.2 Restringir a chave do Firebase (a chave do Firebase (projeto fortaleza-mov), projeto fortaleza-mov)**
1. Mesmo lugar (Credentials), abra a chave "Android key (auto created by Firebase)".
2. Application restrictions ("Restrições de aplicativo") → Android apps ("Apps Android").
3. Add ("Adicionar") duas vezes:
   - Package name ("Nome do pacote") `br.com.fortalezamov.passageiro`
   - Package name `br.com.fortalezamov.motorista`
   - nos dois, SHA-1: `F2:70:E9:8C:C6:A8:F0:1D:31:4D:9E:3A:45:AE:42:77:3A:8D:96:C3`
   (é a impressão digital pública da assinatura dos APKs, não é segredo).
4. Save ("Salvar").

**1.3 Trocar a senha da Central, se ainda for a senha inicial do sistema**
Central → tela de entrada → **Esqueci a senha** → código no e-mail → senha nova.

**1.4 Tornar privado**
1. Abra github.com/dasilvagonchoroskie-cpu/ride-platform.
2. Settings ("Configurações") → General ("Geral") → role até o fim.
3. Danger Zone ("Zona de perigo") → Change repository visibility ("Alterar
   visibilidade do repositório") → Change to private ("Tornar privado").
4. Digite o nome que ele pedir e confirme (I want to make this repository
   private → "Quero tornar este repositório privado").
5. Me avise "repositório privado": eu confiro se o Render continua
   publicando o servidor e se as esteiras rodam. Links dos Releases passam a
   pedir login (eu continuo mandando os APKs aqui no chat).

---

## 2. TomTom: limitar a chave e acompanhar o uso

A TomTom **não manda alerta de uso** por e-mail (a página dela só fala em
acompanhar no painel). O alerta de 70% e o modo economia de 80% são do nosso
servidor e aparecem na Central (Configurações → Mapa → "ATENÇÃO: passou de
70% da cota do mês").

**2.1 Limitar a chave atual (a do servidor)**
1. Abra developer.tomtom.com e entre (Sign in → "Entrar").
2. Dashboard ("Painel") → Keys ("Chaves") → toque na chave do Fortaleza Move.
3. Em Products ("Produtos") deixe marcados só: **Map Display API**,
   **Search API** e **Routing API**. Desmarque o resto.
4. Save Key ("Salvar chave").

**2.2 Criar a chave só do mapa (a que vai para os celulares)**
1. Keys → Add Key / Create a new key ("Adicionar / criar chave") → nome `Fortaleza Move - mapa`.
2. Products: marque **só Map Display API** → Create ("Criar").
3. Copie a chave nova (não mande no chat).
4. Abra dashboard.render.com → serviço **fortaleza-mov-backend** →
   Environment ("Ambiente") → Add Environment Variable ("Adicionar variável").
5. Key ("Nome"): `TOMTOM_API_KEY_MAPA` · Value ("Valor"): cole a chave →
   Save Changes ("Salvar alterações"). O Render republica sozinho (~2 min).
6. Me avise "pus a chave do mapa": eu confiro que os celulares passaram a
   receber a chave nova (sem mostrar nenhuma das duas).

**2.3 Acompanhar** — uma vez por semana: developer.tomtom.com → Dashboard →
Activity ("Atividade"). Compare com a Central → Configurações → Mapa.

---

## 3. Ligar a verificação em duas etapas na sua conta da Central

1. Instale o **Google Authenticator** (Play Store).
2. Central → Configurações → **Segurança** → **Ligar com o Google Authenticator**.
3. Toque em **Abrir no Google Authenticator** (ou, no Authenticator, "+" →
   Enter a setup key → "Inserir chave de configuração" e digite a chave).
4. Volte à Central, digite o código de 6 números e toque em **Ligar**.
5. Aparecem 8 **códigos de recuperação**: escreva no papel e guarde fora do
   celular. Toque em **Já guardei**. Cada código entra uma vez se você perder
   o celular.

---

## 4. Testar a restauração da cópia do banco

Restaura a cópia mais nova num banco **de teste** e confere tabela por
tabela. Não mexe no banco de verdade (a esteira para se o banco de teste já
tiver dados).

1. Abra supabase.com/dashboard com a conta onde está o projeto
   **fortaleza-mov** → New project ("Novo projeto") → nome
   `teste-restauracao`, região São Paulo, uma senha forte (anote) → Create
   new project ("Criar projeto"). É grátis (até 2 projetos).
2. No projeto novo: Connect ("Conectar") → aba **Session pooler** (não a
   "Direct connection": o GitHub não alcança essa) → copie o endereço que
   começa com `postgresql://` e troque `[YOUR-PASSWORD]` pela senha do passo 1.
3. github.com/dasilvagonchoroskie-cpu/ride-platform → Settings ("Configurações")
   → Secrets and variables ("Segredos e variáveis") → Actions → New
   repository secret ("Novo segredo do repositório"):
   - Name ("Nome") `BANCO_TESTE_URL` → Secret ("Segredo"): o endereço do passo 2 → Add secret.
   - Name `COPIA_BANCO_CHAVE` → Secret: a chave privada da cópia (a linha
     que começa com `AGE-SECRET-KEY-1`, do arquivo CHAVE-PRIVADA-COPIA-DO-BANCO-30-10-2026.txt que eu mandei) → Add secret.
4. Actions ("Ações") → **Testar a restauracao da copia** → Run workflow
   ("Executar fluxo de trabalho") → Branch `main` → Run workflow.
5. Me avise "rodei a restauração": eu leio o resultado (fica em
   `logs/restauracao.txt`, só com as contagens, sem dados).
6. Depois do OK: Supabase → projeto `teste-restauracao` → Project Settings
   → General → Delete project ("Excluir projeto"); e no GitHub apague o
   segredo `BANCO_TESTE_URL` (o `COPIA_BANCO_CHAVE` pode ficar para o
   próximo teste ou ser apagado também).

Sobre "reconectar o Supabase": o conector do Supabase aqui no Claude está
ligado a outra conta (só aparece o projeto da gestão de frota). Só precisa
reconectar se você quiser que eu mexa direto no banco do Fortaleza Move:
claude.ai → Settings ("Configurações") → Connectors ("Conectores") →
Supabase → Disconnect ("Desconectar") → Connect ("Conectar") com a conta do
fortaleza-mov. Para o teste de restauração acima, não precisa.

---

## 5. Mandar os ícones e as 20 ruas

**Ícones** — aqui no chat, como arquivo:
- 2 imagens PNG: símbolo do **passageiro** e do **motorista**;
- **fundo transparente** (só o desenho), **1024 x 1024** px, desenho
  quadrado, em cor que apareça bem sobre o azul #0070B8 (ex.: branco).
Eu gero o Android (adaptativo e redondo), o iPhone (18 tamanhos + 1024 da
App Store) e o 512 da Google Play, e aviso se alguma imagem fugir disso.

**20 ruas de Goiatuba** — uma por linha, como o passageiro digitaria (ex.:
"Rua Goiás 150", "Avenida Brasília", "Rodoviária"). Eu rodo a busca de cada
uma no servidor real e mostro o que voltou em primeiro lugar.
