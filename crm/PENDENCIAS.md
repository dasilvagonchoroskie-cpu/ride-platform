# Pendências — CRM Fortaleza Move

Atualizado em 11/11/2026 (19h30, horário de Brasília). Lista única do que falta. Ao concluir um item, marcar com [x]
e a data; ao surgir um novo, acrescentar na seção certa. Detalhes técnicos de cada item estão no arquivo-mestre
(`PROJETO-crm-fortaleza-move.md`) e no `CLAUDE.md`.

## 1. Depende do dono (testes e ações que só ele pode fazer)

- [ ] **Testar o app 2.0.107 no celular** (ícone novo + correção do erro "ManageDataLauncherActivity"): instalar por
      cima do 2.0.105/2.0.106 e confirmar que abre e que o ícone aparece certo.
- [ ] **Testar as notificações com o CRM fechado**: Dashboard → "Ativar agora" → Permitir; deixar o app sem
      restrição de bateria no POCO; fechar, bloquear a tela e receber mensagem. Conferir os 3 tipos (mensagem nova,
      IA respondeu, transferência) e se o toque abre a conversa certa. Avisar o Claude para conferir o log do servidor.
- [ ] **Conta no Resend** com fortalezamovegtba@gmail.com e enviar a chave (re_…) — liga o "Esqueci minha senha" por
      e-mail. Até lá, a recuperação é por código de recuperação ou pelo painel do servidor.
- [ ] **Informações oficiais por assunto** (Configurações → Modelos de Comunicação da IA): cadastro, passageiro,
      encomendas, Clube de Vantagens, outros; depois, o site oficial.
- [ ] Trocar a senha inicial do administrador e gerar os códigos de recuperação.
- [ ] Conferir em Configurações se a chave do Gemini está salva e o "Testar conexão" passa.
- [ ] Verificação em duas etapas no Render, Supabase e GitHub (quando tiver o próprio celular).
- [ ] Decidir a hospedagem definitiva: KVM2 da Hostinger (decidido como destino; falta contratar e migrar).
- [ ] Gestão de frota: auditoria no chat próprio (inclui apagar o projeto Supabase vazio myfktvjbdczfxgppnbua).

## 2. Ordem de desenvolvimento de 11/11 (executar uma etapa por vez, com relatório)

- [x] Etapa 1 — notificações no Android: diagnóstico e correção no código (11/11). Falta o teste no aparelho (seção 1).
- [ ] Etapa 2 — arquivo administrativo digital: fichários de Motoristas, Entregadores/motoqueiros, Parceiros do Clube
      e Comércios; sem duplicar a pessoa que tem mais de uma função; dados e documentos guardados com segurança após
      deploys. **Análise feita em 11/11 (plano em módulos M0–M6 no arquivo-mestre). Aguardando: teste das
      notificações + autorização do dono + 5 decisões:** (1) diferença entre "Parceiro do Clube" e "Comércio parceiro";
      (2) guardar a foto/PDF original dos documentos (necessário para o PDF da Etapa 3); (3) onde guardar os arquivos até
      a Hostinger (proposta: Supabase Storage, cifrado); (4) gestor pode ver documentos?; (5) guardar CPF/CNPJ?
      Preparação autorizada em 11/11 (só no ramo `etapa2`, sem produção):
      - [x] M0 migrações versionadas + simulação em cópia + relatório de duplicados (11/11, testado com dados fictícios).
      - [x] M1 (parte do banco) pessoas, empresas, vínculos e CPF/CNPJ protegidos (11/11, testado com dados fictícios).
      - [x] M1 (telas) ficha central da pessoa, "adicionar função", aviso de telefone repetido e junção de duplicados
            (só admin) — 11/11, no ambiente de desenvolvimento com dados fictícios (testes automáticos + navegador).
      - [ ] Próximos (aguardando conferência do dono): M2 entregadores/motociclistas · M3 comércios · M4 documentos e
            armazenamento seguro (sem documentos reais). Depois: IA/WhatsApp ligados à pessoa (hoje o cadastro criado
            pela IA ainda não ganha pessoa).
      - [x] Ficha central da EMPRESA (parceiro do Clube; comércio entra no M3) e preservação dos históricos antigos
            (ficha central mostra os históricos originais de cada ficha; testado que migração e junção não alteram
            nenhum) — 11/11, desenvolvimento, dados fictícios.
      - [ ] Política de retenção e descarte por tipo de dado (decisão da empresa; não usar prazo fixo sem avaliar).
      - [ ] **Migração dos dados reais e deploy da Etapa 2: só depois do teste das notificações + autorização.**
