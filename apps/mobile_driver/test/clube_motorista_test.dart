// Clube de Vantagens no app do motorista (05/11/2026): lista dos parceiros
// ativos, detalhe, mapa, WhatsApp, lista vazia, erro de conexao e a
// carteirinha digital com o numero e a situacao APTO / NAO APTO do servidor.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_driver/core/api/api_client.dart';
import 'package:mobile_driver/core/fotos.dart';
import 'package:mobile_driver/core/mapa/map_provider.dart';
import 'package:mobile_driver/screens/clube_screen.dart';
import 'package:mobile_driver/screens/menu_screen.dart';
import 'package:mobile_driver/state/driver_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _id = '77777777-0000-4000-8000-000000000000';

/// Parceiros que o servidor de mentira devolve (so os ativos, como o real).
List<Map<String, dynamic>> _parceiros = [];
bool _fora = false;

/// Situacao que o servidor de mentira devolve na carteirinha.
bool _apto = true;
final _links = <String>[];

Map<String, dynamic> _parceiro({String nome = 'Parceiro de Teste', String? whatsapp = '5585999990000'}) => {
      'id': _id,
      'nome': nome,
      'categoria': 'Oficina mecânica',
      'descricao': 'Descrição de teste',
      'endereco': 'Rua de Teste, 100 - Centro, Fortaleza - CE',
      'latitude': null,
      'longitude': null,
      'telefone': '558533334444',
      'whatsapp': whatsapp,
      'horario': 'Seg a sex, 8h às 18h',
      'vantagens': 'Condição especial de teste',
      'condicoes': 'Apresentar a identificação digital',
      'logoUrl': null,
      'beneficios': [
        {'titulo': 'Benefício de teste', 'descricao': '', 'condicoes': 'Uma vez por mês'},
      ],
    };

