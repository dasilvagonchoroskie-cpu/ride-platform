# Pendências — CRM Fortaleza Move

Atualizado em 11/11/2026 (12h15, horário de Brasília). Lista única do que falta. Ao concluir um item, marcar com [x]
e a data; ao surgir um novo, acrescentar na seção certa. Detalhes técnicos de cada item estão no arquivo-mestre
(`PROJETO-crm-fortaleza-move.md`) e no `CLAUDE.md`.

## 1. Depende do dono (testes e ações que só ele pode fazer)

- [ ] **Testar o app 2.0.106 no celular**: instalar por cima do 2.0.105 e confirmar que abre sem o erro
      "ManageDataLauncherActivity".
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
      deploys. **Começa depois do teste das notificações.**
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
