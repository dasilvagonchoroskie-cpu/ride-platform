// Abre cada tela nova da Central num celular de 360 x 780 com respostas no
// MESMO formato do servidor real (copiadas do teste de ponta a ponta) e
// confere que nada quebra: sem erro de leitura, sem texto estourando a tela,
// e que os botoes principais abrem o que devem.

import 'dart:convert';

import 'package:central_app/core/api/api_client.dart';
import 'package:central_app/core/theme/central_theme.dart';
import 'package:central_app/data/painel.dart';
import 'package:central_app/painel/alertas.dart';
import 'package:central_app/painel/cupons.dart';
import 'package:central_app/painel/despacho.dart';
import 'package:central_app/painel/financeiro.dart';
import 'package:central_app/painel/motoristas.dart';
import 'package:central_app/painel/painel_state.dart';
import 'package:central_app/painel/passageiros.dart';
import 'package:central_app/painel/tarifas.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _motoristaId = '11111111-1111-4111-8111-111111111111';
const _corridaId = '22222222-2222-4222-8222-222222222222';
const _passageiroId = '33333333-3333-4333-8333-333333333333';

Map<String, dynamic> _bandeira(String flag, int inicio, int fim) => {
      'flag': flag,
      'startHour': inicio,
      'endHour': fim,
      'baseFareCents': 1000,
      'perKmCents': 285,
      'perMinuteCents': 0,
      'waitingPerMinuteCents': 60,
      'freeDistanceMeters': 1500,
      'freeWaitingSeconds': 180,
      'minFareCents': 2000,
      'cancellationFeeCents': 500,
      'commissionPercent': 20,
      'updatedAt': '2026-10-03T10:00:00.000Z',
    };

Map<String, dynamic> _corrida(String status, {bool comMotorista = false}) => {
      'id': _corridaId,
      'code': 'AB12CD',
      'status': status,
      'passengerName': 'Maria Aparecida dos Santos Oliveira',
      'passengerPhone': '+5564999990000',
      'driverId': comMotorista ? _motoristaId : null,
      'driverPhone': comMotorista ? '+5564988887777' : null,
      'category': 'CARRO',
      'paymentMethodType': 'PIX',
      'multiplier': 1,
      'driverName': comMotorista ? 'Joao Batista da Silva' : 'Procurando motorista',
      'driverPlate': comMotorista ? 'ABC1D23' : '',
      'pickup': {'latitude': -18.0125, 'longitude': -49.3547, 'address': 'Rua Javari, 1234 - Setor Central, Goiatuba - GO'},
      'dropoff': {'latitude': -18.02, 'longitude': -49.36, 'address': 'Rodoviaria de Goiatuba - Avenida Brasil'},
      'estimatedFareCents': 1850,
      'requestedAt': '2026-10-03T13:00:00.000Z',
      'scheduledFor': status == 'SCHEDULED' ? '2026-10-04T10:30:00.000Z' : null,
      'discountCents': 0,
      'driverPosition': comMotorista ? {'latitude': -18.011, 'longitude': -49.35} : null,
    };

Map<String, dynamic> _motoristaLista(String status) => {
      'id': _motoristaId,
      'status': status,
      'isOnline': status == 'APPROVED',
      'createdAt': '2026-10-01T10:00:00.000Z',
      'rejectionReason': status == 'APPROVED' ? null : 'Documento ilegivel',
      'user': {'name': 'Joao Batista da Silva Pereira Junior', 'phone': '+5564988887777', 'email': 'joao@exemplo.com'},
      'vehicles': [
        {'brand': 'Chevrolet', 'model': 'Onix Plus', 'color': 'Prata', 'plate': 'ABC1D23', 'category': 'CARRO'},
      ],
      'documents': [
        {'id': 'd1', 'type': 'CNH_FRONT', 'status': 'PENDING', 'rejectionReason': null, 'fileUrl': '/arquivos/abc', 'uploadedAt': null},
      ],
      'documentProgress': {'total': 4, 'sent': 1},
    };

