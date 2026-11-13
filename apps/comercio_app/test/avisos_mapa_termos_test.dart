import 'package:comercio_app/app.dart';
import 'package:comercio_app/core/alarme.dart';
import 'package:comercio_app/core/api.dart';
import 'package:comercio_app/core/armazenamento.dart';
import 'package:comercio_app/dados/modelos.dart';
import 'package:comercio_app/estado/sessao.dart';
import 'package:comercio_app/telas/entrega_tela.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';

import 'falsos.dart';

Sessao sessaoCom(ServidorFalso servidor, {bool logado = true, Estabelecimento? loja}) {
  servidor.loja ??= loja; // o servidor falso responde com a mesma loja da sessao
  final s = Sessao(api: ApiClient(), servidor: servidor);
  s.iniciando = false;
  s.termosAceitosVersao = 'teste';
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
  await tester.pumpWidget(const SizedBox());
}

Future<void> tocar(WidgetTester tester, String texto) async {
  final alvo = find.text(texto).first;
  await tester.ensureVisible(alvo);
  await tester.tap(alvo);
  await tester.pumpAndSettle();
}

Aviso aviso(String id, String titulo, {String tipo = 'comercio-entrega', bool lido = false, String? rideId}) =>
    Aviso(id: id, titulo: titulo, texto: 'Texto de $titulo', tipo: tipo, criadoEm: DateTime(2026, 11, 12, 15, 30), lido: lido, rideId: rideId);

const _mapaCompleto = MapaDaEntrega(
  coleta: PontoDoMapa(-18.0, -49.3),
  entrega: PontoDoMapa(-18.02, -49.36),
  motorista: MotoristaNoMapa(-18.01, -49.35, atualizadaEm: null),
);

Entrega _comMapa(MapaDaEntrega? mapa, {String etapa = 'A_CAMINHO_DA_COLETA', String? motorista = 'João'}) =>
    entregaDeTeste(etapa: etapa, mapa: mapa, motoristaNome: motorista);

