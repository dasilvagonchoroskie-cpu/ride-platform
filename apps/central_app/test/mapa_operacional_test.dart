// Mapa operacional da Central, filtros e telas Motos/Carros (Evandro, 12/11/2026).
//
// Tudo com servidor de mentira: nada toca em producao, em motorista real ou em
// estabelecimento real. O servidor de mentira responde no MESMO formato do
// servidor de verdade (campos `servico`, `origemDoServico`, `comercio`,
// `corrida` e `sos` vindos do backend, nunca de palavra na descricao).

import 'dart:convert';

import 'package:central_app/core/api/api_client.dart';
import 'package:central_app/core/theme/central_theme.dart';
import 'package:central_app/data/painel.dart';
import 'package:central_app/painel/comuns.dart';
import 'package:central_app/painel/frota.dart';
import 'package:central_app/painel/mapa_operacional.dart';
import 'package:central_app/painel/painel_state.dart';
import 'package:central_app/painel/visao_geral.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _donoId = '99999999-9999-4999-8999-999999999999';

Map<String, dynamic> _veiculo({
  required String id,
  required String nome,
  required String categoria,
  required double lat,
  required double lng,
  bool ocupado = false,
  bool online = true,
  String? servico,
  String? origem,
  String? comercio,
  bool sos = false,
  String? corridaCodigo,
}) =>
    {
      'driverId': id,
      'name': nome,
      'phone': '+5564988887777',
      'busy': ocupado,
      'vehicle': 'Veiculo de $nome',
      'plate': 'ABC1D23',
      'category': categoria,
      'distanceKm': 1.0,
      'latitude': lat,
      'longitude': lng,
      'rating': 4.8,
      'online': online,
      if (!online) 'lastSeenAt': DateTime.now().toUtc().subtract(const Duration(minutes: 7)).toIso8601String(),
      'servico': servico,
      'origemDoServico': origem,
      'comercio': comercio,
      'corrida': corridaCodigo == null ? null : {'id': 'corrida-$corridaCodigo', 'code': corridaCodigo, 'status': 'IN_PROGRESS'},
      'sos': sos,
    };

/// A frota de mentira: 7 veiculos, um de cada situacao que o mapa precisa mostrar.
List<Map<String, dynamic>> _frotaNoMapa() => [
      _veiculo(id: 'a', nome: 'Livia Moto Livre', categoria: 'MOTO', lat: -18.000, lng: -49.340),
      _veiculo(
        id: 'b',
        nome: 'Caio Carro Passageiro',
        categoria: 'CARRO',
        lat: -18.005,
        lng: -49.360,
        ocupado: true,
        servico: 'PASSAGEIRO',
        corridaCodigo: 'PA1111',
      ),
      _veiculo(
        id: 'c',
        nome: 'Marcos Moto Comercio',
        categoria: 'MOTO',
        lat: -18.020,
        lng: -49.350,
        ocupado: true,
        servico: 'COMERCIO',
        origem: 'APP',
        comercio: 'Pizzaria Boa',
        corridaCodigo: 'CM2222',
      ),
      _veiculo(
        id: 'd',
        nome: 'Nando Carro Comercio',
        categoria: 'CARRO',
        lat: -18.025,
        lng: -49.370,
        ocupado: true,
        servico: 'COMERCIO',
        origem: 'MOTORISTA',
        comercio: 'Farmacia Central',
        corridaCodigo: 'CM3333',
      ),
      _veiculo(
        id: 'e',
        nome: 'Sonia Carro SOS',
        categoria: 'CARRO',
        lat: -18.010,
        lng: -49.380,
        ocupado: true,
        servico: 'COMERCIO',
        origem: 'APP',
        comercio: 'Padaria Sol',
        sos: true,
        corridaCodigo: 'CM4444',
      ),
      _veiculo(
        id: 'f',
        nome: 'Otto Moto Offline',
        categoria: 'MOTO',
        lat: -18.030,
        lng: -49.335,
        ocupado: true,
        online: false,
        servico: 'COMERCIO',
        origem: 'APP',
        comercio: 'Mercado Azul',
        corridaCodigo: 'CM5555',
      ),
      _veiculo(id: 'g', nome: 'Rita Carro Livre', categoria: 'CARRO', lat: -18.015, lng: -49.330),
    ];