MockClient _servidor() => MockClient((http.Request r) async {
      if (_fora) return http.Response('fora do ar', 503);
      Object? d;
      if (r.url.path == '/api/clube/parceiros') d = _parceiros;
      if (r.url.path == '/api/clube/parceiros/$_id') d = _parceiros.isEmpty ? null : _parceiros.first;
      if (r.url.path == '/api/clube/carteirinha') {
        d = {
          'nome': 'Motorista de Teste',
          'fotoUrl': _apto ? '/arquivos/foto-perfil' : null,
          'codigo': 'FM-1A2B3C4D',
          'situacao': _apto ? 'APTO' : 'NAO_APTO',
          'situacaoTexto': _apto ? 'APTO' : 'NÃO APTO',
          'motivo': _apto ? 'R\$ 100,00 ou mais em recargas nos últimos 30 dias.' : 'Menos de R\$ 100,00 em recargas nos últimos 30 dias.',
          'atualizadoEm': '2026-11-01T13:00:00.000Z',
          'validoAte': _apto ? '2026-12-01T13:00:00.000Z' : null,
          'conferidoEm': '2026-11-05T18:00:00.000Z',
        };
      }
      return http.Response(
        jsonEncode(d == null ? {'success': false, 'error': {'code': 'NOT_FOUND', 'message': 'Este parceiro não está mais no clube.'}} : {'success': true, 'data': d}),
        d == null ? 404 : 200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

Future<void> _esperar(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _abrir(WidgetTester tester, Widget tela) async {
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
        home: tela,
      ),
    ),
  );
  await _esperar(tester);
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'ride.accessToken': 'token-de-teste'});
    _parceiros = [_parceiro()];
    _fora = false;
    _apto = true;
    _links.clear();
    abrirLink = (url) async {
      _links.add(url);
      return true;
    };
  });

  testWidgets('Menu tem o Clube de Vantagens', (tester) async {
    await _abrir(tester, const MenuScreen());
    await tester.scrollUntilVisible(find.text('Clube de Vantagens'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Clube de Vantagens'), findsOneWidget);
  });

  testWidgets('Lista os parceiros ativos com vantagens, endereco, mapa e WhatsApp', (tester) async {
    await _abrir(tester, const ClubeScreen());
    expect(find.text('Parceiro de Teste'), findsOneWidget);
    expect(find.text('Oficina mecânica'), findsOneWidget);
    expect(find.text('Condição especial de teste'), findsOneWidget);
    expect(find.text('Rua de Teste, 100 - Centro, Fortaleza - CE'), findsOneWidget);
    expect(find.textContaining('Apresentar a identificação digital'), findsOneWidget);

    await tester.tap(find.text('Ver no mapa'));
    await _esperar(tester);
    expect(_links.single, 'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent('Rua de Teste, 100 - Centro, Fortaleza - CE')}');

    await tester.tap(find.text('WhatsApp'));
    await _esperar(tester);
    expect(_links.last, startsWith('https://wa.me/5585999990000?text='));
    expect(tester.takeException(), isNull);
  });

  testWidgets('Sem WhatsApp o botao nao aparece; detalhe mostra beneficios e liga', (tester) async {
    _parceiros = [_parceiro(whatsapp: null)];
    await _abrir(tester, const ClubeScreen());
    expect(find.text('WhatsApp'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('parceiro-$_id')));
    await _esperar(tester);
    expect(find.text('Vantagens para você'), findsOneWidget);
    expect(find.text('Benefício de teste'), findsOneWidget);
    expect(find.text('Seg a sex, 8h às 18h'), findsOneWidget);
    expect(find.text('(85) 3333-4444'), findsOneWidget);
    expect(find.text('Chamar no WhatsApp'), findsNothing);
    await tester.scrollUntilVisible(find.text('Ligar'), 200, scrollable: find.byType(Scrollable).last);
    await tester.pump(const Duration(milliseconds: 100));
    await tester.tap(find.text('Ligar'));
    await _esperar(tester);
    expect(_links.last, 'tel:+558533334444');
    expect(tester.takeException(), isNull);
  });

  testWidgets('Mudanca da Central aparece ao abrir de novo; parceiro desativado some', (tester) async {
    await _abrir(tester, const ClubeScreen());
    expect(find.text('Parceiro de Teste'), findsOneWidget);
    // A Central mudou o nome: o servidor ja devolve o novo.
    _parceiros = [_parceiro(nome: 'Nome Novo da Central')];
    await _abrir(tester, const ClubeScreen(key: ValueKey('de-novo')));
    expect(find.text('Nome Novo da Central'), findsOneWidget);
    // A Central desativou: o servidor nao devolve mais e o detalhe avisa.
    _parceiros = [];
    await _abrir(tester, const ClubeScreen(key: ValueKey('mais-uma')));
    expect(find.text('Ainda não há parceiros no clube'), findsOneWidget);
  });

  testWidgets('Sem parceiros mostra o aviso e a identificacao continua', (tester) async {
    _parceiros = [];
    await _abrir(tester, const ClubeScreen());
    expect(find.text('Ainda não há parceiros no clube'), findsOneWidget);
    expect(find.text('Minha identificação'), findsOneWidget);
  });

  testWidgets('Sem conexao mostra o erro e tenta de novo', (tester) async {
    _fora = true;
    await _abrir(tester, const ClubeScreen());
    expect(find.textContaining('Não foi possível carregar o clube'), findsOneWidget);
    _fora = false;
    await tester.tap(find.text('Tentar de novo'));
    await _esperar(tester);
    expect(find.text('Parceiro de Teste'), findsOneWidget);
  });

  testWidgets('Carteirinha APTO: nome, numero, logotipo, situacao e datas do servidor', (tester) async {
    await _abrir(tester, const CarteirinhaScreen());
    expect(find.text('Motorista de Teste'), findsOneWidget);
    expect(find.text('MOTORISTA PARCEIRO'), findsOneWidget);
    expect(tester.widget<SelectableText>(find.byKey(const ValueKey('codigo-carteirinha'))).data, 'FM-1A2B3C4D');
    expect(tester.widget<Text>(find.byKey(const ValueKey('situacao-carteirinha'))).data, 'APTO');
    expect(find.textContaining('Vale até'), findsOneWidget);
    expect(find.textContaining('Situação atualizada em'), findsOneWidget);
    expect((tester.widget<Container>(find.byKey(const ValueKey('selo-carteirinha'))).decoration! as BoxDecoration).color, const Color(0xFF1E9E5A));
    expect(find.byType(Image), findsWidgets);
    // Foto do perfil na carteirinha (a mesma do cadastro).
    final foto = tester.widget<FotoDoServidor>(find.descendant(of: find.byKey(const ValueKey('foto-carteirinha')), matching: find.byType(FotoDoServidor)));
    expect(foto.caminho, '/arquivos/foto-perfil');
    expect(find.text('Clube de Vantagens'), findsOneWidget);
    // Sem QR Code, sem campo para editar e sem telefone ou CPF.
    expect(find.textContaining('QR'), findsNothing);
    expect(find.byType(TextField), findsNothing);
    expect(find.textContaining('CPF'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Carteirinha NAO APTO: mostra o motivo e como voltar a ficar apto', (tester) async {
    _apto = false;
    await _abrir(tester, const CarteirinhaScreen());
    expect(tester.widget<Text>(find.byKey(const ValueKey('situacao-carteirinha'))).data, 'NÃO APTO');
    expect((tester.widget<Container>(find.byKey(const ValueKey('selo-carteirinha'))).decoration! as BoxDecoration).color, const Color(0xFFF0545A));
    expect(find.textContaining('Menos de R\$ 100,00'), findsOneWidget);
    // Sem foto no perfil: as iniciais no lugar.
    expect(find.descendant(of: find.byKey(const ValueKey('foto-carteirinha')), matching: find.text('MD')), findsOneWidget);
    expect(find.textContaining('Vale até'), findsNothing);
    await tester.scrollUntilVisible(find.textContaining('continua rodando normalmente'), 200,
        scrollable: find.descendant(of: find.byType(ListView), matching: find.byType(Scrollable)).first);
    expect(find.textContaining('continua rodando normalmente'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Identificacao sem conexao mostra o erro', (tester) async {
    _fora = true;
    await _abrir(tester, const CarteirinhaScreen());
    expect(find.textContaining('Não foi possível carregar a identificação'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
