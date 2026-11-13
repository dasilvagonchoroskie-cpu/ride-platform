import 'package:comercio_app/app.dart';
import 'package:comercio_app/core/api.dart';
import 'package:comercio_app/core/armazenamento.dart';
import 'package:comercio_app/dados/modelos.dart';
import 'package:comercio_app/estado/sessao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'falsos.dart';

Sessao sessaoCom(ServidorFalso servidor, {bool logado = true, Estabelecimento? loja, bool aceitouTermos = true}) {
  servidor.loja ??= loja; // o servidor falso responde com a mesma loja da sessao
  final s = Sessao(api: ApiClient(), servidor: servidor);
  s.iniciando = false;
  s.termosAceitosVersao = aceitouTermos ? 'teste' : null;
  s.logado = logado;
  s.estabelecimento = loja;
  s.email = 'loja@exemplo.com';
  return s;
}

Future<void> abrir(WidgetTester tester, Sessao s) async {
  tester.view.physicalSize = const Size(900, 2600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ComercioApp(sessao: s));
  await tester.pumpAndSettle();
}

Future<void> fechar(WidgetTester tester) async {
  // Desmonta a tela (cancela os relogios de atualizacao) antes de o teste acabar.
  await tester.pumpWidget(const SizedBox());
}

Future<void> tocar(WidgetTester tester, String texto) async {
  final alvo = find.text(texto).first;
  await tester.ensureVisible(alvo);
  await tester.tap(alvo);
  await tester.pumpAndSettle();
}

/// Preenche UMA entrega (o cartao [k], de 0 a 4) na tela de entregas: 11 campos por cartao.
Future<void> preencherEntrega(WidgetTester tester, int k, {required String o, required String quem, String? fone, required String rua}) async {
  final campos = find.byType(TextFormField);
  final base = 11 * k;
  await tester.enterText(campos.at(base + 0), o);
  await tester.enterText(campos.at(base + 1), quem);
  if (fone != null) await tester.enterText(campos.at(base + 2), fone);
  await tester.enterText(campos.at(base + 3), rua);
  await tester.enterText(campos.at(base + 4), '10');
  await tester.enterText(campos.at(base + 6), 'Centro');
  await tester.enterText(campos.at(base + 7), 'Goiatuba');
  await tester.enterText(campos.at(base + 8), 'GO');
  await tester.enterText(campos.at(base + 9), '75600000');
  final buscar = find.text('Buscar no mapa').at(k);
  await tester.ensureVisible(buscar);
  await tester.tap(buscar);
  await tester.pumpAndSettle();
  final lugar = find.text('Rua A, 10').last;
  await tester.ensureVisible(lugar);
  await tester.tap(lugar);
  await tester.pumpAndSettle();
}

/// Coleta (passo 1) + uma entrega (passo 2), ate a tela do preco.
Future<void> preencherAtePreco(WidgetTester tester) async {
  await tester.tap(find.text('Nova entrega'));
  await tester.pumpAndSettle();
  // 1. Coleta (endereco do estabelecimento)
  expect(find.text('Coletar no endereço do estabelecimento'), findsOneWidget);
  await tocar(tester, 'Continuar');
  // 2. Entregas
  await preencherEntrega(tester, 0, o: '1 pizza grande', quem: 'Maria Silva', fone: '64999990000', rua: 'Rua A');
  await tocar(tester, 'Consultar preço');
}

