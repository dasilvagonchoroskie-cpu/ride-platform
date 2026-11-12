import 'package:comercio_app/core/formato.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Formato', () {
    test('dinheiro', () {
      expect(Formato.dinheiro(0), 'R\$ 0,00');
      expect(Formato.dinheiro(705), 'R\$ 7,05');
      expect(Formato.dinheiro(123456), 'R\$ 1.234,56');
      expect(Formato.dinheiro(-250), '-R\$ 2,50');
    });

    test('cnpj, cep e telefone', () {
      expect(Formato.cnpj('11222333000181'), '11.222.333/0001-81');
      expect(Formato.cep('75600000'), '75600-000');
      expect(Formato.telefone('+5564999998888'), '(64) 99999-8888');
      expect(Formato.telefone('6433331234'), '(64) 3333-1234');
    });

    test('data em horario de Brasilia', () {
      expect(Formato.dataHora('2026-11-12T15:04:00.000Z'), '12/11/2026 12:04');
      expect(Formato.dataHora(null), '');
      expect(Formato.dataHora('lixo'), '');
    });

    test('distancia e duracao', () {
      expect(Formato.distancia(850), '850 m');
      expect(Formato.distancia(2350), '2,4 km');
      expect(Formato.duracao(600), '10 min');
      expect(Formato.duracao(4500), '1 h 15 min');
    });
  });

  group('Validar', () {
    test('CNPJ', () {
      expect(Validar.cnpj('11.222.333/0001-81'), isTrue);
      expect(Validar.cnpj('11222333000182'), isFalse);
      expect(Validar.cnpj('00000000000000'), isFalse);
      expect(Validar.cnpj('123'), isFalse);
      expect(Validar.campoCnpj('11222333000182'), 'CNPJ inválido.');
      expect(Validar.campoCnpj('11222333000181'), isNull);
    });

    test('CPF', () {
      expect(Validar.cpf('529.982.247-25'), isTrue);
      expect(Validar.cpf('52998224726'), isFalse);
      expect(Validar.cpf('11111111111'), isFalse);
      expect(Validar.campoCpf(''), isNull); // opcional
      expect(Validar.campoCpf('123'), 'CPF inválido.');
    });

    test('e-mail, telefone, CEP, UF e senha', () {
      expect(Validar.email('loja@exemplo.com.br'), isTrue);
      expect(Validar.email('loja@'), isFalse);
      expect(Validar.telefone('(64) 99999-8888'), isTrue);
      expect(Validar.telefone('+55 64 99999-8888'), isTrue);
      expect(Validar.telefone('99999-8888'), isFalse);
      expect(Validar.cep('75600-000'), isTrue);
      expect(Validar.cep('756'), isFalse);
      expect(Validar.campoUf('GO'), isNull);
      expect(Validar.campoUf('G'), isNotNull);
      expect(Validar.senha('abc12345'), isTrue);
      expect(Validar.senha('abcdefgh'), isFalse);
      expect(Validar.senha('1234567'), isFalse);
    });
  });
}
