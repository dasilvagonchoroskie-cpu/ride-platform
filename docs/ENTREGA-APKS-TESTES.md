# Entrega dos APKs para teste real — 13/11/2026

Compilados a partir da **main** (commit `4e32644`, que já contém a PR #59 integrada, merge `54725a1`).
Montagem feita pelo GitHub Actions (Android APKs, execução 426; Android Comércio, execução 17), por volta das 06:57–06:59 (Brasília).

> **Nenhum teste em aparelho físico foi feito.** Tudo abaixo é verificação por computador (arquivo, pacote, versão, assinatura, permissões, servidor). A instalação e o uso real são sua etapa.

## 1. Os quatro aplicativos (arquivo principal = celular de 64 bits, o comum hoje)

| App | Arquivo | Pacote (id) | Versão | Tamanho | Assinatura |
|---|---|---|---|---|---|
| Fortaleza Move Central | `Fortaleza-Move-Central.apk` | `com.rideplatform.central_app` | 1.0.426 (código 2426) | 21,3 MB | chave de release da Fortaleza |
| Fortaleza Move (Passageiro) | `Fortaleza-Move-Passageiro.apk` | `br.com.fortalezamov.passageiro` | 1.0.426 (código 2426) | 21,0 MB | idem |
| Fortaleza Move Motorista | `Fortaleza-Move-Motorista.apk` | `br.com.fortalezamov.motorista` | 1.0.426 (código 2426) | 20,9 MB | idem |
| Fortaleza Move Comércio | `Fortaleza-Move-Comercio.apk` | `br.com.fortalezamov.comercio` | 1.0.17 (código 2017) | 18,5 MB | idem |

- Os quatro ids são diferentes entre si e iguais aos que já estavam no código (nada foi renomeado). Instalam lado a lado e **por cima** das versões antigas (mesma chave de assinatura).
- Versão: o número depois de `1.0.` é o da montagem (426; o Comércio tem contador próprio, 17). Código 2xxx = 64 bits; 1xxx = 32 bits.
- Pasta `32-bits-opcional/`: as mesmas montagens para celulares Android antigos de 32 bits. Só use se o de 64 bits não instalar.
- `SHA256.txt`: soma de conferência de cada arquivo.
- Compilação: `flutter build apk --release --obfuscate`, Flutter 3.47.5, minSdk 24 (Android 7), targetSdk 36. **Sem AAB** (não é necessário para teste por instalação direta).
- Os mesmos arquivos também estão nas Releases do GitHub (`apk-fortaleza-central-mais-recente`, `apk-ride-passenger-mais-recente`, `apk-ride-driver-mais-recente`, `apk-fortaleza-comercio-mais-recente`).

## 2. Resultado da verificação (feita por computador)

| Item | Central | Passageiro | Motorista | Comércio |
|---|---|---|---|---|
| Arquivo existe, não vazio, zip íntegro | OK | OK | OK | OK |
| Pacote e nome do app conferem | OK | OK | OK | OK |
| Versão e código de versão | OK | OK | OK | OK |
| Assinatura (esquema v2) válida, mesmo certificado nos 4 | OK | OK | OK | OK |
| Permissões coerentes com a função | OK | OK | OK | OK |
| Backup automático desligado, não depurável | OK | OK | OK | OK |
| Sem chave privada, senha, token ou URL de banco dentro | OK | OK* | OK* | OK |
| Servidor apontado | produção | produção | produção | produção |

- **Certificado** (igual nos 4): CN "Fortaleza Digital Security", Goiatuba/GO, válido até 10/02/2054, SHA-256 `D7FDCEE3A2943264DEF1F81C248917D53DC9D7292DB870111F0DBAA6B0C3424D`. É a chave de release que já existe nos segredos do GitHub; nenhuma chave nova foi criada e nenhuma chave de teste foi usada.
- \* Passageiro e Motorista contêm a **chave pública de configuração do Firebase** (necessária para avisos push; é pública por desenho, não é segredo). Nenhum outro segredo foi achado. Central e Comércio não usam Firebase.
- **Cofre da Central:** o código novo (cofre seguro, migração de sessão, renovação automática com o app fechado) foi compilado de verdade; conferi no APK que as rotinas de leitura/gravação do cofre e a renovação `/api/auth/refresh` estão presentes, igual ao Motorista, que já rodava assim.
- Permissões de destaque: Motorista pede GPS, serviço em primeiro plano de localização, sobreposição de tela (chamada) e notificações; Passageiro pede GPS e notificações; Central pede GPS e notificações; Comércio pede só internet e estado de rede (sem GPS).
- **Não verificado:** instalação em emulador ou aparelho (nenhum disponível aqui). Rodar de fato é com você.

## 3. Servidor que os apps usam e compatibilidade

- Os quatro apps falam com `https://fortaleza-mov-backend.onrender.com`. É o **servidor de produção**; não existe ambiente de homologação separado. Os testes de rua usam, portanto, dados reais da produção (use contas de teste).
- O servidor no ar já é a versão integrada: o Render publicou sozinho após o merge, a inicialização terminou sem erro, e as rotas novas estão no ar (conferido nos registros): `/api/comercio/*`, `/api/driver/manual-deliveries/*` e as demais das 23 rotas que faltavam antes do merge. Compatibilidade app × servidor: **OK**.
- Observação operacional: no plano gratuito, cada commit na main (inclusive os relatórios automáticos dos robôs) faz o Render publicar de novo, e o servidor reinicia por ~1 minuto. **Durante o teste de rua não vou enviar nada para a main.** Se um robô enviar relatório no meio, pode haver uma oscilação curta.

## 4. Antes de testar (itens seus)

1. `OTP_DEBUG_RETURN` continua ligado (não mexi). O código de login aparece na resposta; isso é para teste, desligar só com sua ordem.
2. Chave global do Comércio continua **bloqueada**; Moto e Entrega **não foram ativadas**. Roteiros T e U só com sua autorização expressa e a Entrega ligada em uma cidade de teste (a configuração de moto de Goiatuba foi preservada sem alteração).
3. O segredo `RENDER_DEPLOY_HOOK` do GitHub continua vazio: o deploy automático funciona pelo próprio Render, então não bloqueia nada, mas o aviso continua nas esteiras.
4. Autenticação em duas etapas do proprietário: não ativada (conforme sua ordem).

## 5. Como instalar e testar

**Instalar**
1. Copie os quatro `.apk` para o celular (WhatsApp para você mesmo, cabo, Drive).
2. Toque no arquivo. Se o Android pedir, libere "Instalar apps desconhecidos" para o app que abriu o arquivo.
3. Instale por cima dos antigos (não desinstale: o teste A é justamente atualizar sem deslogar).

**Ao abrir pela primeira vez**
- Permita **localização "Durante o uso"** e depois "Sempre" (Motorista), **notificações**, e no Motorista "Sobrepor a outros apps".
- Em celular Xiaomi/Samsung/Motorola/Huawei: desligue a economia de bateria do app e libere "iniciar automaticamente" (o app mostra o atalho em "Abrir ajuste", roteiro K).
- Entre com sua conta (código por e-mail/telefone). Confirme que carregou o mapa e que o app não mostra aviso de falta de conexão.

**Conferência rápida de que o app fala com o servidor** (1 minuto cada): Passageiro mostra o mapa e o preço estimado; Motorista fica "online" e a Central o vê no mapa; Central lista corridas/motoristas; Comércio mostra o painel da loja.

**Ficha completa:** `docs/TESTE-DE-RUA-FICHA.md` (roteiros 1–4 e A–V, com critério de aprovado/falhou) e `docs/TESTE-DE-RUA.md` (passo a passo). Anote o horário de cada passo.

**Quais precisam de 2 ou mais aparelhos**

| Roteiro | Aparelhos |
|---|---|
| 1, 2, 3, D, E, F, G, H, V (corrida de ponta a ponta, avisos, taxímetro, carteira) | 2 celulares (Passageiro + Motorista) + Central aberta no computador |
| B (aparelhos e desconectar), L, M | 2 celulares com a mesma conta |
| N, O, P (trocar contato, recuperar acesso, duas etapas) | 1 celular + e-mail |
| Q (Central) | 1 aparelho com a Central; mais 1 para provocar aviso com app fechado |
| R (renovação do login por 20 min) | 1 celular |
| S (mapa operacional/Motos) | Central + 1 motorista |
| T (entrega manual do motorista) | Motorista + Central (**só com autorização**) |
| U (Comércio de ponta a ponta) | Comércio + Motorista + Central (**só com autorização**) |
| A, C, I, J, K | 1 celular |

**Testes da Central (administrador):** abrir logado após atualizar por cima, ficar 20 min parado e seguir logado, sair e entrar, ver o mapa operacional, a frota (suspensão/validade do CRLV) e a lista de comércios.

## 6. Limitações

- Nada foi provado em aparelho real: GPS, avisos push com tela apagada, economia de bateria de cada marca, mapa em Goiatuba e taxímetro dependem do seu teste.
- Assinatura somente no esquema v2 (suficiente para Android 7+, que é o mínimo dos apps).
- Mapa: sem chave própria do Google Maps no pacote de teste, o mapa usa o TomTom pelo servidor.
- Sem ambiente de homologação: o teste é feito na produção.
- A Loja Play não foi tocada; a instalação é direta pelo arquivo.