Object? _resposta(String metodo, String caminho, Map<String, String> q) {
  if (caminho == '/api/admin/overview') {
    return {
      'activeRides': 3,
      'completedToday': 27,
      'driversOnline': 12,
      'driversBusy': 4,
      'driversFree': 8,
      'revenueTodayCents': 123456,
      'commissionTodayCents': 24690,
      'sosActive': 0,
    };
  }
  if (caminho == '/api/admin/rides/active') {
    return {
      'items': [_corrida('SEARCHING'), _corrida('SCHEDULED'), _corrida('DRIVER_ARRIVING', comMotorista: true)],
    };
  }
  if (caminho == '/api/admin/dispatch/drivers') {
    return [
      {
        'driverId': _motoristaId,
        'name': 'Joao Batista da Silva',
        'phone': '+5564988887777',
        'busy': false,
        'vehicle': 'Chevrolet Onix Prata',
        'plate': 'ABC1D23',
        'category': 'CARRO',
        'distanceKm': 1.2,
        'latitude': -18.01,
        'longitude': -49.35,
        'rating': 4.9,
      },
      {
        'driverId': '44444444-4444-4444-8444-444444444444',
        'name': 'Pedro Ocupado',
        'phone': null,
        'busy': true,
        'vehicle': '',
        'plate': '',
        'category': 'CARRO',
        'distanceKm': null,
        'latitude': null,
        'longitude': null,
        'rating': 5,
      },
    ];
  }
  if (caminho == '/api/admin/safety') {
    if (q['resolved'] == 'true') {
      return {
        'items': [
          {
            'id': 's0',
            'createdAt': '2026-10-02T10:00:00.000Z',
            'updatedAt': '2026-10-02T10:05:00.000Z',
            'latitude': -18.0,
            'longitude': -49.3,
            'resolved': true,
            'note': 'Falso alarme',
            'who': {'name': 'Ana', 'phone': '+5564911112222', 'role': 'PASSENGER'},
            'emergencyContacts': [],
            'ride': null,
          },
        ],
      };
    }
    return {
      'items': [
        {
          'id': 's1',
          'createdAt': '2026-10-03T13:00:00.000Z',
          'updatedAt': '2026-10-03T13:01:00.000Z',
          'latitude': null,
          'longitude': null,
          'resolved': false,
          'note': null,
          'who': {'name': 'Maria Aparecida dos Santos Oliveira', 'phone': '+5564999990000', 'role': 'PASSENGER'},
          'emergencyContacts': [
            {'name': 'Irmã', 'phone': '+5564977776666'},
          ],
          'ride': {
            'code': 'AB12CD',
            'status': 'IN_PROGRESS',
            'pickupAddress': 'Rua Javari, 1234',
            'dropoffAddress': 'Rodoviaria',
            'passenger': {'name': 'Maria', 'phone': '+5564999990000'},
            'driver': {'name': 'Joao', 'phone': '+5564988887777'},
            'vehicle': 'Chevrolet Onix Prata - ABC1D23',
          },
        },
      ],
    };
  }
  if (caminho == '/api/admin/drivers') {
    return {
      'items': [_motoristaLista(q['status'] ?? 'PENDING')],
      'meta': {'total': 1},
    };
  }
  if (caminho == '/api/admin/drivers/$_motoristaId') {
    return {
      ..._motoristaLista('PENDING'),
      'cpf': '12345678909',
      'cnhNumber': '01234567890',
      'cnhCategory': 'B',
      'cnhExpiresAt': '2029-05-10T00:00:00.000Z',
      'financeModel': 'MENSALIDADE',
      'customCommissionPercent': null,
      'fixedFeeCents': null,
      'monthlyFeeCents': 15000,
      'monthlyPaidUntil': '2026-11-01T00:00:00.000Z',
      'ratingAvg': '4.85',
      'totalRides': 120,
      'wallet': {'balanceCents': -1250},
      'user': {
        'name': 'Joao Batista da Silva Pereira Junior',
        'phone': '+5564988887777',
        'email': 'joao@exemplo.com',
        'avatarUrl': null,
      },
    };
  }
  if (caminho == '/api/admin/passengers') {
    return {
      'items': [
        {
          'id': _passageiroId,
          'name': 'Maria Aparecida dos Santos Oliveira',
          'phone': '+5564999990000',
          'email': 'maria@exemplo.com',
          'status': 'BLOCKED',
          'blockedReason': 'Calote em duas corridas seguidas',
          'createdAt': '2026-09-01T10:00:00.000Z',
          'rides': 14,
        },
      ],
    };
  }
  if (caminho == '/api/admin/passengers/$_passageiroId/history') {
    return {
      'id': _passageiroId,
      'status': 'BLOCKED',
      'name': 'Maria',
      'history': [
        {'action': 'BLOQUEIO', 'reason': 'Calote em duas corridas seguidas', 'by': 'Evandro', 'at': '2026-10-01T10:00:00.000Z'},
        {'action': 'DESBLOQUEIO', 'reason': 'Pagou', 'by': 'Evandro', 'at': '2026-09-20T10:00:00.000Z'},
      ],
    };
  }
  if (caminho == '/api/admin/tariffs') {
    return {
      'diurna': _bandeira('DIURNA', 6, 22),
      'noturna': _bandeira('NOTURNA', 22, 6),
      'categorias': [
        {'codigo': 'CARRO', 'nome': 'Carro', 'ativa': true, 'diurna': _bandeira('DIURNA', 6, 22), 'noturna': _bandeira('NOTURNA', 22, 6), 'proprias': true},
        {'codigo': 'MOTO', 'nome': 'Moto', 'ativa': false, 'diurna': _bandeira('DIURNA', 6, 22), 'noturna': _bandeira('NOTURNA', 22, 6), 'proprias': true},
      ],
      'multiplicador': {
        'cidade': 1.2,
        'zonas': [
          {'nome': 'Rodoviaria', 'latitude': -18.02, 'longitude': -49.36, 'raioKm': 0.8, 'multiplicador': 1.5},
        ],
      },
    };
  }
  if (caminho == '/api/admin/payouts') {
    return {
      'items': [
        {
          'id': 'p1',
          'driverId': _motoristaId,
          'driverName': 'Joao Batista da Silva Pereira Junior',
          'driverPhone': '+5564988887777',
          'pixKey': 'joao.batista.silva.pereira@exemplo.com.br',
          'amountCents': 4500,
          'balanceCents': 6000,
          'status': 'REQUESTED',
          'failureReason': null,
          'requestedAt': '2026-10-03T12:00:00.000Z',
          'processedAt': null,
        },
        {
          'id': 'p2',
          'driverId': _motoristaId,
          'driverName': 'Joao',
          'driverPhone': null,
          'pixKey': '64988887777',
          'amountCents': 1000,
          'balanceCents': 0,
          'status': 'FAILED',
          'failureReason': 'Chave errada',
          'requestedAt': '2026-10-01T12:00:00.000Z',
          'processedAt': '2026-10-01T13:00:00.000Z',
        },
      ],
    };
  }
  if (caminho == '/api/admin/reports/finance') {
    return {
      'since': '2026-10-03T03:00:00.000Z',
      'byPaymentMethod': [
        {'paymentMethodType': 'CASH', 'rides': 10, 'totalCents': 25000, 'commissionCents': 5000, 'couponCents': 0},
        {'paymentMethodType': 'PIX', 'rides': 5, 'totalCents': 12000, 'commissionCents': 2400, 'couponCents': 300},
      ],
      'cashCents': 25000,
      'pixAndAppCents': 12000,
      'totalCents': 37000,
      'commissionCents': 7400,
      'couponCents': 300,
      'rides': 15,
      'payoutsPaidCents': 4500,
      'payoutsPaid': 1,
      'creditsSoldCents': 20000,
    };
  }
  if (caminho == '/api/admin/coupons') {
    return {
      'items': [
        {
          'id': 'c1',
          'code': 'BEMVINDO',
          'description': 'Primeira corrida com desconto',
          'discountType': 'PERCENT',
          'discountValue': 20,
          'maxDiscountCents': 1000,
          'minFareCents': 1500,
          'maxUses': 100,
          'maxUsesPerUser': 1,
          'usedCount': 7,
          'expiresAt': '2026-12-31T23:59:00.000Z',
          'isActive': true,
        },
      ],
    };
  }
  if (caminho == '/api/geo/search') return [];
  return null;
}