void main() {
  setUp(() {
    Armazenamento.atual = ArmazenamentoEmMemoria();
  });

  group('Porteiro (qual tela abre)', () {
    testWidgets('sem login: tela de entrada', (tester) async {
      await abrir(tester, sessaoCom(ServidorFalso(), logado: false));
      expect(find.text('Receber código por e-mail'), findsOneWidget);
      expect(find.text('Comércio'), findsOneWidget);
      await fechar(tester);
    });

    testWidgets('logado sem estabelecimento: cadastro', (tester) async {
      await abrir(tester, sessaoCom(ServidorFalso()));
      expect(find.text('Cadastrar estabelecimento'), findsOneWidget);
      await fechar(tester);
    });

    testWidgets('aguardando aprovação: não pode pedir entrega', (tester) async {
      await abrir(tester, sessaoCom(ServidorFalso(), loja: estabelecimento(situacao: Situacao.aguardando)));
      expect(find.text('Cadastro em análise'), findsOneWidget);
      expect(find.text('Nova entrega'), findsNothing);
      await fechar(tester);
    });

    testWidgets('suspenso: mostra o motivo da Central e não deixa pedir', (tester) async {
      await abrir(tester, sessaoCom(ServidorFalso(), loja: estabelecimento(situacao: Situacao.suspenso, motivo: 'Documento vencido')));
      expect(find.text('Estabelecimento suspenso'), findsOneWidget);
      expect(find.textContaining('Documento vencido'), findsOneWidget);
      expect(find.text('Nova entrega'), findsNothing);
      await fechar(tester);
    });

    testWidgets('rejeitado: não deixa pedir', (tester) async {
      await abrir(tester, sessaoCom(ServidorFalso(), loja: estabelecimento(situacao: Situacao.rejeitado, motivo: 'CNPJ não confere')));
      expect(find.text('Cadastro não aprovado'), findsOneWidget);
      expect(find.text('Nova entrega'), findsNothing);
      await fechar(tester);
    });

    testWidgets('aprovado: início com "Nova entrega" e as quatro abas', (tester) async {
      await abrir(tester, sessaoCom(ServidorFalso(), loja: estabelecimento()));
      expect(find.text('Nova entrega'), findsOneWidget);
      for (final aba in ['Entregas', 'Histórico', 'Gastos', 'Conta']) {
        expect(find.text(aba), findsWidgets, reason: aba);
      }
      expect(find.text('Nenhuma entrega em andamento'), findsOneWidget);
      await fechar(tester);
    });

    testWidgets('aprovado, mas a Central ainda não liberou as entregas: avisa e não abre o pedido', (tester) async {
      await abrir(tester, sessaoCom(ServidorFalso(), loja: estabelecimento(liberadas: false)));
      await tocar(tester, 'Nova entrega');
      expect(find.text('Entregas ainda não liberadas'), findsOneWidget);
      expect(find.text('Consultar preço'), findsNothing);
      await tocar(tester, 'Entendi');
      expect(find.text('Entregas ainda não liberadas'), findsNothing);
      await fechar(tester);
    });

    testWidgets('a Central liberou depois que o app abriu: ao tocar, confere no servidor e abre o pedido', (tester) async {
      final servidor = ServidorFalso()..loja = estabelecimento(liberadas: true);
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento(liberadas: false)));
      await tocar(tester, 'Nova entrega');
      expect(find.text('Entregas ainda não liberadas'), findsNothing);
      expect(find.textContaining('Nova entrega · 1/4'), findsOneWidget);
      await fechar(tester);
    });

    testWidgets('a Central suspendeu a loja depois que o app abriu: ao tocar, mostra a situação e não abre o pedido', (tester) async {
      final servidor = ServidorFalso()..loja = estabelecimento(situacao: Situacao.suspenso, motivo: 'Uso indevido do serviço');
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      await tocar(tester, 'Nova entrega');
      expect(find.text('Estabelecimento suspenso'), findsOneWidget);
      expect(find.textContaining('Nova entrega · 1/4'), findsNothing);
      await fechar(tester);
    });

    testWidgets('o login venceu com uma tela aberta por cima: volta para a entrada e apaga o login guardado', (tester) async {
      await Armazenamento.atual.gravar(Armazenamento.acesso, 'acesso-velho');
      await Armazenamento.atual.gravar(Armazenamento.renovacao, 'r' * 30);
      final s = sessaoCom(ServidorFalso(), loja: estabelecimento());
      await abrir(tester, s);
      await tester.tap(find.text('Nova entrega'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Nova entrega · 1/4'), findsOneWidget);
      s.api.aoSessaoExpirar!();
      await tester.pumpAndSettle();
      expect(find.textContaining('Nova entrega · 1/4'), findsNothing);
      expect(find.text('Ler os termos de uso'), findsOneWidget);
      expect(await Armazenamento.atual.ler(Armazenamento.acesso), isNull);
      expect(await Armazenamento.atual.ler(Armazenamento.renovacao), isNull);
      await fechar(tester);
    });

    testWidgets('a aba Conta mostra o estabelecimento e não mostra carteira nem crédito', (tester) async {
      await abrir(tester, sessaoCom(ServidorFalso(), loja: estabelecimento()));
      await tester.tap(find.text('Conta'));
      await tester.pumpAndSettle();
      expect(find.text('Pizzaria Boa'), findsOneWidget);
      expect(find.text('11.222.333/0001-81'), findsOneWidget);
      expect(find.textContaining('arteira'), findsNothing);
      expect(find.textContaining('rédito'), findsNothing);
      await fechar(tester);
    });
  });

  group('Cadastro do estabelecimento', () {
    testWidgets('dados inválidos são barrados no app e nada é enviado', (tester) async {
      final servidor = ServidorFalso();
      await abrir(tester, sessaoCom(servidor));
      await tester.enterText(find.byType(TextFormField).at(0), 'Pizzaria Boa');
      await tester.enterText(find.byType(TextFormField).at(2), '11222333000182'); // CNPJ errado
      await tocar(tester, 'Enviar cadastro');
      expect(find.text('CNPJ inválido.'), findsOneWidget);
      expect(servidor.cadastros, 0);
      await fechar(tester);
    });
  });

  group('Nova entrega', () {
    testWidgets('percorre os passos, mostra o preço do servidor e só pede ao confirmar', (tester) async {
      final servidor = ServidorFalso();
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      await preencherAtePreco(tester);

      expect(find.text('Veículo e preço'), findsWidgets);
      expect(find.text('R\$ 7,00'), findsOneWidget);
      expect(servidor.consultasDePreco, 1);
      expect(servidor.chavesRecebidas, isEmpty); // consultar preço não pede nada

      await tocar(tester, 'Continuar');
      expect(find.text('Confirmar entrega'), findsOneWidget);
      expect(find.text('1 pizza grande'), findsOneWidget);
      expect(servidor.chavesRecebidas, isEmpty); // ainda não confirmou

      await tocar(tester, 'Confirmar entrega');
      expect(servidor.chavesRecebidas.length, 1);
      expect(find.text('Entrega FM100'), findsOneWidget); // abriu o acompanhamento
      await fechar(tester);
    });

    testWidgets('entrega indisponível na cidade: avisa e não deixa continuar', (tester) async {
      final servidor = ServidorFalso();
      servidor.cotacao = Cotacao(enderecoColeta: 'a', coletaAlternativa: false, enderecoEntrega: 'b', opcoes: const []);
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      await preencherAtePreco(tester);
      expect(find.text('Entrega indisponível agora'), findsOneWidget);
      expect(find.text('Confirmar entrega'), findsNothing);
      await tocar(tester, 'Continuar'); // desativado
      expect(find.text('Confirmar entrega'), findsNothing);
      expect(servidor.chavesRecebidas, isEmpty);
      await fechar(tester);
    });

    testWidgets('servidor recusa o preço (entrega desligada): mostra o motivo e fica no passo', (tester) async {
      final servidor = ServidorFalso()..erroNoPreco = ApiException('FORBIDDEN', 'Entrega ainda não está disponível nesta cidade.', statusCode: 403);
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      await preencherAtePreco(tester);
      expect(find.text('Entrega ainda não está disponível nesta cidade.'), findsOneWidget);
      expect(find.text('Consultar preço'), findsOneWidget);
      expect(servidor.chavesRecebidas, isEmpty);
      await fechar(tester);
    });

    testWidgets('queda de rede ao confirmar: não finge sucesso e repete com a MESMA chave', (tester) async {
      final servidor = ServidorFalso()..respostasDoPedido.add(ApiException('NETWORK_ERROR', 'Sem conexão com o servidor.'));
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      await preencherAtePreco(tester);
      await tocar(tester, 'Continuar');
      await tocar(tester, 'Confirmar entrega');

      expect(find.textContaining('Sem resposta do servidor'), findsOneWidget);
      expect(find.text('Tentar de novo'), findsOneWidget);
      expect(find.text('Entrega FM100'), findsNothing); // não abriu entrega nenhuma
      expect(find.text('Voltar'), findsNothing); // não deixa mudar o pedido no meio da dúvida

      await tocar(tester, 'Tentar de novo');
      expect(servidor.chavesRecebidas.length, 2);
      expect(servidor.chavesRecebidas[0], servidor.chavesRecebidas[1]);
      expect(find.text('Entrega FM100'), findsOneWidget);
      await fechar(tester);
    });

    testWidgets('confirma mandando o preço que a pessoa viu', (tester) async {
      final servidor = ServidorFalso();
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      await preencherAtePreco(tester);
      await tocar(tester, 'Continuar');
      await tocar(tester, 'Confirmar entrega');
      expect(servidor.valoresEsperados, [700]);
      await fechar(tester);
    });

    testWidgets('preço mudou no servidor: não abre entrega, volta ao preço e usa outra chave', (tester) async {
      final servidor = ServidorFalso()
        ..respostasDoPedido.add(ApiException('CONFLICT', 'O preço mudou: era R\$ 7,00 e agora é R\$ 8,00. Consulte o preço de novo.', statusCode: 409));
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      await preencherAtePreco(tester);
      await tocar(tester, 'Continuar');
      await tocar(tester, 'Confirmar entrega');

      expect(find.textContaining('O preço mudou'), findsOneWidget);
      expect(find.text('Entrega FM100'), findsNothing);
      expect(find.text('Consultar preço'), findsOneWidget); // voltou para consultar de novo
      expect(find.text('Tentar de novo'), findsNothing); // não é queda de rede

      servidor.cotacao = Cotacao(
        enderecoColeta: 'Rua B, 20, Centro, Goiatuba/GO',
        coletaAlternativa: false,
        enderecoEntrega: 'Rua A, 10, Centro, Goiatuba/GO',
        opcoes: const [OpcaoPreco(veiculo: 'MOTO', nome: 'Moto', valorCents: 800)],
        assinatura: 'assinada',
      );
      await tocar(tester, 'Consultar preço');
      expect(find.text('R\$ 8,00'), findsOneWidget);
      await tocar(tester, 'Continuar');
      await tocar(tester, 'Confirmar entrega');
      expect(servidor.valoresEsperados, [700, 800]);
      expect(servidor.chavesRecebidas[0], isNot(servidor.chavesRecebidas[1])); // pedido novo, chave nova
      expect(find.text('Entrega FM100'), findsOneWidget);
      await fechar(tester);
    });

    testWidgets('recusa do servidor ao confirmar (ex.: suspenso): mostra o motivo e não abre entrega', (tester) async {
      final servidor = ServidorFalso()..respostasDoPedido.add(ApiException('FORBIDDEN', 'Seu estabelecimento está suspenso. Fale com a Central.', statusCode: 403));
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      await preencherAtePreco(tester);
      await tocar(tester, 'Continuar');
      await tocar(tester, 'Confirmar entrega');
      expect(find.text('Seu estabelecimento está suspenso. Fale com a Central.'), findsOneWidget);
      expect(find.text('Entrega FM100'), findsNothing);
      await fechar(tester);
    });

    testWidgets('telefone de quem recebe é opcional: sem telefone o pedido segue', (tester) async {
      final servidor = ServidorFalso();
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      await tester.tap(find.text('Nova entrega'));
      await tester.pumpAndSettle();
      await tocar(tester, 'Continuar');
      await preencherEntrega(tester, 0, o: '1 pizza grande', quem: 'Maria Silva', rua: 'Rua A');
      await tocar(tester, 'Consultar preço');
      expect(find.text('Telefone inválido (com DDD).'), findsNothing);
      expect(servidor.consultasDePreco, 1);
      await fechar(tester);
    });

    testWidgets('várias entregas: cada uma com nome e telefone próprios; a última vai nos campos principais e as outras como paradas', (tester) async {
      final servidor = ServidorFalso();
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      await tester.tap(find.text('Nova entrega'));
      await tester.pumpAndSettle();
      await tocar(tester, 'Continuar');
      await preencherEntrega(tester, 0, o: '1 pizza grande', quem: 'Maria Silva', fone: '64999990000', rua: 'Rua A');
      await tocar(tester, 'Adicionar outra entrega (1/5)');
      expect(find.text('Entrega 1 de 2'), findsOneWidget);
      expect(find.text('Entrega 2 de 2'), findsOneWidget);
      await preencherEntrega(tester, 1, o: '2 refrigerantes', quem: 'João Souza', rua: 'Rua A');
      await tocar(tester, 'Consultar preço');
      expect(servidor.ultimosDados, isNotNull);
      final d = servidor.ultimosDados!;
      expect(d.destinatarioNome, 'João Souza'); // a ultima
      expect(d.paradas.length, 1);
      expect(d.paradas.first.destinatarioNome, 'Maria Silva');
      expect(d.paradas.first.destinatarioTelefone, '64999990000');
      final json = d.toJson();
      expect((json['paradas'] as List).length, 1);
      await fechar(tester);
    });

    testWidgets('limite de 5 entregas por pedido', (tester) async {
      await abrir(tester, sessaoCom(ServidorFalso(), loja: estabelecimento()));
      await tester.tap(find.text('Nova entrega'));
      await tester.pumpAndSettle();
      await tocar(tester, 'Continuar');
      for (var i = 1; i < 5; i++) {
        await tocar(tester, 'Adicionar outra entrega ($i/5)');
      }
      expect(find.text('Entrega 5 de 5'), findsOneWidget);
      expect(find.textContaining('Adicionar outra entrega'), findsNothing);
      expect(find.text('Máximo de 5 entregas por pedido.'), findsOneWidget);
      await fechar(tester);
    });
  });

  group('Termos e privacidade na abertura', () {
    testWidgets('sem aceite não chega à entrada; com o aceite segue para entrar', (tester) async {
      final servidor = ServidorFalso();
      final s = sessaoCom(servidor, logado: false, aceitouTermos: false);
      await abrir(tester, s);
      expect(find.text('Aceitar e continuar'), findsOneWidget);
      expect(find.text('Receber código por e-mail'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('aceite-inicial')));
      await tester.pumpAndSettle();
      await tocar(tester, 'Aceitar e continuar');
      expect(find.text('Receber código por e-mail'), findsOneWidget);
      expect(s.aceitouTermos, isTrue);
      expect(await Armazenamento.atual.ler(Armazenamento.termosAceitos), isNotNull);
      await fechar(tester);
    });
  });
}
