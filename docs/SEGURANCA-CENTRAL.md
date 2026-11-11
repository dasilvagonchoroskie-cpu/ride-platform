# Revisão de segurança da Central (Requisição 1, item 4)

Data: 11/11/2026 · Servidor no ramo `aparelhos-e-cofre` (PR #54).

## Como foi feita

1. **Inventário automático das rotas.** Um script leu todos os controladores
   do servidor (`apps/backend/src/modules/**/*.controller.ts`): **241 rotas**,
   **86 da Central** (`/admin/...`).
2. **Conferência das travas de cada rota da Central:** quem pode chamar
   (papel), se é só do dono (`SoDonoGuard` / `DonoGravaGuard`) e se filtra
   pela cidade do operador.
3. **Leitura linha a linha** das rotas que o script marcou como "sem filtro
   de cidade visível" e das rotas novas de aparelhos.
4. Testes automáticos para o que foi corrigido.

O que **não** foi feito: teste de invasão de fora (pentest) nem revisão
linha a linha de todas as 241 rotas. A revisão cobre as travas de acesso da
Central.

## Travas que valem para todo pedido (servidor)

| Ordem | Trava | O que faz |
|---|---|---|
| 1 | `LimitePorClienteGuard` | limite de pedidos por cliente/IP |
| 2 | `JwtAuthGuard` | exige login (menos nas rotas públicas abaixo) e confere se a sessão/aparelho foi cortado (`SessoesService`) |
| 3 | `RolesGuard` | todas as 86 rotas `/admin` exigem conta da Central (`ADMIN`) |
| 4 | `SenhaProvisoriaGuard` | operador com senha provisória só troca a senha |

Rotas públicas (sem login), todas conferidas: entrar/código/senha/renovar
(`/auth/...`, com limite de tentativas), excluir conta pela internet
(`/conta/exclusao`), `/health`, termos e privacidade (`/legal/...`),
configuração e logo do app (`/app/config`, `/app/logo`), relatório por link
assinado (`/relatorios/:token/:arquivo`) e lista de categorias de carro
(`/vehicles/categorias`).

## Resultado

| # | Achado | Gravidade | Situação |
|---|---|---|---|
| A1 | **Dados pessoais sem filtro de cidade.** O operador de uma cidade conseguia ver e mudar os dados (CPF, endereço, Pix…) de **qualquer pessoa**, de qualquer cidade, inclusive passageiros, e aprovar pedidos de mudança de motoristas de outras cidades (`/admin/dados/...`). | Alta | ✅ **Corrigido**: dono vê todos; operador só os **motoristas da cidade dele**; passageiros e contas da Central só o dono. Fora do alcance a resposta é "não encontrado". 4 testes automáticos novos. |
| A2 | Lista de aparelhos não separava celulares (nome fixo nos apps) e não dava para desconectar um só. | Média | ✅ **Corrigido** (código por instalação + desconectar um aparelho, só o dono, com registro na auditoria). |
| A3 | O teste de ponta a ponta gravava configuração de produção (aparência, aviso de saldo, entregas, tarifas e ligava o Conforto na cidade por ~1 min). | Média | ✅ **Corrigido**: por padrão o teste não grava nada disso (`MUDAR_CONFIG=nao`); essas partes aparecem como "PULADO". |
| A4 | **Senha trocada não derruba na hora o acesso já aberto em outro celular.** As renovações são cortadas, mas o acesso que já estava aberto dura até 15 min. | Média | ⏳ Proposta na decisão R4 (`docs/RECUPERACAO-DE-CONTAS.md`): ao recuperar ou trocar a senha, derrubar todos os aparelhos na hora. |
| A5 | Duas etapas (autenticador) **desligada na conta do dono**. Hoje a conta do dono entra só com senha ou código no e-mail. | Alta | ⏳ Pronto para ligar com você (`docs/DUAS-ETAPAS-DONO.md`). |
| A6 | Código de entrada aparece na tela para conta sem e-mail (`OTP_DEBUG_RETURN` ligado). | Alta antes da loja | ⏳ Mantido ligado por sua ordem; desligar antes de publicar (`docs/GOOGLE-PLAY.md`, 6.5). |
| A7 | O teste de ponta a ponta cria corridas de teste em Goiatuba: um motorista **real** que esteja disponível perto do ponto do teste pode ver a oferta por alguns segundos (ela é cancelada logo). | Baixa | ⏳ Proposta: rodar o teste de ponta a ponta fora do horário de operação, ou mover o ponto do teste para fora da área atendida. Decisão sua. |
| A8 | Redis: o servidor só testa a conexão, nada usa o Redis. | Informativo | Sem risco; entra no plano da Hostinger. |

Conferido e **sem problema**: as rotas de carros da Central (`/admin/vehicles/...`)
filtram pela cidade do carro (`doCarro`); aprovação de categoria e de carro,
passageiros, exclusões, limpeza, equipe, cidades, desconectar e tarifas são
só do dono ou filtradas pela cidade; ações sensíveis gravam `audit_logs`.

## Testes desta revisão

- Automáticos (servidor): `sessoes.spec.ts` (9 testes, inclui desconectar um
  aparelho) e `dados-pessoais-alcance.spec.ts` (4 testes) — rodados aqui e na
  esteira `testes-servidor.yml`.
- Ponta a ponta (servidor de produção, contas de teste): ver o relatório da
  execução no PR / `logs/teste-ponta-a-ponta.txt`.
- Aparelho real: não se aplica a este item.
