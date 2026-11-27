/// Versao dos Termos/Privacidade. Precisa bater com a que o backend usa
/// (LEGAL_VERSION em apps/backend/src/modules/legal/legal-content.ts).
/// Quem decide se o aceite esta velho e o servidor (`termosDesatualizados`);
/// esta constante so e usada quando a tela nao recebeu a versao dele.
const String kTermsVersion = '1.2.0';

/// Copia local, usada so quando o aparelho esta sem rede (ou em modo
/// demonstracao) e por isso nao consegue buscar o texto oficial no
/// servidor. E um resumo, nao substitui o texto completo do `/legal/terms`.
const String kTermsFallback = '''
# Termos de Uso — Fortaleza Move Motorista (resumo, sem internet)

A Fortaleza Move Motorista é uma plataforma de tecnologia que aproxima passageiros e motoristas parceiros. É proibido usar o serviço para transporte de substâncias ilícitas, armas, objetos roubados ou qualquer atividade criminosa. O passageiro assume total responsabilidade civil e criminal pelo conteúdo de sua bagagem e por seus atos durante a viagem.

Conecte-se à internet para ler o texto completo.
''';

const String kPrivacyFallback = '''
# Política de Privacidade — Fortaleza Move Motorista (resumo, sem internet)

Responsável pelos dados: Evandro da Silva Gonchoroski. Usamos os dados de cadastro, das corridas e a localização por GPS para prestar o serviço e cuidar da segurança. A localização também é usada com o aplicativo fechado enquanto você está Disponível ou em corrida. Não vendemos dados pessoais.

Este é só um resumo. Conecte-se à internet para ler o texto completo, com os seus direitos garantidos pela LGPD: https://api.fortalezadigitalsecurity.com.br/api/legal/privacidade
''';
