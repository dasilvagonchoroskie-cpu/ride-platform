# Revisão de segurança da Central (Requisição 1, item 4)

Data: 11/11/2026 · Servidor no ramo `aparelhos-e-cofre` (PR #54). Atualizado na Requisição de continuidade (PR #56): A4, A7 e A9–A14.

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
| A4 | **Senha trocada não derrubava na hora o acesso já aberto em outro celular** (durava até 15 min). | Média | ✅ **Corrigido** (R1, PR #56): trocar ou recuperar a senha derruba na hora todos os outros aparelhos; só o que trocou continua. |
| A5 | Duas etapas (autenticador) **desligada na conta do dono**. Hoje a conta do dono entra só com senha ou código no e-mail. | Alta | ⏳ Pronto para ligar com você (`docs/DUAS-ETAPAS-DONO.md`). |
| A6 | Código de entrada aparece na tela para conta sem e-mail (`OTP_DEBUG_RETURN` ligado). | Alta antes da loja | ⏳ Mantido ligado por sua ordem; desligar antes de publicar (`docs/GOOGLE-PLAY.md`, 6.5). |
| A7 | O teste de ponta a ponta cria corridas de teste em Goiatuba. | Baixa | ✅ **Resolvido**: conferido que o despacho automático já separa teste e real (corrida de teste só toca em motorista de teste e vice-versa); o despacho **manual** da Central não separava e agora recusa misturar; o teste roda **de madrugada** (04:37) e não roda mais depois de cada publicação. |
| A8 | Redis: o servidor só testa a conexão, nada usa o Redis. | Informativo | Sem risco; entra no plano da Hostinger. |
| A9 | **A chave do teste automático (`OTP_CHAVE_TESTE`) entra na conta do DONO sem as duas etapas.** As esteiras (teste de ponta a ponta, cópia do banco, desconectar aparelhos, trocar e-mail da Central) entram como o dono com essa chave. Quem tiver a chave (GitHub e Render) entra como dono, mesmo depois de ligar o Google Authenticator. É um atalho permanente, o que a R5 proíbe. | Alta | ⏳ **Precisa de decisão sua** (muda como as esteiras entram). Proposta: (1) criar uma **conta de serviço** da Central só para as esteiras, com nome próprio na auditoria, que pode ser desligada a qualquer momento; (2) a chave do teste deixa de valer para a conta pessoal do dono. Até lá: a chave fica só em segredos do GitHub e do Render, nunca no código. |
| A10 | O código de 6 números do e-mail ia para o registro (log) do servidor junto com o assunto do e-mail. | Média | ✅ **Corrigido**: o registro só diz "e-mail enviado" com o endereço mascarado. |
| A11 | **Operador de cidade aprovava ou mudava telefone e e-mail de motorista** da cidade dele: com isso ele podia entregar a conta a outra pessoa (golpe interno). | Alta | ✅ **Corrigido** (R2/R3): telefone e e-mail só o dono muda ou aprova; os outros dados o operador continua aprovando. Trocas pela Central avisam a pessoa e vão para a auditoria. |
| A12 | Passageiro trocava o e-mail sem código e, em seguida, o telefone com um código enviado a esse e-mail novo. | Média | ✅ **Corrigido** (R2): e-mail novo só com código no e-mail novo; aviso ao e-mail antigo; telefone só 48 h depois. |
| A13 | "Esqueci a senha" da Central com duas etapas trocava a senha **antes** do código do autenticador (quem tinha só o e-mail do dono trocava a senha dele). | Média | ✅ **Corrigido** (R5): a senha nova só vale depois do código do autenticador. |
| A14 | Trocar a senha revogava as renovações **também** do aparelho que trocou: em até 15 min o app pedia login de novo. | Baixa | ✅ **Corrigido** junto com R1. |

Conferido e **sem problema**: as rotas de carros da Central (`/admin/vehicles/...`)
filtram pela cidade do carro (`doCarro`); aprovação de categoria e de carro,
passageiros, exclusões, limpeza, equipe, cidades, desconectar e tarifas são
só do dono ou filtradas pela cidade; ações sensíveis gravam `audit_logs`.

## Testes desta revisão

- Automáticos (servidor): `sessoes.spec.ts` (9 testes, inclui desconectar um
  aparelho) e `dados-pessoais-alcance.spec.ts` (4 testes) — rodados aqui e na
  esteira `testes-servidor.yml`.
- Requisição de continuidade (PR #56): `recuperacao-de-contas.spec.ts`,
  `otp-abuso.spec.ts` e `recuperacao-assistida.spec.ts` (R1–R5, códigos
  expirados/repetidos/tentativas demais, operador sem poder sobre telefone e
  e-mail, Central travada até refazer as duas etapas).
- Ponta a ponta (servidor de produção, contas de teste): ver o relatório da
  execução no PR / `logs/teste-ponta-a-ponta.txt`.
- Aparelho real: não se aplica a este item.