void main() {
  setUp(() {
    Armazenamento.atual = ArmazenamentoEmMemoria();
  });

  group('Modelos: mapa, avisos e imagens', () {
    test('MapaDaEntrega ignora ponto sem latitude/longitude válidas (nunca inventa)', () {
      final m = MapaDaEntrega.fromJson({
        'coleta': {'latitude': -18.0, 'longitude': -49.3},
        'entrega': {'latitude': 91.0, 'longitude': -49.3},
        'motorista': {'latitude': null, 'longitude': -49.3},
      });
      expect(m.coleta, isNotNull);
      expect(m.entrega, isNull);
      expect(m.motorista, isNull);
      expect(MapaDaEntrega.fromJson(null).vazio, isTrue);
    });

    test('Motorista com sinal velho vem marcado como desatualizado', () {
      final m = MapaDaEntrega.fromJson({
        'motorista': {'latitude': -18.0, 'longitude': -49.3, 'atualizadaEm': '2026-11-12T15:00:00.000Z', 'desatualizada': true},
      });
      expect(m.motorista!.desatualizada, isTrue);
      expect(m.motorista!.atualizadaEm, isNotNull);
    });

    test('ConfigDoMapa só aceita endereço https com {z}/{x}/{y}', () {
      expect(ConfigDoMapa.tentar({'tiles': 'http://x/{z}/{x}/{y}.png'}), isNull);
      expect(ConfigDoMapa.tentar({'tiles': 'https://x/{z}/{x}.png'}), isNull);
      expect(ConfigDoMapa.tentar({'tiles': 'https://x/a b/{z}/{x}/{y}.png'}), isNull);
      expect(ConfigDoMapa.tentar(null), isNull);
      final ok = ConfigDoMapa.tentar({'tiles': 'https://mapa.exemplo/{z}/{x}/{y}.png', 'maxZoom': 22, 'tamanho': 256});
      expect(ok, isNotNull);
      expect(ok!.tamanho, 256);
      expect(ok.atribuicao, '© TomTom');
    });

    test('Caixa de avisos mostra só os do Comércio e conta os não lidos', () {
      final c = CaixaDeAvisos.fromJson({
        'itens': [
          {'id': 'a', 'titulo': 'Entrega aceita', 'texto': 't', 'tipo': 'comercio-entrega', 'criadaEm': '2026-11-12T15:00:00.000Z', 'lida': false, 'rideId': 'r1'},
          {'id': 'b', 'titulo': 'Promoção de corrida', 'texto': 't', 'tipo': 'aviso-central', 'criadaEm': '2026-11-12T15:00:00.000Z', 'lida': false},
          {'id': 'c', 'titulo': 'Cadastro aprovado', 'texto': 't', 'tipo': 'comercio-decisao', 'criadaEm': '2026-11-12T15:00:00.000Z', 'lida': true},
          {'id': '', 'titulo': 'sem id', 'tipo': 'comercio-entrega'},
        ],
      });
      expect(c.itens.map((a) => a.id), ['a', 'c']);
      expect(c.naoLidos, 1);
      expect(c.itens.first.rideId, 'r1');
    });
  });

  group('Sessão: imagens do mapa', () {
    test('o endereço fica só em memória, é reaproveitado e some ao sair', () async {
      final servidor = ServidorFalso()..mapaConfig = ConfigDoMapa.tentar({'tiles': 'https://mapa.exemplo/{z}/{x}/{y}.png'});
      final s = sessaoCom(servidor, loja: estabelecimento());
      expect(await s.configDoMapa(), isNotNull);
      expect(await s.configDoMapa(), isNotNull);
      expect(servidor.consultasDeMapa, 1); // a segunda veio da memória
      await s.sair();
      servidor.mapaConfig = null;
      expect(await s.configDoMapa(), isNull); // o endereço antigo (com a chave) saiu do app
      expect(servidor.consultasDeMapa, 2);
    });
  });

  group('Sino de avisos', () {
    testWidgets('mostra quantos avisos não foram lidos', (tester) async {
      final servidor = ServidorFalso()..caixa = CaixaDeAvisos(itens: [aviso('a', 'Entrega aceita'), aviso('b', 'Cadastro aprovado', tipo: 'comercio-decisao'), aviso('c', 'Velho', lido: true)]);
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      expect(find.text('2'), findsOneWidget);
      expect(servidor.consultasDeAvisos, greaterThan(0));
      await fechar(tester);
    });

    testWidgets('sem avisos: nenhum número e a tela diz que está vazio', (tester) async {
      final servidor = ServidorFalso();
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      expect(find.byType(Badge), findsOneWidget);
      await tester.tap(find.byIcon(Icons.notifications_outlined));
      await tester.pumpAndSettle();
      expect(find.text('Nenhum aviso ainda'), findsOneWidget);
      await fechar(tester);
    });

    testWidgets('tocar num aviso marca como lido no servidor; aviso de entrega abre o acompanhamento', (tester) async {
      final servidor = ServidorFalso()..caixa = CaixaDeAvisos(itens: [aviso('a', 'Entrega aceita', rideId: 'r1')]);
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      await tester.tap(find.byIcon(Icons.notifications_outlined));
      await tester.pumpAndSettle();
      expect(find.text('Entrega aceita'), findsOneWidget);
      await tester.tap(find.text('Entrega aceita'));
      await tester.pumpAndSettle();
      expect(servidor.avisosLidos, ['a']);
      expect(find.text('Entrega FM100'), findsOneWidget);
      await fechar(tester);
    });

    testWidgets('marcar todos como lidos manda só os ids dos avisos do Comércio', (tester) async {
      final servidor = ServidorFalso()..caixa = CaixaDeAvisos(itens: [aviso('a', 'Um'), aviso('b', 'Dois'), aviso('c', 'Três', lido: true)]);
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      await tester.tap(find.byIcon(Icons.notifications_outlined));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.done_all));
      await tester.pumpAndSettle();
      expect(servidor.avisosLidos, ['a', 'b']);
      await fechar(tester);
    });

    testWidgets('motorista chegou à loja (aviso novo e não lido): alarma uma vez por entrega; aviso velho não alarma', (tester) async {
      Alarme.tocados.clear();
      final novo = Aviso(id: 'n', titulo: 'Motorista chegou à loja', texto: 't', tipo: 'comercio-entrega', criadoEm: DateTime.now(), lido: false, rideId: 'r-chegou');
      final velho = Aviso(id: 'v', titulo: 'Motorista chegou à loja', texto: 't', tipo: 'comercio-entrega', criadoEm: DateTime(2026, 11, 12, 15, 30), lido: false, rideId: 'r-velho');
      final servidor = ServidorFalso()..caixa = CaixaDeAvisos(itens: [novo, velho]);
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      expect(Alarme.tocados, ['r-chegou']);
      await fechar(tester);
    });

    testWidgets('apagar todos pede confirmação antes', (tester) async {
      final servidor = ServidorFalso()..caixa = CaixaDeAvisos(itens: [aviso('a', 'Um')]);
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      await tester.tap(find.byIcon(Icons.notifications_outlined));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.delete_outline));
      await tester.pumpAndSettle();
      expect(find.text('Apagar todos os avisos?'), findsOneWidget);
      expect(servidor.avisosApagados, isEmpty);
      await tocar(tester, 'Manter');
      expect(servidor.avisosApagados, isEmpty);
      await tester.tap(find.byIcon(Icons.delete_outline));
      await tester.pumpAndSettle();
      await tocar(tester, 'Apagar');
      expect(servidor.avisosApagados, ['a']);
      await fechar(tester);
    });

    testWidgets('sem rede: o sino não quebra e a tela de avisos oferece tentar de novo', (tester) async {
      final servidor = ServidorFalso()..erroNosAvisos = ApiException('NETWORK_ERROR', 'Sem conexão com o servidor.');
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
      expect(find.byType(Badge), findsOneWidget);
      await tester.tap(find.byIcon(Icons.notifications_outlined));
      await tester.pumpAndSettle();
      expect(find.text('Não foi possível carregar'), findsOneWidget);
      expect(find.text('Tentar de novo'), findsOneWidget);
      servidor
        ..erroNosAvisos = null
        ..caixa = CaixaDeAvisos(itens: [aviso('a', 'Voltou')]);
      await tocar(tester, 'Tentar de novo');
      expect(find.text('Voltou'), findsOneWidget);
      await fechar(tester);
    });

    testWidgets('aguardando aprovação também tem o sino (a decisão da Central chega por ele)', (tester) async {
      final servidor = ServidorFalso()..caixa = CaixaDeAvisos(itens: [aviso('a', 'Cadastro aprovado', tipo: 'comercio-decisao')]);
      await abrir(tester, sessaoCom(servidor, loja: estabelecimento(situacao: Situacao.aguardando)));
      expect(find.byIcon(Icons.notifications_outlined), findsOneWidget);
      expect(find.text('1'), findsOneWidget);
      await fechar(tester);
    });
  });

  group('Mapa do acompanhamento', () {
    testWidgets('com motorista a caminho: mostra o mapa com os três pontos e a hora do sinal', (tester) async {
      final servidor = ServidorFalso()..entregaFixa = _comMapa(_mapaCompleto);
      await _abrirAcompanhamento(tester, servidor);
      expect(find.byType(FlutterMap), findsOneWidget);
      expect(find.byType(MarkerLayer), findsOneWidget);
      expect(find.byKey(const ValueKey('pino-coleta')), findsOneWidget);
      expect(find.byKey(const ValueKey('pino-entrega')), findsOneWidget);
      expect(find.byKey(const ValueKey('pino-motorista')), findsOneWidget);
      expect(find.text('Posição do motorista em tempo real.'), findsOneWidget);
      // sem imagens de rua: avisa, mas os pontos continuam
      expect(find.textContaining('As ruas do mapa não estão disponíveis'), findsOneWidget);
      // mapa grande + botao para abrir em tela cheia
      expect(find.byKey(const Key('ampliar-mapa')), findsOneWidget);
      await fechar(tester);
    });

    testWidgets('com imagens do mapa: mostra a camada de ruas e a atribuição', (tester) async {
      final servidor = ServidorFalso()
        ..entregaFixa = _comMapa(_mapaCompleto)
        ..mapaConfig = ConfigDoMapa.tentar({'tiles': 'https://mapa.exemplo/{z}/{x}/{y}.png', 'atribuicao': '© Mapa de Teste'});
      await _abrirAcompanhamento(tester, servidor);
      expect(find.byType(TileLayer), findsOneWidget);
      expect(find.text('© Mapa de Teste'), findsOneWidget);
      expect(find.textContaining('As ruas do mapa não estão disponíveis'), findsNothing);
      await fechar(tester);
    });

    testWidgets('sinal velho do motorista: avisa que a posição pode estar desatualizada', (tester) async {
      final velho = MapaDaEntrega(
        coleta: const PontoDoMapa(-18.0, -49.3),
        entrega: const PontoDoMapa(-18.02, -49.36),
        motorista: MotoristaNoMapa(-18.01, -49.35, atualizadaEm: DateTime(2026, 11, 12, 14, 5), desatualizada: true),
      );
      final servidor = ServidorFalso()..entregaFixa = _comMapa(velho);
      await _abrirAcompanhamento(tester, servidor);
      expect(find.textContaining('Sem sinal novo do motorista desde 14:05'), findsOneWidget);
      expect(find.text('Posição do motorista em tempo real.'), findsNothing);
      await fechar(tester);
    });

    testWidgets('motorista aceitou mas o aparelho não manda localização: explica e não desenha motorista', (tester) async {
      const semMotorista = MapaDaEntrega(coleta: PontoDoMapa(-18.0, -49.3), entrega: PontoDoMapa(-18.02, -49.36));
      final servidor = ServidorFalso()..entregaFixa = _comMapa(semMotorista);
      await _abrirAcompanhamento(tester, servidor);
      expect(find.byType(FlutterMap), findsOneWidget);
      expect(find.byKey(const ValueKey('pino-motorista')), findsNothing);
      expect(find.textContaining('não está enviando a localização'), findsOneWidget);
      await fechar(tester);
    });

    testWidgets('ainda sem motorista: só loja e destino, sem texto de falta de sinal', (tester) async {
      const semMotorista = MapaDaEntrega(coleta: PontoDoMapa(-18.0, -49.3), entrega: PontoDoMapa(-18.02, -49.36));
      final servidor = ServidorFalso()..entregaFixa = _comMapa(semMotorista, etapa: 'AGUARDANDO_MOTORISTA', motorista: null);
      await _abrirAcompanhamento(tester, servidor);
      expect(find.byType(FlutterMap), findsOneWidget);
      expect(find.textContaining('não está enviando a localização'), findsNothing);
      await fechar(tester);
    });

    testWidgets('mapa vazio (servidor não mandou nenhum ponto) mostra aviso em vez de um mapa falso', (tester) async {
      final servidor = ServidorFalso()..entregaFixa = _comMapa(const MapaDaEntrega());
      await _abrirAcompanhamento(tester, servidor);
      expect(find.byType(FlutterMap), findsNothing);
      await fechar(tester);
    });

    testWidgets('entrega encerrada não mostra mapa nem posição', (tester) async {
      final servidor = ServidorFalso()..entregaFixa = _comMapa(_mapaCompleto, etapa: 'ENTREGUE');
      await _abrirAcompanhamento(tester, servidor);
      expect(find.byType(FlutterMap), findsNothing);
      await fechar(tester);
    });
  });

  group('Termos de uso', () {
    Future<void> preencherCadastro(WidgetTester tester) async {
      Future<void> campo(String rotulo, String valor) async {
        final f = find.widgetWithText(TextFormField, rotulo);
        await tester.ensureVisible(f);
        await tester.enterText(f, valor);
      }

      await campo('Nome fantasia', 'Pizzaria Boa');
      await campo('CNPJ', '11222333000181');
      await campo('Nome do responsável', 'Ana Souza');
      await campo('Telefone (com DDD)', '64999998888');
      await campo('Rua / avenida', 'Rua A');
      await campo('Número', '10');
      await campo('Bairro', 'Centro');
      await campo('Cidade', 'Goiatuba');
      await campo('UF', 'GO');
      await campo('CEP', '75600000');
      await campo('Crie uma senha', 'Senha1234');
      await tocar(tester, 'Buscar no mapa');
      await tocar(tester, 'Rua A, 10');
    }

    testWidgets('sem marcar o aceite o app não envia o cadastro', (tester) async {
      final servidor = ServidorFalso();
      await abrir(tester, sessaoCom(servidor));
      await preencherCadastro(tester);
      await tocar(tester, 'Enviar cadastro');
      expect(find.textContaining('leia e aceite os termos de uso'), findsOneWidget);
      expect(servidor.cadastros, 0);
      await fechar(tester);
    });

    testWidgets('marcando o aceite, o cadastro vai com aceiteTermos verdadeiro', (tester) async {
      final servidor = ServidorFalso();
      await abrir(tester, sessaoCom(servidor));
      await preencherCadastro(tester);
      await tester.ensureVisible(find.byKey(const ValueKey('aceite-termos')));
      await tester.tap(find.byKey(const ValueKey('aceite-termos')));
      await tester.pumpAndSettle();
      await tocar(tester, 'Enviar cadastro');
      expect(servidor.cadastros, 1);
      expect(servidor.ultimoCadastro!.aceiteTermos, isTrue);
      expect(servidor.ultimoCadastro!.toJson()['aceiteTermos'], isTrue);
      await fechar(tester);
    });

    testWidgets('a tela dos termos mostra o texto do servidor, sem os avisos de minuta', (tester) async {
      await abrir(tester, sessaoCom(ServidorFalso()));
      await tocar(tester, 'Ler os termos de uso');
      expect(find.textContaining('minuta técnica'), findsNothing);
      expect(find.text('1. Quem somos'), findsOneWidget);
      expect(find.textContaining('importante'), findsOneWidget);
      await fechar(tester);
    });

    testWidgets('termos que não carregam oferecem tentar de novo', (tester) async {
      final servidor = ServidorFalso()..erroNosTermos = ApiException('NETWORK_ERROR', 'Sem conexão com o servidor.');
      await abrir(tester, sessaoCom(servidor));
      await tocar(tester, 'Ler os termos de uso');
      expect(find.text('Não foi possível carregar os termos'), findsOneWidget);
      servidor.erroNosTermos = null;
      await tocar(tester, 'Tentar de novo');
      expect(find.text('1. Quem somos'), findsOneWidget);
      await fechar(tester);
    });

    testWidgets('a aba Conta tem os termos e a versão aceita, sem carteira nem mensalidade', (tester) async {
      final loja = estabelecimento();
      await abrir(tester, sessaoCom(ServidorFalso(), loja: loja));
      await tester.tap(find.text('Conta'));
      await tester.pumpAndSettle();
      expect(find.text('Termos de uso'), findsOneWidget);
      expect(find.textContaining('ensalidade'), findsNothing);
      await fechar(tester);
    });
  });
}

/// Abre a tela de acompanhamento da entrega que o servidor falso devolve.
Future<void> _abrirAcompanhamento(WidgetTester tester, ServidorFalso servidor) async {
  await abrir(tester, sessaoCom(servidor, loja: estabelecimento()));
  // O histórico falso é vazio: abre direto a tela de acompanhamento (como o toque num cartão faria).
  final contexto = tester.element(find.byType(Scaffold).first);
  Navigator.of(contexto).push(MaterialPageRoute<void>(builder: (_) => const EntregaTela(id: 'r1')));
  await tester.pumpAndSettle();
}
