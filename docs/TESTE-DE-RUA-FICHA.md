# Ficha do teste de rua (A a V)

Como usar: imprima ou copie esta ficha, faça cada roteiro de `docs/TESTE-DE-RUA.md` e marque
**OK**, **FALHOU** ou **NÃO FEITO**. Teste feito só no emulador não vale. O que o computador
já provou está na última coluna: serve para você saber onde procurar se algo falhar, **não**
substitui o teste no aparelho.

## Pré-condições gerais
- 2 celulares Android com 4G, APKs da montagem mais nova (a que sair depois do merge), conta de
  passageiro, conta de motorista aprovado (carro em uso, saldo), Central aberta, cidade Goiatuba.
- Anotar o horário de cada passo (com ele acho tudo nos registros do servidor).
- Roteiros T e U: só com sua autorização expressa e a Entrega ligada numa cidade de teste.

## Critérios de aprovação

| Roteiro | O que testa | Aprovado quando | Falhou quando | O que o computador já provou |
|---|---|---|---|---|
| 1 | Chamado com tela apagada / app fechado | Celular acende e toca em até 15 s nos dois casos | Passou de 15 s ou não tocou (anotar marca e bateria) | Lógica de oferta e push no servidor |
| 2 | Aviso push | Aviso chega em até 20 s: chamada ao motorista, "a caminho", "cheguei" | Algum aviso não chegou | Envio pelo servidor (Firebase real não testado) |
| 3 | GPS, taxímetro, posição | Carro anda sem pular de rua; km do taxímetro dentro de 5% do odômetro; valor cobrado = estimado (preço fechado) | Diferença acima de 5% ou valor diferente | Contas do taxímetro e do preço com dados simulados |
| 4 | Mapa em Goiatuba | Ruas em até 5 s na abertura; sem branco por mais de 2 s; 4 de 5 buscas com a primeira opção certa | Acima disso | Cache e configuração do mapa |
| A | Atualizar sem deslogar | Abre logado, sem código, após atualizar por cima e após fechar/abrir | Pediu login | Migração para o cofre (testes dos 4 apps) |
| B | Aparelhos e desconectar | Dois aparelhos listados com modelo; o desconectado cai em até 1 min; o outro segue | Os dois caem ou nenhum cai | 10 testes de sessões no servidor |
| C | GPS | Ponto azul na rua certa em até 10 s; volta sozinho após GPS desligado | Não volta sozinho | Nada em aparelho |
| D | Notificações do passageiro | Em app aberto, segundo plano e fechado: os 2 avisos chegam em até 20 s | Qualquer um não chegou | Caixa de entrada e envio simulados |
| E | Chamada do motorista | Igual ao 1 | Igual ao 1 | Igual ao 1 |
| F | Categoria | Carro Conforto não recebe chamado Popular; volta a receber ao trocar | Recebeu fora da categoria | Despacho por categoria (16 testes) |
| G | Taxímetro e navegação | Google Maps/Waze abrem a rota certa; km e valor como no 3 | Abre rota errada | Taxímetro (testes do app) |
| H | Carteira | Taxa da Central sobre o valor **final**; saldo baixou exatamente a taxa | Taxa sobre o estimado ou valor diferente | Regras de carteira |
| I | Busca em Goiatuba | 5 endereços + 3 lugares: primeira opção certa em pelo menos 6 de 8 | Menos de 6 | Nada com dados reais |
| J | Visual | Sem texto cortado, bandeira certa, botão Google Maps em uma linha | Algo cortado ou estranho (mandar print) | Telas pequenas e letra grande |
| K | Autorizações em outras marcas | Cada "Abrir ajuste" abre a tela certa | Abre a errada | Só o Redmi 12 foi provado |
| L | Trocar senha derruba o outro celular | O outro volta à entrada na próxima ação; aviso por e-mail | Continua logado | Teste real de servidor (execução 86) |
| M | "Esqueci minha senha" | Só o celular que recuperou segue logado | Os dois seguem | Idem |
| N | Trocar e-mail/telefone | Código no e-mail novo; telefone recusa nas 48 h; sem e-mail pede cadastro | Código na tela ou troca sem prova | Idem |
| O | Recuperar acesso | Conferência desmarcada recusa; completa libera e derruba o celular antigo | Libera sem conferência | Idem |
| P | Duas etapas | Pede o código do Authenticator após recuperar a senha | Entra sem o código | Teste em banco de teste |
| Q | Login da Central no cofre | Atualiza por cima sem deslogar; segue logada após 20 min; aviso com app fechado chega; sair funciona | Voltou à entrada sem sair, ou aviso não chegou | Cofre e renovação (testes da Central); **compilação nativa só na próxima montagem** |
| R | Renovação do login (Motorista/Passageiro) | Logado após 20 min parado, com o app aberto e fechado | Voltou à entrada | Renovação (testes novos, 13/11) |
| S | Mapa operacional e Motos | Itens 1 a 5 do roteiro | Algum item falhou | 22 testes do mapa; aviso de falta de conexão no código |
| T | Entrega manual do motorista | Uma só entrega, com origem "motorista" na Central | Duas entregas ou sem origem | 26 testes no servidor, 14 no app |
| U | Comércio de ponta a ponta | Todas as etapas aparecem para a loja e a Central; valor cobrado = confirmado | Etapa que não aparece ou valor diferente | Comércio (mais de 70 testes) com despacho simulado |
| V | Conexão e processo | App volta sozinho do modo avião e de "Forçar parada"; sem aviso duplicado; motorista parado segue elegível | Saiu da corrida, duplicou aviso ou ficou inelegível | Serviço nativo reenvia a cada 45 s |

## Registro de falhas (uma linha por falha)

| Data/hora | Roteiro e passo | Aparelho (marca/modelo/Android) | App e versão | O que aconteceu | Segundos até acontecer | Print ou vídeo | Economia de bateria ligada? |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## Depois do teste
Mande: esta ficha preenchida, os horários, os km (taxímetro × odômetro), os números do Uso do mapa
antes e depois (Central → Configurações → Mapa) e os prints. Cada falha vira um item técnico meu;
nenhuma falha de aparelho é marcada como resolvida sem novo teste no aparelho.
