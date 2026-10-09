// Abre cada tela nova da Central num celular de 360 x 780 com respostas no
// MESMO formato do servidor real (copiadas do teste de ponta a ponta) e
// confere que nada quebra: sem erro de leitura, sem texto estourando a tela,
// e que os botoes principais abrem o que devem.

import 'dart:convert';

import 'package:central_app/core/api/api_client.dart';
import 'package:central_app/core/theme/central_theme.dart';
import 'package:central_app/data/painel.dart';
import 'package:central_app/data/repositories/central_repository.dart';
import 'package:central_app/painel/alertas.dart';
import 'package:central_app/painel/carteiras.dart';
import 'package:central_app/painel/cidades_equipe.dart';
import 'package:central_app/painel/limpeza.dart';
import 'package:central_app/painel/comuns.dart';
import 'package:central_app/painel/cupons.dart';
import 'package:central_app/painel/despacho.dart';
import 'package:central_app/painel/financeiro.dart';
import 'package:central_app/painel/motoristas.dart';
import 'package:central_app/painel/painel_state.dart';
import 'package:central_app/painel/passageiros.dart';
import 'package:central_app/painel/tarifas.dart';
import 'package:central_app/painel/visao_geral.dart';
import 'package:central_app/screens/shell_screen.dart';
import 'package:central_app/state/central_state.dart';
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

/// Ids que a Central mandou excluir (POST /admin/drivers/excluir).
final List<String> _pedidosDeExclusao = [];

/// Cenario do teste: SOS aberto e cadastro de motorista esperando a Central.
bool _comSos = true;
bool _comPendente = false;

/// Conta de operador de uma cidade (Teutonia), e nao o dono.
bool _operador = false;

final _pracasTeste = [
  {'id': 'goiatuba', 'nome': 'Goiatuba', 'uf': 'GO', 'latitude': -18.0125, 'longitude': -49.3547, 'raioKm': 60, 'ativa': true, 'whatsapp': null},
  {'id': 'teutonia-rs', 'nome': 'Teutônia', 'uf': 'RS', 'latitude': -29.448, 'longitude': -51.806, 'raioKm': 30, 'ativa': true, 'whatsapp': '5551999990000'},
];