MockClient _servidor() => MockClient((http.Request r) async {
      final dados = _resposta(r.method, r.url.path, r.url.queryParameters);
      if (dados == null) {
        return http.Response(
          jsonEncode({'success': false, 'error': {'code': 'NOT_FOUND', 'message': 'Rota de teste sem resposta: ${r.url.path}'}}),
          404,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      return http.Response(
        jsonEncode({'success': true, 'data': dados}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

Future<PainelState> _abrir(WidgetTester tester, Widget tela) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final painel = PainelState(PainelApi(ApiClient(client: _servidor())));
  await tester.pumpWidget(
    ChangeNotifierProvider<PainelState>.value(
      value: painel,
      child: MaterialApp(
        theme: CentralTheme.dark,
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

/// Espera as respostas do servidor de mentira chegarem e a tela redesenhar.
Future<void> _carregar(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pumpAndSettle();
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
  });

  testWidgets('Despacho: fila, em andamento, escolher motorista e corrida manual', (tester) async {
    await _abrir(tester, const Despacho());
    expect(find.textContaining('Na fila (2)'), findsOneWidget);
    await tester.scrollUntilVisible(find.textContaining('Agendada para'), 300, scrollable: find.byType(Scrollable).at(1));
    expect(find.textContaining('Agendada para'), findsOneWidget);
    expect(find.text('Enviar para motorista'), findsWidgets);

    await tester.tap(find.text('Enviar para motorista').hitTestable().first);
    await _carregar(tester);
    expect(find.text('Enviar para qual motorista?'), findsOneWidget);
    expect(find.text('Joao Batista da Silva'), findsOneWidget);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    await tester.tap(find.textContaining('Em andamento'));
    await tester.pumpAndSettle();
    expect(find.text('Trocar motorista'), findsOneWidget);

    await tester.tap(find.text('Criar corrida manual'));
    await _carregar(tester);
    expect(find.text('Nome do passageiro'), findsOneWidget);
    await tester.ensureVisible(find.text('Criar corrida'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Criar corrida'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Falta:'), findsOneWidget);
  });

  testWidgets('Motoristas: lista, detalhe com documento, financeiro e carteira', (tester) async {
    await _abrir(tester, const Motoristas());
    await _carregar(tester);
    expect(find.text('Joao Batista da Silva Pereira Junior'), findsOneWidget);
    expect(find.textContaining('para conferir'), findsOneWidget);

    await tester.tap(find.text('Bloqueados'));
    await _carregar(tester);
    expect(find.text('Joao Batista da Silva Pereira Junior'), findsOneWidget);

    await tester.tap(find.text('Joao Batista da Silva Pereira Junior'));
    await _carregar(tester);
    expect(find.text('CNH (frente)'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Mensalidade (sem comissão)'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Modelo financeiro'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Carteira pré-paga'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('R\$'), findsWidgets);
    await tester.scrollUntilVisible(find.text('Bloquear'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Aprovar'), findsWidgets);
  });

  testWidgets('Passageiros: busca, bloqueado e historico', (tester) async {
    await _abrir(tester, const Passageiros());
    await _carregar(tester);
    expect(find.text('Maria Aparecida dos Santos Oliveira'), findsOneWidget);
    expect(find.textContaining('Calote'), findsOneWidget);

    await tester.tap(find.text('Maria Aparecida dos Santos Oliveira'));
    await _carregar(tester);
    expect(find.text('Histórico de bloqueios'), findsOneWidget);
    expect(find.textContaining('Bloqueado em'), findsOneWidget);
    expect(find.text('Desbloquear'), findsOneWidget);
  });

  testWidgets('Tarifas: categorias, noturna, nova categoria e multiplicador', (tester) async {
    await _abrir(tester, const TarifasTela());
    await _carregar(tester);
    expect(find.text('Carro'), findsWidgets);
    expect(find.text('Moto (desligada)'), findsOneWidget);

    await tester.tap(find.text('Noturna'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Moto (desligada)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Nova categoria'));
    await tester.pumpAndSettle();
    expect(find.text('Criar categoria'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Rodoviaria · 1.5x'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Rodoviaria · 1.5x'), findsOneWidget);
    expect(find.text('Multiplicador dinâmico'), findsOneWidget);
  });

  testWidgets('Financeiro: saques e receitas', (tester) async {
    await _abrir(tester, const Financeiro());
    await _carregar(tester);
    expect(find.text('Já fiz o PIX'), findsOneWidget);
    expect(find.text('Recusado'), findsOneWidget);

    await tester.tap(find.text('Já fiz o PIX'));
    await tester.pumpAndSettle();
    expect(find.text('Confirmar saque'), findsOneWidget);
    await tester.tap(find.text('Ainda não'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Receitas'));
    await _carregar(tester);
    expect(find.textContaining('Pago em dinheiro'), findsOneWidget);
    expect(find.text('Dinheiro'), findsOneWidget);
    await tester.tap(find.text('30 dias'));
    await _carregar(tester);
    expect(find.textContaining('Comissão da Central'), findsOneWidget);
  });

  testWidgets('Alertas: SOS aberto, janela fixa e encerrados', (tester) async {
    await _abrir(tester, const Alertas());
    await _carregar(tester);
    expect(find.textContaining('Abertos agora (1)'), findsOneWidget);
    expect(find.text('Falso alarme'), findsOneWidget);

    await tester.tap(find.textContaining('Passageiro: Maria'));
    await _carregar(tester);
    expect(find.text('190 Polícia'), findsOneWidget);
    expect(find.text('Silenciar'), findsOneWidget);
    expect(find.text('Contatos de emergência'), findsOneWidget);
  });

  testWidgets('Cupons: lista e novo cupom', (tester) async {
    await _abrir(tester, const CuponsTela());
    await _carregar(tester);
    expect(find.textContaining('BEMVINDO'), findsOneWidget);

    await tester.tap(find.text('Novo cupom'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Criar cupom'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Criar cupom'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Código com 3 a 30'), findsOneWidget);
  });

  test('Leitura dos dados no formato do servidor', () {
    final c = CorridaAtiva.fromJson(_corrida('DRIVER_WAITING', comMotorista: true));
    expect(c.fase, 'Motorista no embarque');
    expect(c.posicaoMotorista, isNotNull);
    final t = Tarifas.fromJson(_resposta('GET', '/api/admin/tariffs', const {})! as Map<String, dynamic>);
    expect(t.categorias.length, 2);
    expect(t.zonas.first.multiplicador, 1.5);
    expect(t.categorias.first.diurna.toJson()['perKmCents'], 285);
  });
}
