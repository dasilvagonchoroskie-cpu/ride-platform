# Roteiro de testes reais — CRM Fortaleza Move 2.1.0-rc.1 (para o dono, pelo celular)

Só vale DEPOIS da publicação autorizada. Use um segundo número de WhatsApp (de um parente, por exemplo) fazendo o papel de
"cliente", e o seu celular com o CRM aberto (aplicativo instalado ou Chrome). Anote em cada linha: **OK**, **FALHOU** (o que
apareceu) e o horário. Se algo falhar, mande o horário: com ele eu acho a linha no registro do servidor.

Antes de começar: no CRM, Configurações ("Settings") → Inteligência (IA): IA ligada, modo automático, "responde sozinha"
ligado. E abra `https://<endereço do CRM>/api/admin/saude` logado como administrador: tem que mostrar `"prova": "ok"` em
documentos e `"quick_check": "ok"` no banco.

## A. Atendimento por texto
| # | Faça (no celular do "cliente") | Tem que acontecer | Resultado |
|---|---|---|---|
| A1 | Mande "oi" | Em até ~10 s: "Recebemos a sua mensagem…" (se a IA demorar); depois a saudação e o menu | |
| A2 | Anote quanto tempo levou da sua mensagem até a resposta de verdade | Normalmente menos de 40 s (depende do Gemini grátis) | |
| A3 | Responda "4" (Clube) e faça uma pergunta | Resposta sobre o Clube, sem documentos de motorista | |
| A4 | Mande duas mensagens seguidas, rápido | Uma confirmação só; nenhuma resposta repetida | |

## B. Áudio
| # | Faça | Tem que acontecer | Resultado |
|---|---|---|---|
| B1 | Mande um áudio falando "quero ser motorista" | Na conversa do CRM aparece 🎤 com o texto; a IA responde sobre o cadastro | |
| B2 | Mande um áudio só com barulho (sem falar) | "Desculpe, não consegui ouvir o seu áudio…" | |
| B3 | Mande outro áudio sem fala logo depois | A conversa vai para a equipe (aviso de transferência + notificação 🚨) | |

## C. Equipe ⇄ IA (repita 3 vezes seguidas, sem reiniciar nada)
| # | Faça | Tem que acontecer | Resultado |
|---|---|---|---|
| C1 | No CRM, botão Assumir ("Assumir atendimento") | A IA para; o cliente escreve e a IA NÃO responde | |
| C2 | Responda o cliente pelo seu celular | A conversa continua com a equipe | |
| C3 | No CRM, botão Devolver ("Devolver à IA") | Se a última mensagem era do cliente, a IA responde; depois segue normal | |
| C4 | Repita C1–C3 mais duas vezes | Funciona igual nas três vezes | |

## D. Encerramento e novo atendimento
| # | Faça | Tem que acontecer | Resultado |
|---|---|---|---|
| D1 | No CRM, Concluir ("Concluir atendimento") | A conversa fica concluída | |
| D2 | 1 minuto depois, o cliente manda "oi, outra coisa" | A IA responde (novo atendimento, com o menu); o histórico antigo continua na conversa | |

## E. Botão do site
| # | Faça (do celular do "cliente", no site) | Tem que acontecer | Resultado |
|---|---|---|---|
| E1 | Botão "Vim pelo site" | Menu geral; NADA de lista de documentos de motorista | |
| E2 | No CRM, abra o histórico do atendimento da conversa | "Origem do contato: Site" | |
| E3 | Botão "Quero ser motorista" (outro número) | Começa o cadastro de motorista | |

## F. Documentos pelo WhatsApp (os 7 itens)
| # | Faça | Tem que acontecer | Resultado |
|---|---|---|---|
| F1 | Escolha "1" e mande uma FOTO da CNH (pode ser de teste) | "Recebemos o seu documento…" e pede os próximos itens | |
| F2 | No CRM, abra a ficha do motorista | CNH = "Recebido — conferir"; "faltam 6 de 7"; no painel Documentos a CNH aparece com o arquivo e abre | |
| F3 | Mande a mesma foto de novo | Não cria versão repetida | |
| F4 | Mande foto do carro de frente, de lado e de trás (uma por vez) | Três itens separados na ficha | |
| F5 | Mande uma foto qualquer de carro sem mostrar o lado | Aparece em Documentos → "Arquivos recebidos pelo WhatsApp" para classificar | |
| F6 | Classifique esse arquivo pela tela | Ele entra na ficha no item escolhido | |
| F7 | Complete os 7 itens | A conversa vai para a equipe ("aguardando análise"); NADA é aprovado sozinho | |

## G. Falha do Gemini (só se acontecer naturalmente; não force)
| # | Observe | Tem que acontecer | Resultado |
|---|---|---|---|
| G1 | Se o Gemini ficar fora do ar | A IA tenta de novo e, sem conseguir, passa para a equipe com o aviso; nada de resposta repetida | |

## H. Celular e aplicativo
| # | Faça | Tem que acontecer | Resultado |
|---|---|---|---|
| H1 | Feche e abra o aplicativo do CRM | Abre a versão nova: aparece o menu Candidatos e, em Documentos, a parte "Arquivos recebidos pelo WhatsApp" (a página `/api/admin/saude` mostra `"cache": "fm-crm-v28"`) | |
| H2 | Entre como gestor (outro usuário) | Não vê Configurações nem exporta CSV; vê Documentos se a política deixar | |
| H3 | Relatórios → Exportar PDF → Compartilhar e Imprimir | O PDF abre, compartilha e imprime | |
| H4 | Receba uma notificação com o app fechado | Chega no celular | |