Map<String, dynamic> _vFrota(String id, String placa, String marca, String modelo, String tipo, String situacao, {String? motivo}) => {
      'id': id,
      'plate': placa,
      'brand': marca,
      'model': modelo,
      'year': 2023,
      'color': 'Vermelha',
      'category': tipo == 'MOTO' ? 'MOTO' : 'CARRO',
      'tipo': tipo,
      'situacao': situacao,
      'motivo': motivo,
      'emUso': situacao == 'EM_USO',
      'fotoUrl': '/arquivos/foto-$id',
      'crlvUrl': null,
      'enviadoEm': '2026-11-01T10:00:00.000Z',
      'categoriaPedida': null,
      'createdAt': '2026-10-20T10:00:00.000Z',
      'driver': {'id': _donoId, 'status': 'APPROVED', 'name': 'Joana Motociclista', 'phone': '+5564977776666'},
    };

/// Situacao da moto m1 no servidor de mentira (muda com a suspensao).
String _situacaoM1 = 'EM_USO';
String? _motivoM1;
final List<String> _pedidos = [];

Map<String, dynamic> _carroDoMotorista() => {
      'id': 'm1',
      'plate': 'MTO1A11',
      'brand': 'Honda',
      'model': 'CG 160',
      'year': 2023,
      'color': 'Vermelha',
      'category': 'MOTO',
      'isActive': _situacaoM1 == 'EM_USO',
      'situacao': _situacaoM1,
      'motivo': _motivoM1,
      'fotoUrl': '/arquivos/foto-m1',
      'crlvUrl': null,
    };

