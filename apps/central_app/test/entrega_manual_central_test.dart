// Central lanca entrega manual (Evandro, 13/11/2026): busca a loja, confere,
// digita encomenda e destino, escolhe o veiculo com o preco oficial do servidor
// e lanca. O aplicativo nao calcula preco: tudo vem do servidor.

import 'dart:convert';

import 'package:central_app/core/api/api_client.dart';
import 'package:central_app/core/theme/central_theme.dart';
import 'package:central_app/data/painel.dart';
import 'package:central_app/painel/entrega_manual_central.dart';
import 'package:central_app/painel/painel_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

final List<(String, Map<String, dynamic>?)> pedidos = [];

MockClient _servidor({bool lojaAprovada = true}) => MockClient((r) async {
      final corpo = r.body.isEmpty ? null : jsonDecode(r.body) as Map<String, dynamic>;
      pedidos.add(('${r.method} ${r.url.path}', corpo));
      dynamic dados = <String, dynamic>{};
      switch ('${r.method} ${r.url.path}') {
        case 'POST /api/admin/manual-deliveries/buscar':
          dados = {
            'liberado': true,
            'itens': [
              {
                'id': 'loja-1',
                'nomeFantasia': 'Padaria Estrela',
                'endereco': 'Rua das Flores, 120, Centro',
                'cidade': 'Goiatuba',
                'telefoneFinal': '…1234',
                'situacaoRotulo': lojaAprovada ? 'Aprovado' : 'Aguardando aprovação',
                'podeLancar': lojaAprovada,
                'motivo': lojaAprovada ? null : 'Este estabelecimento ainda está aguardando aprovação da Central.',
              },
            ],
          };
        case 'GET /api/admin/manual-deliveries/estabelecimentos/loja-1':
          dados = {
            'id': 'loja-1',
            'nomeFantasia': 'Padaria Estrela',
            'razaoSocial': 'Estrela LTDA',
            'cnpj': '11.222.333/****-**',
            'telefone': '+5564999991234',
            'enderecoDeRetirada': 'Rua das Flores, 120 - Centro, Goiatuba - GO',
            'cidade': 'Goiatuba',
            'uf': 'GO',
            'situacaoRotulo': lojaAprovada ? 'Aprovado' : 'Aguardando aprovação',
            'podeLancar': lojaAprovada,
            'motivo': lojaAprovada ? null : 'Este estabelecimento ainda está aguardando aprovação da Central.',
            'entregasConcluidas': 7,
            'historico': [],
          };
        case 'GET /api/geo/search':
          dados = [
            {'address': 'Rua Verde, 55', 'detail': 'Jardim, Goiatuba', 'latitude': -18.02, 'longitude': -49.35},
          ];
        case 'POST /api/admin/manual-deliveries/cotar':
          dados = {
            'coleta': {'endereco': 'Rua das Flores, 120', 'alternativa': false},
            'entrega': {'endereco': 'Rua Verde, 55'},
            'totalDeEntregas': 1,
            'distanciaMetros': 2300,
            'duracaoSegundos': 420,
            'opcoes': [
              {'veiculo': 'MOTO', 'nome': 'Moto', 'valorCents': 700},
              {'veiculo': 'CARRO', 'nome': 'Carro', 'valorCents': 1200},
            ],
            'cotacao': 'medida-assinada',
          };
        case 'POST /api/admin/manual-deliveries/avulsa/cotar':
          dados = {
            'coleta': {'endereco': 'Av. Brasil, 300, Centro, Goiatuba/GO', 'alternativa': false},
            'entrega': {'endereco': 'Rua Verde, 55'},
            'totalDeEntregas': 1,
            'distanciaMetros': 1800,
            'duracaoSegundos': 360,
            'opcoes': [
              {'veiculo': 'MOTO', 'nome': 'Moto', 'valorCents': 650},
              {'veiculo': 'CARRO', 'nome': 'Carro', 'valorCents': 1100},
            ],
            'cotacao': 'medida-avulsa',
          };
        case 'POST /api/admin/manual-deliveries/avulsa':
          dados = {'rideId': 'r2', 'codigo': 'FM456', 'repetido': false};
        case 'POST /api/admin/manual-deliveries':
          dados = {'rideId': 'r1', 'codigo': 'FM123', 'repetido': false};
      }
      return http.Response(jsonEncode({'success': true, 'data': dados}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });

Future<void> _abrir(WidgetTester tester, MockClient servidor) async {
  tester.view.physicalSize = const Size(1080, 7200);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ChangeNotifierProvider<PainelState>.value(
      value: PainelState(PainelApi(ApiClient(client: servidor))),
      child: MaterialApp(
        theme: CentralTheme.light,
        locale: const Locale('pt', 'BR'),
        supportedLocales: const [Locale('pt', 'BR')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: const EntregaManualCentralTela(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _escrever(WidgetTester tester, String rotulo, String texto) async {
  final campo = find.widgetWithText(TextField, rotulo);
  await tester.ensureVisible(campo);
  await tester.pumpAndSettle();
  await tester.enterText(campo, texto);
}

Future<void> _tocar(WidgetTester tester, Finder alvo) async {
  await tester.ensureVisible(alvo);
  await tester.pumpAndSettle();
  await tester.tap(alvo);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    pedidos.clear();
  });

  testWidgets('busca curta nao vai ao servidor', (tester) async {
    await _abrir(tester, _servidor());
    await _escrever(tester, 'Telefone, e-mail ou nome do estabelecimento', 'ab');
    await _tocar(tester, find.text('Procurar estabelecimento'));
    expect(find.textContaining('ao menos 3'), findsOneWidget);
    expect(pedidos, isEmpty);
  });

  testWidgets('loja que nao pode receber entrega: mostra o motivo e nao deixa seguir', (tester) async {
    await _abrir(tester, _servidor(lojaAprovada: false));
    await _escrever(tester, 'Telefone, e-mail ou nome do estabelecimento', 'padaria');
    await _tocar(tester, find.text('Procurar estabelecimento'));
    await _tocar(tester, find.text('Padaria Estrela'));
    expect(find.textContaining('aguardando aprovação'), findsWidgets);
    expect(find.text('Confirmar este estabelecimento'), findsNothing);
  });

  testWidgets('fluxo completo: loja, dados, preco oficial por veiculo e lancamento (despacho automatico)', (tester) async {
    await _abrir(tester, _servidor());
    await _escrever(tester, 'Telefone, e-mail ou nome do estabelecimento', 'padaria');
    await _tocar(tester, find.text('Procurar estabelecimento'));
    await _tocar(tester, find.text('Padaria Estrela'));
    expect(find.text('Entregas concluídas'), findsOneWidget);
    await _tocar(tester, find.text('Confirmar este estabelecimento'));

    // Sem confirmar no mapa nao segue.
    await _escrever(tester, 'O que vai levar (ex.: 2 pizzas grandes)', '2 caixas de bolo');
    await _tocar(tester, find.text('Ver o preço'));
    expect(find.textContaining('nome de quem recebe'), findsOneWidget);
    expect(pedidos.where((p) => p.$1.endsWith('/cotar')), isEmpty);

    await _escrever(tester, 'Nome de quem recebe', 'Ana Lima');
    await _escrever(tester, 'Telefone de quem recebe (com DDD)', '64988887777');
    await _escrever(tester, 'Rua / avenida', 'Rua Verde');
    await _escrever(tester, 'Número', '55');
    await _escrever(tester, 'Bairro', 'Jardim');
    await _escrever(tester, 'CEP', '75600111');
    await _tocar(tester, find.byKey(const Key('confirmar-no-mapa')));
    await _tocar(tester, find.text('Rua Verde, 55'));
    expect(find.text('Endereço confirmado no mapa.'), findsOneWidget);

    await _tocar(tester, find.text('Ver o preço'));
    final cotar = pedidos.firstWhere((p) => p.$1 == 'POST /api/admin/manual-deliveries/cotar').$2!;
    expect(cotar['comercioId'], 'loja-1');
    expect(cotar.containsKey('veiculo'), isFalse);

    // O preco vem do servidor, um por veiculo.
    expect(find.textContaining('Moto · R\$'), findsOneWidget);
    expect(find.textContaining('Carro · R\$'), findsOneWidget);
    await _tocar(tester, find.byKey(const Key('veiculo-CARRO')));
    expect(find.textContaining('12,00'), findsWidgets);

    await _tocar(tester, find.text('Confirmar o preço e lançar a entrega'));
    final lancar = pedidos.lastWhere((p) => p.$1 == 'POST /api/admin/manual-deliveries').$2!;
    expect(lancar['comercioId'], 'loja-1');
    expect(lancar['veiculo'], 'CARRO');
    expect(lancar['valorEsperadoCents'], 1200);
    expect(lancar['cotacao'], 'medida-assinada');
    expect(lancar['chave'], matches(RegExp(r'^[A-Za-z0-9_-]{16,64}$')));
    expect(lancar.containsKey('motoristaId'), isFalse); // automatico
    expect((lancar['destino'] as Map)['cep'], '75600111');
    expect((lancar['destinatario'] as Map)['telefone'], '64988887777');
  });

  testWidgets('estabelecimento NAO cadastrado: digita nome, telefone e coleta (no mapa) e lanca sem loja', (tester) async {
    await _abrir(tester, _servidor());
    await _tocar(tester, find.byKey(const Key('entrega-avulsa')));
    expect(find.text('Estabelecimento não cadastrado'), findsWidgets);

    // Sem dados ou sem confirmar a coleta no mapa nao segue.
    await _tocar(tester, find.text('Continuar'));
    expect(find.textContaining('nome do estabelecimento'), findsOneWidget);
    await _escrever(tester, 'Nome do estabelecimento', 'Lanchonete do Zé');
    await _escrever(tester, 'Telefone do estabelecimento (com DDD)', '(64) 99111-2233');
    await _escrever(tester, 'Rua / avenida', 'Av. Brasil');
    await _escrever(tester, 'Número', '300');
    await _escrever(tester, 'Bairro', 'Centro');
    await _escrever(tester, 'Cidade', 'Goiatuba');
    await _escrever(tester, 'UF', 'go');
    await _tocar(tester, find.text('Continuar'));
    expect(find.textContaining('Confirmar coleta no mapa'), findsWidgets);
    expect(find.text('O que vai levar (ex.: 2 pizzas grandes)'), findsNothing);

    await _tocar(tester, find.byKey(const Key('confirmar-coleta-no-mapa')));
    await _tocar(tester, find.text('Rua Verde, 55'));
    expect(find.text('Coleta confirmada no mapa.'), findsOneWidget);
    await _tocar(tester, find.text('Continuar'));

    // Segue como o pedido de loja: encomenda, quem recebe, destino (cidade ja adiantada).
    expect(find.textContaining('Retirada em: Av. Brasil, 300, Centro, Goiatuba/GO'), findsOneWidget);
    await _escrever(tester, 'O que vai levar (ex.: 2 pizzas grandes)', '3 marmitas');
    await _escrever(tester, 'Nome de quem recebe', 'Ana Lima');
    await _escrever(tester, 'Telefone de quem recebe (com DDD)', '64988887777');
    await _escrever(tester, 'Rua / avenida', 'Rua Verde');
    await _escrever(tester, 'Número', '55');
    await _escrever(tester, 'Bairro', 'Jardim');
    await _escrever(tester, 'CEP', '75600111');
    await _tocar(tester, find.byKey(const Key('confirmar-no-mapa')));
    await _tocar(tester, find.text('Rua Verde, 55'));
    await _tocar(tester, find.text('Ver o preço'));

    final cotar = pedidos.firstWhere((p) => p.$1 == 'POST /api/admin/manual-deliveries/avulsa/cotar').$2!;
    expect(cotar.containsKey('comercioId'), isFalse);
    final est = cotar['estabelecimento'] as Map;
    expect(est['nome'], 'Lanchonete do Zé');
    expect(est['telefone'], '64991112233');
    expect((est['coleta'] as Map)['address'], 'Av. Brasil, 300, Centro, Goiatuba/GO');
    expect((est['coleta'] as Map)['latitude'], -18.02);
    expect((cotar['destino'] as Map)['uf'], 'GO');

    expect(find.textContaining('Lanchonete do Zé (sem cadastro)'), findsOneWidget);
    expect(find.textContaining('Moto · R\$'), findsOneWidget);
    await _tocar(tester, find.text('Confirmar o preço e lançar a entrega'));
    final lancar = pedidos.lastWhere((p) => p.$1 == 'POST /api/admin/manual-deliveries/avulsa').$2!;
    expect(lancar['veiculo'], 'MOTO');
    expect(lancar['valorEsperadoCents'], 650);
    expect(lancar['cotacao'], 'medida-avulsa');
    expect(lancar['chave'], matches(RegExp(r'^[A-Za-z0-9_-]{16,64}$')));
    expect(lancar.containsKey('comercioId'), isFalse);
    // Nunca procurou nem leu loja cadastrada, e nao usou o caminho de loja.
    expect(pedidos.where((p) => p.$1.endsWith('/buscar') || p.$1.contains('/estabelecimentos/')), isEmpty);
    expect(pedidos.where((p) => p.$1 == 'POST /api/admin/manual-deliveries'), isEmpty);
  });
}