Object? _resposta(String metodo, String caminho, Map<String, String> q) {
  if (caminho == '/api/admin/eu') {
    return _operador
        ? {'dono': false, 'praca': 'teutonia-rs', 'pracaNome': 'Teutônia', 'pracas': [_pracasTeste[1]]}
        : {'dono': true, 'praca': null, 'pracaNome': null, 'pracas': _pracasTeste};
  }
  if (caminho == '/api/admin/pracas') return {'items': _pracasTeste};
  if (caminho == '/api/admin/equipe') {
    return {
      'items': [
        {'id': 'a1', 'name': 'Evandro da Silva', 'email': 'fortalezadigitalsecurity@gmail.com', 'phone': '+5564992686632', 'ativo': true, 'dono': true, 'praca': null, 'pracaNome': null},
        {'id': 'a2', 'name': 'Sobrinha do Evandro', 'email': 'sobrinha@exemplo.com', 'phone': '+5551999990000', 'ativo': true, 'dono': false, 'praca': 'teutonia-rs', 'pracaNome': 'Teutônia'},
      ],
    };
  }
  if (caminho == '/api/admin/limpeza') {
    return {'contasTeste': 120, 'contas': 126, 'corridas': 140, 'movimentos': 148, 'saques': 15, 'sos': 21, 'avaliacoes': 42, 'cuponsTeste': 22, 'ultimaCopia': null};
  }
  if (caminho == '/api/admin/limpeza/contas') {
    return {
      'items': [
        {'id': 'u1', 'name': 'Evandro Da Silva gonchoroski', 'phone': '+5564992686632', 'email': 'dasilvagonchoroskie@gmail.com', 'motorista': true, 'corridas': 3, 'teste': false},
        {'id': 'u2', 'name': 'Motorista Teste Automatico', 'phone': '+5564919551472', 'email': null, 'motorista': true, 'corridas': 9, 'teste': true},
      ],
    };
  }
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
      'driversPending': _comPendente ? 2 : 0,
      'latestPendingDriver': _comPendente
          ? {'id': _motoristaId, 'name': 'Evandro Da Silva gonchoroski', 'phone': '+5564992686632', 'createdAt': '2026-10-08T15:05:14.317Z'}
          : null,
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
      // Mapa da Central (todos=1): offline aparece cinza na ultima posicao.
      if (q['todos'] == '1')
        {
          'driverId': '66666666-6666-4666-8666-666666666666',
          'name': 'Carla Offline',
          'phone': '+5564955554444',
          'busy': false,
          'vehicle': 'Fiat Mobi Branco',
          'plate': 'OFF1L23',
          'category': 'CARRO',
          'distanceKm': 2.5,
          'latitude': -18.02,
          'longitude': -49.36,
          'rating': 4.7,
          'online': false,
          'lastSeenAt': DateTime.now().toUtc().subtract(const Duration(minutes: 7)).toIso8601String(),
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
    if (!_comSos) return {'items': <dynamic>[]};
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
  if (caminho == '/api/admin/wallets') {
    return {
      'minimumCents': 0,
      'blockEnabled': true,
      'items': [
        {'driverId': _motoristaId, 'name': 'Joao Batista da Silva Pereira Junior', 'phone': '+5564988887777', 'status': 'APPROVED', 'isOnline': true, 'balanceCents': 4850, 'blocking': false},
        {'driverId': '55555555-5555-4555-8555-555555555555', 'name': 'Carlos Sem Saldo', 'phone': '+5564966665555', 'status': 'APPROVED', 'isOnline': false, 'balanceCents': -320, 'blocking': true},
      ],
    };
  }
  if (caminho == '/api/admin/settings/central') {
    return {
      'central': {'whatsapp': '5564999998888', 'pixKey': 'pix@fortalezamov.com.br', 'pixHolder': 'Evandro'},
      'minimumCents': 0,
      'blockWhenInsufficient': true,
    };
  }
  if (caminho == '/api/admin/drivers/$_motoristaId/wallet') {
    final recarga = metodo == 'POST';
    return {
      'balanceCents': recarga ? 9850 : 4850,
      'minimumCents': 0,
      'blocking': false,
      'blockEnabled': true,
      'status': 'ok',
      'transactions': [
        if (recarga)
          {'id': 't0', 'type': 'ADJUSTMENT', 'kind': 'CREDIT', 'amountCents': 5000, 'balanceAfterCents': 9850, 'description': 'Recarga PIX comprovante #1234', 'rideCode': null, 'createdAt': '2026-10-03T15:00:00.000Z'},
        {'id': 't1', 'type': 'COMMISSION', 'kind': 'DEBIT', 'amountCents': -150, 'balanceAfterCents': 4850, 'description': 'Comissão da corrida', 'rideCode': 'AB12CD', 'createdAt': '2026-10-03T14:00:00.000Z'},
        {'id': 't2', 'type': 'ADJUSTMENT', 'kind': 'CREDIT', 'amountCents': 5000, 'balanceAfterCents': 5000, 'description': 'Recarga via Pix', 'rideCode': null, 'createdAt': '2026-10-03T13:00:00.000Z'},
      ],
    };
  }
  if (caminho == '/api/admin/drivers/$_motoristaId/wallet/credit') {
    return _resposta('POST', '/api/admin/drivers/$_motoristaId/wallet', q);
  }
  return null;
}

MockClient _servidor() => MockClient((http.Request r) async {
      if (r.url.path == '/api/admin/drivers/excluir') {
        final ids = [for (final i in (jsonDecode(r.body)['ids'] as List<dynamic>)) '$i'];
        _pedidosDeExclusao.addAll(ids);
        return http.Response(
          jsonEncode({
            'success': true,
            'data': {
              'excluidos': ids.length,
              'itens': [for (final i in ids) {'id': i, 'resultado': 'APAGADO', 'corridas': 0}],
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
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
    mostrarRuasNoMapa = false;
    _comSos = true;
    _comPendente = false;
    _operador = false;
    _pedidosDeExclusao.clear();
  });

  // Evandro (08/10/2026): "se eu abrir em Goiatuba e a minha sobrinha cuidar
  // de Teutonia, como fica a Central?" — a mesma Central, so a cidade dela.
  testWidgets('Casca: operador de uma cidade ve so a cidade dele e sem as abas do dono', (tester) async {
    _comSos = false;
    _operador = true;
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final painel = PainelState(PainelApi(ApiClient(client: _servidor())));
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<CentralState>(
            create: (_) => CentralState(repository: CentralRepository(client: ApiClient(client: _servidor()))),
          ),
          ChangeNotifierProvider<PainelState>.value(value: painel),
        ],
        child: MaterialApp(
          theme: CentralTheme.dark,
          locale: const Locale('pt', 'BR'),
          supportedLocales: const [Locale('pt', 'BR')],
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          home: const ShellScreen(),
        ),
      ),
    );
    await _carregar(tester);
    expect(painel.dono, isFalse);
    expect(find.text('TEUTÔNIA'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();
    for (final aba in ['Visão Geral', 'Despacho', 'Motoristas', 'Financeiro', 'Carteiras / Recargas']) {
      expect(find.text(aba), findsWidgets, reason: 'aba $aba no menu do operador');
    }
    for (final aba in ['Tarifas', 'Cupons', 'Passageiros', 'Cidades e equipe', 'Limpeza de dados', 'Configurações']) {
      expect(find.text(aba), findsNothing, reason: 'aba $aba e so do dono');
    }
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  testWidgets('Cidades e equipe: cidades, operador da cidade e nova cidade', (tester) async {
    await _abrir(tester, const CidadesEquipeTela());
    await _carregar(tester);
    expect(find.text('Goiatuba - GO'), findsOneWidget);
    expect(find.text('Teutônia - RS'), findsOneWidget);
    await tester.tap(find.text('Abrir cidade'));
    await tester.pumpAndSettle();
    expect(find.text('Abrir cidade nova'), findsOneWidget);
    await tester.tap(find.text('Abrir cidade').last);
    await tester.pumpAndSettle();
    expect(find.textContaining('Busque e toque na cidade'), findsOneWidget);
    await tester.tap(find.text('Voltar'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Sobrinha do Evandro'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Sobrinha do Evandro'), findsOneWidget);
    expect(find.textContaining('Operador · Teutônia'), findsOneWidget);
  });

  testWidgets('Limpeza de dados: resumo, apagar teste com confirmacao e contas', (tester) async {
    await _abrir(tester, const LimpezaTela());
    await _carregar(tester);
    expect(find.text('Apagar dados de teste (120)'), findsOneWidget);
    expect(find.text('Zerar a operação (começar do zero)'), findsOneWidget);
    expect(find.text('TESTE'), findsOneWidget);
    await tester.tap(find.text('Apagar dados de teste (120)'));
    await tester.pumpAndSettle();
    expect(find.text('Apagar os dados de teste?'), findsOneWidget);
    await tester.tap(find.text('Voltar'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Motorista Teste Automatico'), 200, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(find.text('Motorista Teste Automatico'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Motorista Teste Automatico'));
    await tester.pumpAndSettle();
    expect(find.text('Apagar 1 conta(s) marcada(s)'), findsOneWidget);
  });

  testWidgets('Visao Geral: indicadores em cima do mapa e toque no carro', (tester) async {
    var abriuDespacho = false;
    await _abrir(tester, VisaoGeral(abrirDespacho: () => abriuDespacho = true));
    await _carregar(tester);
    expect(find.text('Corridas ativas'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('12 / 4'), findsOneWidget);
    expect(find.textContaining('1.234,56'), findsOneWidget);
    // Online (verde) e offline (cinza, na ultima posicao).
    expect(find.byIcon(Icons.local_taxi), findsNWidgets(2));
    expect(find.byIcon(Icons.sos), findsNothing);
    expect(find.text('Offline (última posição)'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.local_taxi).first);
    await tester.pumpAndSettle();
    expect(find.text('Joao Batista da Silva'), findsOneWidget);
    expect(find.text('Livre'), findsWidgets);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.local_taxi).last);
    await tester.pumpAndSettle();
    expect(find.text('Carla Offline'), findsOneWidget);
    expect(find.textContaining('Offline · visto há 7 min'), findsOneWidget);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.person_pin_circle));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Abrir no Despacho'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Abrir no Despacho'));
    await tester.pumpAndSettle();
    expect(abriuDespacho, isTrue);
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

    await tester.ensureVisible(find.text('Bloqueados'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bloqueados'));
    await _carregar(tester);
    expect(find.text('Joao Batista da Silva Pereira Junior'), findsOneWidget);

    await tester.tap(find.text('Joao Batista da Silva Pereira Junior'));
    await _carregar(tester);
    await tester.scrollUntilVisible(find.text('CNH (frente)'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('CNH (frente)'), findsOneWidget);
    expect(find.text('Rejeitar'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Mensalidade (sem comissão)'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Modelo financeiro'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Carteira pré-paga'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('R\$'), findsWidgets);
    await tester.scrollUntilVisible(find.text('Bloquear'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Aprovar'), findsWidgets);
  });

  // Evandro (08/10/2026): "tem que ter a opcao de excluir os motoristas que
  // eu quiser" (a lista estava cheia de cadastros de teste).
  testWidgets('Motoristas: selecionar e excluir varios', (tester) async {
    await _abrir(tester, const Motoristas());
    await _carregar(tester);
    await tester.tap(find.text('Selecionar para excluir'));
    await tester.pumpAndSettle();
    expect(find.text('Toque nos motoristas que quer excluir.'), findsOneWidget);
    expect(find.byType(Checkbox), findsOneWidget);

    await tester.tap(find.text('Joao Batista da Silva Pereira Junior'));
    await tester.pumpAndSettle();
    expect(find.text('1 selecionado(s)'), findsOneWidget);
    await tester.tap(find.text('Excluir (1)'));
    await tester.pumpAndSettle();
    expect(find.text('Excluir 1 motorista?'), findsOneWidget);
    expect(find.textContaining('Não dá para desfazer'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Excluir'));
    await _carregar(tester);

    expect(_pedidosDeExclusao, [_motoristaId]);
    expect(find.textContaining('1 motorista excluído'), findsOneWidget);
    expect(find.text('Selecionar para excluir'), findsOneWidget);
  });

  testWidgets('Motoristas: excluir pelo cadastro do motorista', (tester) async {
    await _abrir(tester, const Motoristas());
    await _carregar(tester);
    await tester.tap(find.text('Joao Batista da Silva Pereira Junior'));
    await _carregar(tester);
    await tester.scrollUntilVisible(find.text('Excluir motorista'), 300, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(find.text('Excluir motorista'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Excluir motorista'));
    await tester.pumpAndSettle();
    expect(find.text('Excluir Joao Batista da Silva Pereira Junior?'), findsOneWidget);
    expect(find.textContaining('Saldo na carteira'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Excluir'));
    await _carregar(tester);
    expect(_pedidosDeExclusao, [_motoristaId]);
    // Saiu do cadastro e voltou para a lista.
    expect(find.text('Excluir motorista'), findsNothing);
    expect(find.text('Selecionar para excluir'), findsOneWidget);
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

  testWidgets('Casca: SOS abre a janela sozinho, faixa vermelha e menu lateral', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final painel = PainelState(PainelApi(ApiClient(client: _servidor())));
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<CentralState>(
            create: (_) => CentralState(repository: CentralRepository(client: ApiClient(client: _servidor()))),
          ),
          ChangeNotifierProvider<PainelState>.value(value: painel),
        ],
        child: MaterialApp(
          theme: CentralTheme.dark,
          locale: const Locale('pt', 'BR'),
          supportedLocales: const [Locale('pt', 'BR')],
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          home: const ShellScreen(),
        ),
      ),
    );
    await _carregar(tester);
    // O SOS aberto abriu a janela fixa sozinho.
    expect(find.text('Silenciar'), findsOneWidget);
    expect(find.text('190 Polícia'), findsOneWidget);
    Navigator.of(tester.element(find.text('Silenciar'))).pop();
    await tester.pumpAndSettle();
    expect(find.textContaining('pediu socorro'), findsOneWidget);
    expect(find.text('Corridas ativas'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();
    for (final aba in ['Visão Geral', 'Despacho', 'Motoristas', 'Passageiros', 'Tarifas', 'Financeiro', 'Alertas', 'Cupons', 'Carteiras / Recargas', 'Cidades e equipe', 'Limpeza de dados', 'Configurações']) {
      expect(find.text(aba), findsWidgets, reason: 'aba $aba no menu');
    }
    await tester.tap(find.text('Financeiro').last);
    await _carregar(tester);
    expect(find.text('Saques PIX'), findsOneWidget);

    // Fecha a Central: o relogio de 5 s tem de parar.
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  testWidgets('Carteiras / Recargas: lista, recarga com confirmacao e extrato', (tester) async {
    await _abrir(tester, const CarteirasTela());
    await _carregar(tester);
    expect(find.text('Regras da carteira pré-paga'), findsOneWidget);
    expect(find.text('Carlos Sem Saldo'), findsOneWidget);
    expect(find.textContaining('Sem saldo: não consegue ficar online'), findsOneWidget);
    expect(find.textContaining('48,50'), findsOneWidget);

    await tester.tap(find.text('Regras da carteira pré-paga'));
    await tester.pumpAndSettle();
    expect(find.text('Cortar chamados de quem ficar sem saldo no meio do turno'), findsOneWidget);

    await tester.ensureVisible(find.text('Joao Batista da Silva Pereira Junior'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Joao Batista da Silva Pereira Junior'));
    await _carregar(tester);
    expect(find.text('Saldo atual'), findsOneWidget);
    expect(find.text('Adicionar saldo (+)'), findsOneWidget);
    expect(find.text('Remover saldo (-)'), findsOneWidget);
    expect(find.text('Confirmar Recarga'), findsOneWidget);
    await tester.scrollUntilVisible(find.textContaining('corrida AB12CD'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Débito'), findsOneWidget);
    expect(find.textContaining('Saldo restante'), findsWidgets);

    await tester.scrollUntilVisible(find.text('Confirmar Recarga'), -300, scrollable: find.byType(Scrollable).first);
    await tester.enterText(find.widgetWithText(TextField, 'Valor (R\$)'), '50,00');
    await tester.enterText(find.widgetWithText(TextField, 'Observação'), 'Recarga PIX comprovante #1234');
    await tester.tap(find.text('Confirmar Recarga'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Saldo depois: R\$'), findsOneWidget);
    await tester.tap(find.text('Confirmar'));
    await _carregar(tester);
    expect(find.textContaining('Recarga confirmada'), findsOneWidget);
    expect(find.textContaining('98,50'), findsWidgets);
  });

  // Evandro (08/10/2026): "la na Central eu nao recebi notificacao nenhuma
  // de que tinha motorista pendente de aprovacao".
  testWidgets('Casca: motorista novo aguardando aprovacao abre aviso e leva ao cadastro', (tester) async {
    _comSos = false;
    _comPendente = true;
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final painel = PainelState(PainelApi(ApiClient(client: _servidor())));
    Future<void> abrirCasca() => tester.pumpWidget(
          MultiProvider(
            providers: [
              ChangeNotifierProvider<CentralState>(
                create: (_) => CentralState(repository: CentralRepository(client: ApiClient(client: _servidor()))),
              ),
              ChangeNotifierProvider<PainelState>.value(value: painel),
            ],
            child: MaterialApp(
              theme: CentralTheme.dark,
              locale: const Locale('pt', 'BR'),
              supportedLocales: const [Locale('pt', 'BR')],
              localizationsDelegates: GlobalMaterialLocalizations.delegates,
              home: const ShellScreen(),
            ),
          ),
        );
    await abrirCasca();
    await _carregar(tester);

    expect(find.text('Motorista aguardando aprovação'), findsOneWidget);
    expect(find.textContaining('Evandro Da Silva gonchoroski · (64) 99268-6632'), findsOneWidget);
    expect(find.textContaining('mais 1 cadastro(s) na fila'), findsOneWidget);
    expect(painel.indicadores.pendentes, 2);

    await tester.tap(find.text('Ver cadastro'));
    await _carregar(tester);
    // Abriu direto o cadastro do motorista para aprovar.
    expect(find.text('Motorista aguardando aprovação'), findsNothing);
    expect(find.text('Dados'), findsOneWidget);
    expect(painel.pendenteNovo, isNull);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('central.pendenteVisto'), _motoristaId);

    // Ja visto: na proxima consulta (5 s) o aviso nao abre de novo.
    await tester.runAsync(() => painel.atualizar());
    await tester.pumpAndSettle();
    expect(find.text('Motorista aguardando aprovação'), findsNothing);
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