http.Response _json(Object dados, [int status = 200]) => http.Response(
      jsonEncode({'success': status < 400, 'data': dados}),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

MockClient _servidor({bool comercioNaFila = true}) => MockClient((http.Request r) async {
      final c = r.url.path;
      final q = r.url.queryParameters;
      if (c == '/api/admin/overview') {
        return _json({
          'activeRides': 5,
          'completedToday': 3,
          'driversOnline': 6,
          'driversBusy': 4,
          'driversFree': 2,
          'revenueTodayCents': 0,
          'commissionTodayCents': 0,
          'monthlyFeesTodayCents': 0,
          'centralRevenueTodayCents': 0,
          'sosActive': 1,
        });
      }
      if (c == '/api/admin/rides/active') {
        return _json({
          'items': [
            if (comercioNaFila)
              {
                'id': 'corrida-fila-comercio',
                'code': 'CF9999',
                'status': 'SEARCHING',
                'passengerName': 'Mercado Azul',
                'passengerPhone': null,
                'driverId': null,
                'driverPhone': null,
                'category': 'ENTREGA_MOTO',
                'paymentMethodType': 'CASH',
                'driverName': 'Procurando motorista',
                'driverPlate': '',
                'pickup': {'latitude': -18.0125, 'longitude': -49.3547, 'address': 'Rua do Comercio, 10'},
                'dropoff': {'latitude': -18.02, 'longitude': -49.36, 'address': 'Rua do Cliente, 20'},
                'estimatedFareCents': 900,
                'requestedAt': '2026-11-12T13:00:00.000Z',
                'scheduledFor': null,
                'servico': 'COMERCIO',
                'origemDoServico': 'APP',
                'comercio': 'Mercado Azul',
              },
          ],
        });
      }
      if (c == '/api/admin/dispatch/drivers') return _json(_frotaNoMapa());
      if (c == '/api/admin/safety') return _json({'items': <dynamic>[]});
      if (c == '/api/admin/eu') {
        return _json({'dono': true, 'praca': null, 'pracaNome': null, 'pracas': <dynamic>[]});
      }
      if (c == '/api/admin/pracas') return _json({'items': <dynamic>[]});
      if (c == '/api/admin/frota') {
        _pedidos.add('GET $c ${q['tipo']} ${q['busca'] ?? '-'} ${q['situacao'] ?? '-'}');
        final tudo = [
          _vFrota('m1', 'MTO1A11', 'Honda', 'CG 160', 'MOTO', _situacaoM1, motivo: _motivoM1),
          _vFrota('m2', 'MTO2B22', 'Yamaha', 'Factor 150', 'MOTO', 'PENDENTE'),
          _vFrota('c1', 'CAR1A11', 'Fiat', 'Argo', 'CARRO', 'EM_USO'),
        ];
        var lista = [for (final v in tudo) if (v['tipo'] == q['tipo']) v];
        final busca = (q['busca'] ?? '').toLowerCase();
        if (busca.isNotEmpty) {
          lista = [for (final v in lista) if ('${v['plate']} ${v['brand']} ${v['model']}'.toLowerCase().contains(busca)) v];
        }
        final sit = q['situacao'];
        if (sit != null) lista = [for (final v in lista) if (v['situacao'] == sit) v];
        return _json({'total': lista.length, 'itens': lista, 'cortada': false});
      }
      if (c == '/api/admin/drivers/$_donoId/vehicles') return _json([_carroDoMotorista()]);
      if (c == '/api/admin/vehicles/m1/suspensao' && r.method == 'PATCH') {
        final b = jsonDecode(r.body) as Map;
        _pedidos.add('PATCH $c ${r.body}');
        if (b['suspender'] == true) {
          _situacaoM1 = 'SUSPENSO';
          _motivoM1 = '${b['motivo']}';
        } else {
          _situacaoM1 = 'GUARDADO';
          _motivoM1 = null;
        }
        return _json([_carroDoMotorista()]);
      }
      return _json({'code': 'NOT_FOUND', 'message': 'Rota de teste sem resposta: $c'}, 404);
    });

Future<PainelState> _abrir(WidgetTester tester, Widget tela, {bool comercioNaFila = true}) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final painel = PainelState(PainelApi(ApiClient(client: _servidor(comercioNaFila: comercioNaFila))));
  await tester.pumpWidget(
    ChangeNotifierProvider<PainelState>.value(
      value: painel,
      child: MaterialApp(
        theme: CentralTheme.light,
        locale: const Locale('pt', 'BR'),
        supportedLocales: const [Locale('pt', 'BR')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: Scaffold(body: tela),
      ),
    ),
  );
  await tester.runAsync(() => painel.atualizar());
  await tester.pumpAndSettle();
  return painel;
}

Future<void> _carregar(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pumpAndSettle();
  }
}

Finder _pinoDe(String nome) => find.byWidgetPredicate((w) => w is PinoDoVeiculo && w.veiculo.nome == nome);

/// Existe, dentro do pino, a bolinha principal nesta cor?
Finder _bolinhaDe(String nome, Color cor) => find.descendant(
      of: _pinoDe(nome),
      matching: find.byWidgetPredicate((w) {
        if (w is! Container) return false;
        final d = w.decoration;
        return d is BoxDecoration && d.color == cor && d.boxShadow != null && d.boxShadow!.isNotEmpty;
      }),
    );

