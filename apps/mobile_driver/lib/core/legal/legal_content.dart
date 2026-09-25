/// Versao dos Termos/Privacidade. Precisa bater com a que o backend usa
/// (LEGAL_VERSION em apps/backend/src/modules/legal/legal-content.ts) —
/// se o texto mudar la, muda aqui tambem, para o app saber pedir o
/// aceite de novo em vez de achar que uma versao velha ainda vale.
const String kTermsVersion = '1.0.0';

/// Copia local, usada so quando o aparelho esta sem rede (ou em modo
/// demonstracao) e por isso nao consegue buscar o texto oficial no
/// servidor. E um resumo, nao substitui o texto completo do `/legal/terms`.
const String kTermsFallback = '''
# Termos de Uso — Fortaleza Mov (resumo, sem conexao)

A Fortaleza Mov e uma plataforma de tecnologia que aproxima passageiros
e motoristas parceiros. E proibido usar o servico para transporte de
substancias ilicitas, armas, objetos roubados ou qualquer atividade
criminosa. O passageiro assume total responsabilidade civil e criminal
pelo conteudo de sua bagagem e por seus atos durante a viagem.

Conecte-se a internet para ler o texto completo.
''';

const String kPrivacyFallback = '''
# Politica de Privacidade — Fortaleza Mov (resumo, sem conexao)

Coletamos localizacao por GPS para encontrar motoristas e tracar
rotas, e dados de cadastro para identificacao. Nao vendemos dados a
terceiros. Conecte-se a internet para ler o texto completo, com os
seus direitos garantidos pela LGPD.
''';
