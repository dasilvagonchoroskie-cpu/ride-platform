// "Lançar entrega manualmente" no app do motorista (Evandro, 12/11/2026).
//
// Servidor de mentira: nenhum estabelecimento, motorista ou entrega real.
// Confere o fluxo (busca, perfil, confirmacao, preco oficial, lancamento), as
// recusas do servidor, a chave que nao duplica e o preco que mudou.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/data/models/entrega_manual.dart';
import 'package:mobile_driver/screens/entrega_manual_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _lojaId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const _outraId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/// Cenario do servidor de mentira.
bool _liberado = true;
String _situacaoLoja = 'APROVADO';
bool _semResultado = false;
bool _doisResultados = false;
int _valorCents = 1200;

/// Quantas tentativas de lancar caem (rede) antes de funcionar. O cliente ja repete
/// uma vez sozinho depois de 2 s; por isso 2 = o toque inteiro falha.
int _falhasDeRede = 0;

/// O lancamento diz que o preco mudou (uma vez) e a cotacao seguinte vem com outro valor.
bool _precoMudaNoLancamento = false;

/// O servidor recusa o lancamento (uma porta fechada).
String? _recusa;

final List<String> _chamadas = [];
final List<Map<String, dynamic>> _lancamentos = [];
final List<Map<String, dynamic>> _cotacoes = [];

Map<String, dynamic> _achado(String id, String nome, {String situacao = 'APROVADO'}) => {
      'id': id,
      'nomeFantasia': nome,
      'endereco': 'Rua Javari, 100, Centro',
      'cidade': 'Goiatuba',
      'telefoneFinal': '1234',
      'situacao': situacao,
      'situacaoRotulo': situacao == 'APROVADO' ? 'Aprovado' : 'Aguardando aprovação',
      'podeLancar': situacao == 'APROVADO',
      'motivo': situacao == 'APROVADO' ? null : 'Este estabelecimento ainda não foi aprovado pela Central.',
    };