MotoristaOnline _m(String nome) => MotoristaOnline.fromJson(_frotaNoMapa().firstWhere((j) => j['name'] == nome));

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    mostrarRuasNoMapa = false;
    _situacaoM1 = 'EM_USO';
    _motivoM1 = null;
    _pedidos.clear();
  });

  group('Regras do mapa (sem tela)', () {
    test('o servidor manda servico, origem, estabelecimento, corrida e SOS', () {
      final c = _m('Nando Carro Comercio');
      expect(c.servico, 'COMERCIO');
      expect(c.origemDoServico, 'MOTORISTA');
      expect(c.comercio, 'Farmacia Central');
      expect(c.corridaCodigo, 'CM3333');
      expect(c.corridaStatus, 'IN_PROGRESS');
      expect(c.sos, isFalse);
      expect(_m('Sonia Carro SOS').sos, isTrue);
      expect(_m('Livia Moto Livre').servico, isNull);
    });

    test('ICONE e o tipo do veiculo, COR e o tipo de servico', () {
      expect(_m('Livia Moto Livre').moto, isTrue);
      expect(iconeDoVeiculo(_m('Livia Moto Livre')), Icons.two_wheeler);
      expect(iconeDoVeiculo(_m('Marcos Moto Comercio')), Icons.two_wheeler);
      expect(iconeDoVeiculo(_m('Rita Carro Livre')), Icons.local_taxi);
      expect(iconeDoVeiculo(_m('Nando Carro Comercio')), Icons.local_taxi);

      expect(estadoDoVeiculo(_m('Rita Carro Livre')), EstadoNoMapa.livre);
      expect(estadoDoVeiculo(_m('Caio Carro Passageiro')), EstadoNoMapa.passageiro);
      expect(estadoDoVeiculo(_m('Marcos Moto Comercio')), EstadoNoMapa.comercio);
      expect(estadoDoVeiculo(_m('Nando Carro Comercio')), EstadoNoMapa.comercio);
      expect(estadoDoVeiculo(_m('Otto Moto Offline')), EstadoNoMapa.offline);
    });

    test('cores: passageiro mantem as de sempre, Comercio e ciano exclusivo, SOS e vermelho', () {
      expect(corDoEstado(EstadoNoMapa.livre), AppColors.success);
      expect(corDoEstado(EstadoNoMapa.passageiro), AppColors.warning);
      expect(corDoEstado(EstadoNoMapa.offline), cinzaOffline);
      expect(corDoEstado(EstadoNoMapa.comercio), AppColors.comercio);
      expect(corDoEstado(EstadoNoMapa.sos), AppColors.danger);
      // O ciano nao e usado por nenhum outro estado.
      final outras = [for (final e in EstadoNoMapa.values) if (e != EstadoNoMapa.comercio) corDoEstado(e)];
      expect(outras.contains(AppColors.comercio), isFalse);
    });

    test('SOS vence qualquer servico, sem perder o contexto da entrega', () {
      final s = _m('Sonia Carro SOS');
      expect(estadoDoVeiculo(s), EstadoNoMapa.sos);
      expect(seloDoVeiculo(s), seloSos);
      expect(corDoSelo(s), AppColors.danger);
      expect(rotuloDoEstado(s), 'SOS aberto');
      // O servico continua no dado (detalhe mostra "Entrega do Comércio").
      expect(s.servico, 'COMERCIO');
      expect(rotuloDoServico(s.servico, origem: s.origemDoServico), 'Entrega do Comércio');
    });

    test('nunca so a cor: cada servico tem selo e texto', () {
      expect(seloDoVeiculo(_m('Marcos Moto Comercio')), seloComercio);
      expect(seloDoVeiculo(_m('Caio Carro Passageiro')), seloPassageiro);
      expect(seloDoVeiculo(_m('Rita Carro Livre')), isNull);
      // Offline continua com o selo do que fazia, em ciano.
      expect(seloDoVeiculo(_m('Otto Moto Offline')), seloComercio);
      expect(corDoSelo(_m('Otto Moto Offline')), AppColors.comercio);
      expect(rotuloDoEstado(_m('Marcos Moto Comercio')), 'Em entrega do Comércio');
      expect(rotuloDoEstado(_m('Caio Carro Passageiro')), 'Em corrida');
      expect(rotuloDoEstado(_m('Rita Carro Livre')), 'Livre');
      expect(rotuloDoEstado(_m('Otto Moto Offline'), vistoHa: ' · visto há 7 min'), 'Offline · visto há 7 min');
      expect(rotuloDoVeiculo(_m('Livia Moto Livre')), 'Moto');
      expect(rotuloDoVeiculo(_m('Rita Carro Livre')), 'Carro');
    });

    test('entrega lancada pelo motorista e pedida pelo aplicativo aparecem distintas', () {
      expect(rotuloDoServico('COMERCIO', origem: 'MOTORISTA'), 'Entrega do Comércio (lançada pelo motorista)');
      expect(rotuloDoServico('COMERCIO', origem: 'APP'), 'Entrega do Comércio');
      expect(rotuloDaOrigem('MOTORISTA'), 'Lançada manualmente pelo motorista');
      expect(rotuloDaOrigem('APP'), 'Pedida pelo aplicativo do estabelecimento');
      expect(rotuloDoServico('PASSAGEIRO'), 'Transporte de passageiro');
      expect(rotuloDoServico(null), 'Nenhum');
    });

    test('filtros: cada um separa o que diz', () {
      final todos = [for (final j in _frotaNoMapa()) MotoristaOnline.fromJson(j)];
      List<String> quem(FiltroDoMapa f) => [for (final m in todos) if (veiculoPassaNoFiltro(m, f)) m.nome];
      expect(quem(FiltroDoMapa.todos).length, 7);
      expect(quem(FiltroDoMapa.carros), ['Caio Carro Passageiro', 'Nando Carro Comercio', 'Sonia Carro SOS', 'Rita Carro Livre']);
      expect(quem(FiltroDoMapa.motos), ['Livia Moto Livre', 'Marcos Moto Comercio', 'Otto Moto Offline']);
      expect(quem(FiltroDoMapa.passageiros), ['Caio Carro Passageiro']);
      expect(quem(FiltroDoMapa.comercio), ['Marcos Moto Comercio', 'Nando Carro Comercio', 'Sonia Carro SOS', 'Otto Moto Offline']);
      expect(quem(FiltroDoMapa.livres), ['Livia Moto Livre', 'Rita Carro Livre']);
      expect(quem(FiltroDoMapa.sos), ['Sonia Carro SOS']);
      expect(contarNoFiltro(todos, FiltroDoMapa.comercio), 4);
      expect(rotuloDoFiltro(FiltroDoMapa.motos), 'Motocicletas');
      expect(rotuloDoFiltro(FiltroDoMapa.passageiros), 'Transporte de passageiros');
      expect(rotuloDoFiltro(FiltroDoMapa.comercio), 'Entregas do Comércio');
    });

    test('corrida esperando motorista segue o mesmo filtro', () {
      final fila = CorridaAtiva.fromJson({
        'id': 'x',
        'code': 'CF9999',
        'status': 'SEARCHING',
        'category': 'ENTREGA_MOTO',
        'pickup': {'latitude': -18.0, 'longitude': -49.3},
        'dropoff': {'latitude': -18.0, 'longitude': -49.3},
        'servico': 'COMERCIO',
        'origemDoServico': 'APP',
        'comercio': 'Mercado Azul',
      });
      expect(fila.servico, 'COMERCIO');
      expect(corridaPassaNoFiltro(fila, FiltroDoMapa.comercio), isTrue);
      expect(corridaPassaNoFiltro(fila, FiltroDoMapa.motos), isTrue);
      expect(corridaPassaNoFiltro(fila, FiltroDoMapa.carros), isFalse);
      expect(corridaPassaNoFiltro(fila, FiltroDoMapa.passageiros), isFalse);
      // Servidor antigo (sem o campo) = passageiro.
      final velha = CorridaAtiva.fromJson({'id': 'y', 'code': 'AA', 'status': 'SEARCHING', 'pickup': {}, 'dropoff': {}});
      expect(velha.servico, 'PASSAGEIRO');
      expect(corridaPassaNoFiltro(velha, FiltroDoMapa.passageiros), isTrue);
      expect(corridaPassaNoFiltro(velha, FiltroDoMapa.comercio), isFalse);
    });
  });

  group('Mapa na Visao Geral', () {
    testWidgets('mostra a frota inteira, com ciano so no Comercio e vermelho no SOS', (tester) async {
      await _abrir(tester, VisaoGeral(abrirDespacho: () {}));
      await _carregar(tester);

      expect(find.byType(PinoDoVeiculo), findsNWidgets(7));
      // Icone = tipo do veiculo.
      expect(find.byIcon(Icons.two_wheeler), findsNWidgets(3));
      // Cor = servico.
      expect(_bolinhaDe('Marcos Moto Comercio', AppColors.comercio), findsOneWidget);
      expect(_bolinhaDe('Nando Carro Comercio', AppColors.comercio), findsOneWidget);
      expect(_bolinhaDe('Caio Carro Passageiro', AppColors.warning), findsOneWidget);
      expect(_bolinhaDe('Livia Moto Livre', AppColors.success), findsOneWidget);
      expect(_bolinhaDe('Rita Carro Livre', AppColors.success), findsOneWidget);
      expect(_bolinhaDe('Otto Moto Offline', cinzaOffline), findsOneWidget);
      // SOS prevalece sobre a entrega: vermelho, nao ciano.
      expect(_bolinhaDe('Sonia Carro SOS', AppColors.danger), findsOneWidget);
      expect(_bolinhaDe('Sonia Carro SOS', AppColors.comercio), findsNothing);
      // Selo de SOS so existe nesse pino.
      expect(find.descendant(of: _pinoDe('Sonia Carro SOS'), matching: find.byIcon(Icons.sos)), findsOneWidget);
      expect(find.descendant(of: _pinoDe('Marcos Moto Comercio'), matching: find.byIcon(Icons.inventory_2)), findsOneWidget);
    });

    testWidgets('legenda explica as cores e os filtros mostram as contagens', (tester) async {
      await _abrir(tester, VisaoGeral(abrirDespacho: () {}));
      await _carregar(tester);

      expect(find.text('Livre (online)'), findsOneWidget);
      expect(find.text('Em corrida (passageiro)'), findsOneWidget);
      expect(find.text('Entrega do Comércio'), findsOneWidget);
      expect(find.text('SOS (prioridade máxima)'), findsOneWidget);
      expect(find.text('Todos'), findsOneWidget);
      expect(find.text('Carros (4)'), findsOneWidget);
      expect(find.text('Motocicletas (3)'), findsOneWidget);
      expect(find.text('Transporte de passageiros (1)'), findsOneWidget);
      expect(find.text('Entregas do Comércio (4)'), findsOneWidget);
      expect(find.text('Veículos livres (2)'), findsOneWidget);
      expect(find.text('SOS (1)'), findsOneWidget);
    });

    testWidgets('filtros so mudam o desenho: Comercio, Motos, Livres e SOS', (tester) async {
      final painel = await _abrir(tester, VisaoGeral(abrirDespacho: () {}));
      await _carregar(tester);

      Future<void> escolher(String ficha) async {
        await tester.ensureVisible(find.text(ficha));
        await tester.tap(find.text(ficha));
        await tester.pumpAndSettle();
      }

      await escolher('Entregas do Comércio (4)');
      expect(find.byType(PinoDoVeiculo), findsNWidgets(4));
      expect(_pinoDe('Caio Carro Passageiro'), findsNothing);
      expect(_pinoDe('Livia Moto Livre'), findsNothing);

      await escolher('Motocicletas (3)');
      expect(find.byType(PinoDoVeiculo), findsNWidgets(3));
      expect(_pinoDe('Nando Carro Comercio'), findsNothing);

      await escolher('Veículos livres (2)');
      expect(find.byType(PinoDoVeiculo), findsNWidgets(2));
      expect(_pinoDe('Rita Carro Livre'), findsOneWidget);

      await escolher('Transporte de passageiros (1)');
      expect(find.byType(PinoDoVeiculo), findsNWidgets(1));
      expect(_pinoDe('Caio Carro Passageiro'), findsOneWidget);

      await escolher('SOS (1)');
      expect(find.byType(PinoDoVeiculo), findsNWidgets(1));
      expect(_pinoDe('Sonia Carro SOS'), findsOneWidget);

      await escolher('Todos');
      expect(find.byType(PinoDoVeiculo), findsNWidgets(7));

      // O filtro nao mexeu nos dados que o despacho, a localizacao e o SOS usam.
      expect(painel.motoristas.length, 7);
      expect(painel.motoristas.where((m) => m.sos).length, 1);
    });

    testWidgets('detalhe: entrega do Comercio pedida pelo aplicativo', (tester) async {
      await _abrir(tester, VisaoGeral(abrirDespacho: () {}));
      await _carregar(tester);

      await tester.tap(_pinoDe('Marcos Moto Comercio'));
      await tester.pumpAndSettle();
      expect(find.text('Marcos Moto Comercio'), findsOneWidget);
      expect(find.text('Em entrega do Comércio'), findsOneWidget);
      expect(find.text('Moto'), findsOneWidget);
      expect(find.text('Estabelecimento'), findsWidgets);
      expect(find.text('Pizzaria Boa'), findsWidgets);
      expect(find.text('Pedida pelo aplicativo do estabelecimento'), findsOneWidget);
    });

    testWidgets('detalhe: entrega lancada pelo motorista aparece como tal', (tester) async {
      await _abrir(tester, VisaoGeral(abrirDespacho: () {}));
      await _carregar(tester);

      await tester.tap(_pinoDe('Nando Carro Comercio'));
      await tester.pumpAndSettle();
      expect(find.text('Carro'), findsOneWidget);
      expect(find.text('Entrega do Comércio (lançada pelo motorista)'), findsOneWidget);
      expect(find.text('Farmacia Central'), findsWidgets);
      expect(find.text('Lançada manualmente pelo motorista'), findsOneWidget);
    });

    testWidgets('detalhe: SOS aparece primeiro e a entrega continua visivel', (tester) async {
      await _abrir(tester, VisaoGeral(abrirDespacho: () {}));
      await _carregar(tester);

      await tester.tap(_pinoDe('Sonia Carro SOS'));
      await tester.pumpAndSettle();
      expect(find.text('SOS ABERTO durante entrega do Comércio'), findsOneWidget);
      expect(find.text('SOS aberto'), findsOneWidget);
      expect(find.text('Entrega do Comércio'), findsWidgets);
      expect(find.text('Padaria Sol'), findsWidgets);
    });

    testWidgets('detalhe: passageiro mantem "Transporte de passageiro" e offline mostra o visto', (tester) async {
      await _abrir(tester, VisaoGeral(abrirDespacho: () {}));
      await _carregar(tester);

      await tester.tap(_pinoDe('Caio Carro Passageiro'));
      await tester.pumpAndSettle();
      expect(find.text('Transporte de passageiro'), findsOneWidget);
      expect(find.text('Em corrida'), findsOneWidget);
      expect(find.text('Estabelecimento'), findsNothing);
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();

      await tester.tap(_pinoDe('Otto Moto Offline'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Offline · visto há 7 min'), findsOneWidget);
    });
  });

  group('Motos e Carros na Central', () {
    testWidgets('Motos lista so motos, com motorista, placa, situacao e documentos enviados', (tester) async {
      await _abrir(tester, const FrotaTela(moto: true));
      await _carregar(tester);

      expect(find.textContaining('MTO-1A11'), findsOneWidget);
      expect(find.textContaining('Honda CG 160'), findsOneWidget);
      expect(find.textContaining('Yamaha Factor 150'), findsOneWidget);
      expect(find.textContaining('Fiat Argo'), findsNothing);
      expect(find.text('Em uso'), findsWidgets);
      expect(find.text('Para conferir'), findsWidgets);
      expect(find.textContaining('Joana Motociclista'), findsWidgets);
      expect(find.text('2 motos'), findsOneWidget);
      expect(_pedidos.first, 'GET /api/admin/frota MOTO - -');
    });

    testWidgets('Carros lista so carros (a tela de Carros nao perde nada)', (tester) async {
      await _abrir(tester, const FrotaTela(moto: false));
      await _carregar(tester);

      expect(find.textContaining('Fiat Argo'), findsOneWidget);
      expect(find.textContaining('Honda CG 160'), findsNothing);
      expect(find.text('1 carro'), findsOneWidget);
    });

    testWidgets('busca e filtro de situacao vao para o servidor', (tester) async {
      await _abrir(tester, const FrotaTela(moto: true));
      await _carregar(tester);

      await tester.enterText(find.byType(TextField), 'yamaha');
      await tester.tap(find.byIcon(Icons.arrow_forward));
      await _carregar(tester);
      expect(find.textContaining('Yamaha Factor 150'), findsOneWidget);
      expect(find.textContaining('Honda CG 160'), findsNothing);
      expect(_pedidos.last, 'GET /api/admin/frota MOTO yamaha -');

      await tester.tap(find.text('Suspensos'));
      await _carregar(tester);
      expect(find.textContaining('Nenhuma moto encontrada'), findsOneWidget);
      expect(_pedidos.last, 'GET /api/admin/frota MOTO yamaha SUSPENSO');
    });

    testWidgets('detalhe mostra os dados e avisa que cadastro nao e autorizacao de entrega', (tester) async {
      await _abrir(tester, const FrotaTela(moto: true));
      await _carregar(tester);

      await tester.tap(find.textContaining('Honda CG 160'));
      await _carregar(tester);
      expect(find.text('Moto MTO-1A11'), findsOneWidget);
      expect(find.text('Joana Motociclista'), findsWidgets);
      expect(find.text('Aprovado'), findsWidgets);
      expect(find.text('Documentação'), findsOneWidget);
      expect(find.textContaining('validade do documento ainda não é registrada'), findsOneWidget);
      expect(find.textContaining('não autoriza entregas'), findsOneWidget);
    });

    testWidgets('suspender exige motivo, avisa o servidor e permite reativar', (tester) async {
      await _abrir(tester, const FrotaTela(moto: true));
      await _carregar(tester);
      await tester.tap(find.textContaining('Honda CG 160'));
      await _carregar(tester);

      await tester.ensureVisible(find.byType(PopupMenuButton<String>).first);
      await tester.tap(find.byType(PopupMenuButton<String>).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Suspender veículo'));
      await tester.pumpAndSettle();

      // Sem motivo nao vai.
      await tester.tap(find.text('Suspender'));
      await tester.pumpAndSettle();
      expect(find.text('Escreva pelo menos 3 letras.'), findsOneWidget);
      expect(_pedidos.where((p) => p.startsWith('PATCH')), isEmpty);

      await tester.enterText(find.byType(TextField).last, 'Documento vencido');
      await tester.tap(find.text('Suspender'));
      await _carregar(tester);
      expect(_pedidos.where((p) => p.startsWith('PATCH')).single, contains('"suspender":true'));
      expect(_pedidos.last, contains('Documento vencido'));
      expect(find.text('Reativar veículo'), findsOneWidget);

      await tester.ensureVisible(find.text('Reativar veículo'));
      await tester.tap(find.text('Reativar veículo'));
      await _carregar(tester);
      expect(_pedidos.last, contains('"suspender":false'));
      expect(find.text('Reativar veículo'), findsNothing);
    });
  });
}
