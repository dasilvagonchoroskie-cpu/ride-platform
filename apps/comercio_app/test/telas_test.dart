import 'package:comercio_app/app.dart';
import 'package:comercio_app/core/api.dart';
import 'package:comercio_app/core/armazenamento.dart';
import 'package:comercio_app/dados/modelos.dart';
import 'package:comercio_app/estado/sessao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'falsos.dart';

Sessao sessaoCom(ServidorFalso servidor, {bool logado = true, Estabelecimento? loja}) {
  final s = Sessao(api: ApiClient(), servidor: servidor);
  s.iniciando = false;
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

/// Preenche os 3 primeiros passos e o endereco, ate a tela do preco.
Future<void> preencherAtePreco(WidgetTester tester) async {
  await tester.tap(find.text('Nova entrega'));
  await tester.pumpAndSettle();
  // 1. Encomenda
  await tester.enterText(find.byType(TextFormField).at(0), '1 pizza grande');
  await tocar(tester, 'Continuar');
  // 2. Coleta (endereco do estabelecimento)
  expect(find.text('No endereço do estabelecimento'), findsOneWidget);
  await tocar(tester, 'Continuar');
  // 3. Quem recebe
  await tester.enterText(find.byType(TextFormField).at(0), 'Maria Silva');
  await tester.enterText(find.byType(TextFormField).at(1), '64999990000');
  await tocar(tester, 'Continuar');
  // 4. Endereco de entrega
  final campos = find.byType(TextFormField);
  await tester.enterText(campos.at(0), 'Rua A');
  await tester.enterText(campos.at(1), '10');
  await tester.enterText(campos.at(3), 'Centro');
  await tester.enterText(campos.at(4), 'Goiatuba');
  await tester.enterText(campos.at(5), 'GO');
  await tester.enterText(campos.at(6), '75600000');
  await tocar(tester, 'Buscar no mapa');
  await tocar(tester, 'Rua A, 10');
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
  });
}
