// Texto novo dos Termos: o app do Comercio pede o aceite de novo.

import 'package:comercio_app/core/api.dart';
import 'package:comercio_app/core/armazenamento.dart';
import 'package:comercio_app/estado/sessao.dart';
import 'package:flutter_test/flutter_test.dart';

import 'falsos.dart';

void main() {
  setUp(() => Armazenamento.atual = ArmazenamentoEmMemoria());

  Future<Sessao> comAceite(ServidorFalso servidor, String versao) async {
    await Armazenamento.atual.gravar(Armazenamento.termosAceitos, versao);
    return Sessao(api: ApiClient(), servidor: servidor)..termosAceitosVersao = versao;
  }

  test('versão nova no servidor pede o aceite de novo', () async {
    final s = await comAceite(ServidorFalso(), '0.0.1-antiga|1');
    await s.conferirTermos();
    expect(s.aceitouTermos, isFalse);
    expect(await Armazenamento.atual.ler(Armazenamento.termosAceitos), isNull);
  });

  test('mesma versão continua valendo', () async {
    final s = await comAceite(ServidorFalso(), '0.1.0-minuta|1');
    await s.conferirTermos();
    expect(s.aceitouTermos, isTrue);
  });

  test('sem conexão não tira o aceite', () async {
    final s = await comAceite(ServidorFalso()..erroNosTermos = Exception('sem rede'), '0.0.1-antiga|1');
    await s.conferirTermos();
    expect(s.aceitouTermos, isTrue);
  });
}