- [ ] Etapa 3 — PDF de cada fichário concluído (baixar, imprimir, WhatsApp, e-mail, compartilhar), só por decisão de
      usuário autorizado, com nova versão sem apagar o histórico.
- [ ] Etapa 4 — status reais e independentes para entregadores, parceiros e comércios (verde só para concluído).

## 3. Riscos e avisos em aberto

- [ ] **Horas grátis do Render**: CRM e servidor da plataforma acordados 24 h na mesma conta. Estimativa: as 750 h
      acabam por volta de 20–22/11 e os dois ficam suspensos até 01/12 (dados seguros no cofre). Dono decidiu manter
      assim até a Hostinger. Acompanhar em Billing ("Cobrança") → Free Usage ("Uso gratuito").
- [ ] Notificações no PWA (pelo Chrome): os 3 tipos se diferenciam por vibração/silêncio, não por som próprio; som
      diferente por tipo com o app fechado só no app Android.
- [ ] WhatsApp por "Dispositivos conectados" (não oficial): risco de bloqueio do número; migração futura para a via
      oficial da Meta.
- [ ] Gemini grátis: o Google pode usar as conversas para melhorar os produtos (aviso na tela).

- [ ] **Arquivos dos documentos não são guardados hoje**: do WhatsApp o CRM guarda só o texto lido (com números
      mascarados); a foto/PDF original é descartada, e o link do WhatsApp expira. Resolver na Etapa 2 (módulo M5).
- [ ] **Crescimento do cofre**: cada retrato leva o banco inteiro (hoje 673 KB) e o histórico guarda até ~63 versões
      (hoje 34 versões = 17 MB; banco do Supabase 31 MB de 500 MB grátis). Documentos NUNCA podem entrar no retrato;
      acompanhar o tamanho até a mudança para a Hostinger.
- [ ] Render grátis sem disco persistente (conferido 11/11): os dados só sobrevivem pelo cofre (até ~30 s de perda) e,
      se o Supabase estiver fora do ar, o CRM não liga (proteção contra subir vazio).

## 4. Itens técnicos ainda não validados em uso real

- [ ] Transcrição de áudio e leitura de documentos com mensagens reais do WhatsApp (primeiros casos reais são o teste).
- [ ] Contatos do WhatsApp com identificador LID sem telefone (vínculo manual).
- [ ] Restauração de uma versão antiga do cofre (histórico existe; restauração nunca foi ensaiada).

## 5. Backlog (melhorias conhecidas, sem prazo)

- [ ] WhatsApp: enviar foto/áudio/documento pelo CRM; histórico opcional de contatos.
- [ ] Kanban no celular: arrastar não funciona no toque; falta menu no cartão para mudar a situação.
- [ ] CSP ainda permite estilos inline (`style-src 'unsafe-inline'`).
- [ ] Sem lixeira (exclusão lógica), sem migrações de esquema, sem limpeza da trilha de auditoria.
- [ ] Limite de tentativas em memória (zera ao reiniciar).
- [ ] Edição sem controle de conflito (duas pessoas editando o mesmo cadastro).
- [ ] Detalhe da tarefa mostra o vínculo como `#id`; formulários não enviam com Enter; fechar o formulário não avisa
      sobre alterações não salvas.
- [ ] `/auth/status` e `/api/health` públicos (nome da organização e se precisa de configuração inicial).
- [ ] Leitura local de documentos (sem enviar ao Google) — ideia para o futuro.