http.Response _json(Object dados, [int status = 200]) => http.Response(
      jsonEncode({'success': status < 400, 'data': dados}),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

http.Response _erro(String codigo, String mensagem, int status) => http.Response(
      jsonEncode({'success': false, 'error': {'code': codigo, 'message': mensagem}}),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

MockClient _servidor() => MockClient((http.Request r) async {
      final p = r.url.path;
      _chamadas.add('${r.method} $p');
      if (p == '/api/driver/manual-deliveries/buscar') {
        if (_semResultado) return _json({'itens': <dynamic>[], 'liberado': _liberado});
        return _json({
          'itens': [
            _achado(_lojaId, 'Pizzaria Boa Massa', situacao: _situacaoLoja),
            if (_doisResultados) _achado(_outraId, 'Pizzaria Boa Vista'),
          ],
          'liberado': _liberado,
        });
      }
      if (p == '/api/driver/manual-deliveries/estabelecimentos/$_lojaId' || p == '/api/driver/manual-deliveries/estabelecimentos/$_outraId') {
        final aprovada = _situacaoLoja == 'APROVADO';
        return _json({
          'id': _lojaId,
          'nomeFantasia': 'Pizzaria Boa Massa',
          'razaoSocial': 'Boa Massa Alimentos Ltda',
          'cnpj': '**.***.***/0001-91',
          'telefone': '+5564999991234',
          'enderecoDeRetirada': 'Rua Javari, 100 - Centro, Goiatuba - GO, 75600-000',
          'cidade': 'Goiatuba',
          'uf': 'GO',
          'situacao': _situacaoLoja,
          'situacaoRotulo': aprovada ? 'Aprovado' : 'Aguardando aprovação',
          'podeLancar': aprovada,
          'motivo': aprovada ? null : 'Este estabelecimento ainda não foi aprovado pela Central.',
          'entregasConcluidas': 17,
          'historico': [
            {'codigo': 'AB12CD', 'em': '2026-11-10T12:00:00.000Z', 'situacao': 'Concluída', 'final': true, 'origem': 'APP', 'bairro': 'Setor Sul'},
            {'codigo': 'EF34GH', 'em': '2026-11-11T12:00:00.000Z', 'situacao': 'Concluída', 'final': true, 'origem': 'MOTORISTA', 'bairro': 'Centro'},
          ],
        });
      }
      if (p == '/api/geo/search') {
        return _json([
          {'address': 'Rua das Flores, 45', 'detail': 'Setor Sul, Goiatuba', 'latitude': -18.0201, 'longitude': -49.3601},
        ]);
      }
      if (p == '/api/driver/manual-deliveries/cotar') {
        _cotacoes.add(jsonDecode(r.body) as Map<String, dynamic>);
        return _json({
          'coleta': {'endereco': 'Rua Javari, 100 - Centro', 'alternativa': false},
          'entrega': {'endereco': 'Rua das Flores, 45'},
          'distanciaMetros': 2300,
          'duracaoSegundos': 600,
          'opcoes': [
            {'veiculo': 'MOTO', 'nome': 'Moto', 'valorCents': _valorCents},
          ],
          'cotacao': 'medida-assinada',
          'veiculo': 'MOTO',
        });
      }
      if (p == '/api/driver/manual-deliveries' && r.method == 'POST') {
        final corpo = jsonDecode(r.body) as Map<String, dynamic>;
        _lancamentos.add(corpo);
        if (_recusa != null) return _erro('FORBIDDEN', _recusa!, 403);
        if (_falhasDeRede > 0) {
          _falhasDeRede--;
          return http.Response('fora do ar', 503);
        }
        if (_precoMudaNoLancamento) {
          _precoMudaNoLancamento = false;
          _valorCents = 1500;
          return _erro('CONFLICT', 'O preço mudou: era R\$ 12,00 e agora é R\$ 15,00. Consulte o preço de novo.', 409);
        }
        return _json({'rideId': 'r1', 'codigo': 'EN0001', 'repetido': false});
      }
      return _erro('NOT_FOUND', 'Rota de teste sem resposta: $p', 404);
    });

Future<void> _esperar(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump(const Duration(milliseconds: 100));
  }
}

/// Abre a tela dentro de uma rota (como no app), para provar que fecha ao lancar.
Future<void> _abrir(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ChangeNotifierProvider<DriverState>.value(
      value: DriverState(client: ApiClient(client: _servidor())),
      child: MaterialApp(
        locale: const Locale('pt', 'BR'),
        supportedLocales: const [Locale('pt', 'BR')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const EntregaManualScreen())),
                child: const Text('abrir-entrega'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('abrir-entrega'));
  await tester.pumpAndSettle();
}

Future<void> _tocar(WidgetTester tester, Finder alvo) async {
  await tester.ensureVisible(alvo);
  await tester.pump();
  await tester.tap(alvo);
  await _esperar(tester);
}

Future<void> _procurar(WidgetTester tester, [String busca = '64999991234']) async {
  await tester.enterText(find.byType(TextField).first, busca);
  await _tocar(tester, find.text('Procurar estabelecimento'));
}

Future<void> _escolherLoja(WidgetTester tester) async {
  await _procurar(tester);
  await _tocar(tester, find.text('Pizzaria Boa Massa'));
}

Future<void> _preencherDados(WidgetTester tester, {bool confirmarNoMapa = true}) async {
  Future<void> digitar(String rotulo, String texto) async {
    final campo = find.widgetWithText(TextField, rotulo);
    await tester.ensureVisible(campo);
    await tester.enterText(campo, texto);
  }

  await digitar('O que vai levar (ex.: 2 pizzas grandes)', '2 pizzas grandes');
  await digitar('Nome de quem recebe', 'Ana Souza');
  await digitar('Telefone de quem recebe (com DDD)', '64 99999-5555');
  await digitar('Rua / avenida', 'Rua das Flores');
  await digitar('Número', '45');
  await digitar('Bairro', 'Setor Sul');
  await digitar('CEP', '75600-100');
  if (confirmarNoMapa) {
    await _tocar(tester, find.text('Confirmar endereço no mapa'));
    await _tocar(tester, find.text('Rua das Flores, 45'));
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    _liberado = true;
    _situacaoLoja = 'APROVADO';
    _semResultado = false;
    _doisResultados = false;
    _valorCents = 1200;
    _falhasDeRede = 0;
    _precoMudaNoLancamento = false;
    _recusa = null;
    _chamadas.clear();
    _lancamentos.clear();
    _cotacoes.clear();
  });

  test('chave de pedido segue as regras do servidor e nao se repete', () {
    final a = novaChaveDeEntrega();
    final b = novaChaveDeEntrega();
    expect(RegExp(r'^[A-Za-z0-9_-]{16,64}$').hasMatch(a), isTrue);
    expect(a, isNot(b));
  });

  testWidgets('busca mostra o estabelecimento, sem CNPJ nem telefone inteiro', (tester) async {
    await _abrir(tester);
    expect(find.text('Lançar entrega manualmente'), findsOneWidget);
    await _procurar(tester);
    expect(find.text('Pizzaria Boa Massa'), findsOneWidget);
    expect(find.textContaining('Telefone terminado em 1234'), findsOneWidget);
    expect(find.text('Aprovado'), findsOneWidget);
    expect(find.textContaining('999991234'), findsNothing);
    expect(_chamadas, contains('POST /api/driver/manual-deliveries/buscar'));
    // So buscou: nada foi cotado nem lancado.
    expect(_lancamentos, isEmpty);
  });

  testWidgets('busca curta pede mais letras e nao chama o servidor', (tester) async {
    await _abrir(tester);
    await _procurar(tester, 'ab');
    expect(find.byKey(const Key('erro-entrega-manual')), findsOneWidget);
    expect(_chamadas, isEmpty);
  });

  testWidgets('varios resultados: o motorista escolhe o certo (nada e criado sozinho)', (tester) async {
    _doisResultados = true;
    await _abrir(tester);
    await _procurar(tester, 'pizzaria');
    expect(find.text('Achei 2. Toque no certo:'), findsOneWidget);
    expect(find.text('Pizzaria Boa Massa'), findsOneWidget);
    expect(find.text('Pizzaria Boa Vista'), findsOneWidget);
    expect(_lancamentos, isEmpty);
  });

  testWidgets('nao achou: explica o motivo, sem criar cadastro', (tester) async {
    _semResultado = true;
    await _abrir(tester);
    await _procurar(tester);
    expect(find.textContaining('Nenhum estabelecimento da sua cidade'), findsOneWidget);
    expect(_chamadas.where((c) => c.contains('estabelecimentos/')), isEmpty);
  });

  testWidgets('Comercio nao liberado pela Central: avisa e nao deixa confirmar', (tester) async {
    _liberado = false;
    await _abrir(tester);
    await _procurar(tester);
    expect(find.textContaining('ainda não está liberado pela Central'), findsOneWidget);
    await _tocar(tester, find.text('Pizzaria Boa Massa'));
    expect(find.text('Confirmar este estabelecimento'), findsNothing);
    expect(find.textContaining('ainda não está liberado pela Central'), findsOneWidget);
  });

  testWidgets('estabelecimento nao aprovado: mostra o motivo e nao deixa confirmar', (tester) async {
    _situacaoLoja = 'AGUARDANDO';
    await _abrir(tester);
    await _procurar(tester);
    expect(find.text('Este estabelecimento ainda não foi aprovado pela Central.'), findsOneWidget);
    await _tocar(tester, find.text('Pizzaria Boa Massa'));
    expect(find.text('Confirmar este estabelecimento'), findsNothing);
    expect(find.text('Este estabelecimento ainda não foi aprovado pela Central.'), findsOneWidget);
  });

  testWidgets('perfil mostra cadastro, entregas concluidas e historico com a origem', (tester) async {
    await _abrir(tester);
    await _escolherLoja(tester);
    expect(find.text('Confira se é este estabelecimento'), findsOneWidget);
    expect(find.text('Boa Massa Alimentos Ltda'), findsOneWidget);
    expect(find.text('**.***.***/0001-91'), findsOneWidget);
    expect(find.text('Rua Javari, 100 - Centro, Goiatuba - GO, 75600-000'), findsOneWidget);
    expect(find.text('Entregas concluídas'), findsOneWidget);
    expect(find.text('17'), findsOneWidget);
    expect(find.textContaining('AB12CD · Concluída · Setor Sul · pelo aplicativo'), findsOneWidget);
    expect(find.textContaining('EF34GH · Concluída · Centro · lançada por motorista'), findsOneWidget);
    expect(find.text('Confirmar este estabelecimento'), findsOneWidget);
  });

  testWidgets('sem confirmar o endereco no mapa nao consulta o preco', (tester) async {
    await _abrir(tester);
    await _escolherLoja(tester);
    await _tocar(tester, find.text('Confirmar este estabelecimento'));
    await _preencherDados(tester, confirmarNoMapa: false);
    await _tocar(tester, find.text('Ver o preço'));
    expect(find.textContaining('Confirmar endereço no mapa'), findsWidgets);
    expect(find.byKey(const Key('erro-entrega-manual')), findsOneWidget);
    expect(_cotacoes, isEmpty);
  });

  testWidgets('fluxo completo: preco oficial, confirmacao e lancamento pelo caminho do Comercio', (tester) async {
    await _abrir(tester);
    await _escolherLoja(tester);
    await _tocar(tester, find.text('Confirmar este estabelecimento'));
    await _preencherDados(tester);
    expect(find.text('Endereço confirmado no mapa.'), findsOneWidget);
    await _tocar(tester, find.text('Ver o preço'));

    expect(find.text('Confira antes de lançar'), findsOneWidget);
    expect(find.byKey(const Key('preco-oficial')), findsOneWidget);
    expect(find.textContaining('12,00'), findsWidgets);
    expect(find.text('Preço oficial calculado pelo servidor.'), findsOneWidget);
    expect(find.text('Moto (o seu)'), findsOneWidget);
    // Cotou, mas ainda nao lancou.
    expect(_cotacoes.single['comercioId'], _lojaId);
    expect(_cotacoes.single.containsKey('veiculo'), isFalse);
    expect(_lancamentos, isEmpty);

    await _tocar(tester, find.text('Confirmar o preço e lançar a entrega'));
    final l = _lancamentos.single;
    expect(l['comercioId'], _lojaId);
    expect(RegExp(r'^[A-Za-z0-9_-]{16,64}$').hasMatch(l['chave'] as String), isTrue);
    expect(l['valorEsperadoCents'], 1200);
    expect(l['cotacao'], 'medida-assinada');
    // O veiculo e o do motorista: o app nao manda nem decide.
    expect(l.containsKey('veiculo'), isFalse);
    expect((l['encomenda'] as Map)['descricao'], '2 pizzas grandes');
    expect((l['destinatario'] as Map)['telefone'], '64999995555');
    final destino = l['destino'] as Map;
    expect(destino['cep'], '75600100');
    expect(destino['cidade'], 'Goiatuba');
    expect(destino['uf'], 'GO');
    expect(destino['latitude'], -18.0201);
    // Voltou para a tela anterior (a corrida assume).
    expect(find.text('Lançar entrega manualmente'), findsNothing);
    expect(find.text('abrir-entrega'), findsOneWidget);
  });

  testWidgets('rede cai ao lancar: "Tentar de novo" repete com a MESMA chave (nao duplica)', (tester) async {
    _falhasDeRede = 2;
    await _abrir(tester);
    await _escolherLoja(tester);
    await _tocar(tester, find.text('Confirmar este estabelecimento'));
    await _preencherDados(tester);
    await _tocar(tester, find.text('Ver o preço'));
    await _tocar(tester, find.text('Confirmar o preço e lançar a entrega'));
    // O cliente repete sozinho depois de 2 s (mesma chave); as duas caem.
    await tester.pump(const Duration(seconds: 3));
    await _esperar(tester);

    expect(find.textContaining('Sem conexão'), findsOneWidget);
    expect(find.text('Tentar de novo'), findsOneWidget);
    expect(_lancamentos.length, 2);

    await _tocar(tester, find.text('Tentar de novo'));
    expect(_lancamentos.length, 3);
    expect(_lancamentos.map((l) => l['chave']).toSet().length, 1, reason: 'todas as tentativas usam a mesma chave');
    expect(find.text('abrir-entrega'), findsOneWidget);
  });

  testWidgets('preco mudou: mostra o valor novo e pede nova confirmacao com chave nova', (tester) async {
    _precoMudaNoLancamento = true;
    await _abrir(tester);
    await _escolherLoja(tester);
    await _tocar(tester, find.text('Confirmar este estabelecimento'));
    await _preencherDados(tester);
    await _tocar(tester, find.text('Ver o preço'));
    await _tocar(tester, find.text('Confirmar o preço e lançar a entrega'));

    expect(find.text('Valor atualizado'), findsOneWidget);
    expect(find.textContaining('15,00'), findsWidgets);
    expect(find.textContaining('Confira o valor novo e confirme de novo'), findsOneWidget);
    expect(_lancamentos.length, 1);

    await _tocar(tester, find.text('Confirmar o preço e lançar a entrega'));
    expect(_lancamentos.length, 2);
    expect(_lancamentos[1]['valorEsperadoCents'], 1500);
    expect(_lancamentos[1]['chave'], isNot(_lancamentos[0]['chave']));
    expect(find.text('abrir-entrega'), findsOneWidget);
  });

  testWidgets('servidor recusa (porta fechada): mostra o motivo e fica na tela', (tester) async {
    _recusa = 'A entrega não está ligada nesta cidade.';
    await _abrir(tester);
    await _escolherLoja(tester);
    await _tocar(tester, find.text('Confirmar este estabelecimento'));
    await _preencherDados(tester);
    await _tocar(tester, find.text('Ver o preço'));
    await _tocar(tester, find.text('Confirmar o preço e lançar a entrega'));

    expect(find.text('A entrega não está ligada nesta cidade.'), findsOneWidget);
    expect(find.text('Confira antes de lançar'), findsOneWidget);
    expect(find.text('abrir-entrega'), findsNothing);
  });
}
