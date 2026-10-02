import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_passenger/core/utils/validadores.dart';
import 'package:mobile_passenger/data/models/models.dart';
import 'package:mobile_passenger/screens/city_screen.dart';
import 'package:mobile_passenger/screens/home_screen.dart';
import 'package:mobile_passenger/screens/otp_screen.dart';

void main() {
  group('CPF', () {
    test('aceita CPF valido com ou sem pontuacao', () {
      expect(cpfValido('529.982.247-25'), isTrue);
      expect(cpfValido('52998224725'), isTrue);
    });

    test('recusa digito errado, numeros repetidos e tamanho errado', () {
      expect(cpfValido('529.982.247-24'), isFalse);
      expect(cpfValido('111.111.111-11'), isFalse);
      expect(cpfValido('5299822472'), isFalse);
    });

    test('mascara enquanto digita', () {
      expect(formatarCpf('529'), '529');
      expect(formatarCpf('5299822'), '529.982.2');
      expect(formatarCpf('52998224725999'), '529.982.247-25');
    });
  });

  test('senha segue a mesma regra do servidor', () {
    expect(problemaSenha('abc123'), isNotNull);
    expect(problemaSenha('abcdefgh'), isNotNull);
    expect(problemaSenha('12345678'), isNotNull);
    expect(problemaSenha('Fortaleza2026'), isNull);
  });

  test('nome e sobrenome', () {
    expect(nomeCompleto('Evandro'), isFalse);
    expect(nomeCompleto('Evandro S'), isFalse);
    expect(nomeCompleto('Evandro da Silva'), isTrue);
  });

  test('e-mail', () {
    expect(emailValido('evandro@gmail.com'), isTrue);
    expect(emailValido('evandro@gmail'), isFalse);
    expect(emailValido('evandro gmail.com'), isFalse);
  });

  test('busca de cidade ignora acento e maiuscula', () {
    expect(semAcento('Goiatúba - GO').contains(semAcento('goiatuba')), isTrue);
  });

  test('telefone legivel', () {
    expect(telefoneLegivel('+5564992686632'), '(64) 99268-6632');
  });

  test('saudacao pela hora', () {
    expect(saudacao(DateTime(2026, 10, 2, 8)), 'Bom dia');
    expect(saudacao(DateTime(2026, 10, 2, 14)), 'Boa tarde');
    expect(saudacao(DateTime(2026, 10, 2, 21)), 'Boa noite');
  });

  test('perfil antigo guardado no aparelho pede o cadastro', () {
    final u = UserProfile.fromJson({'id': '1', 'name': 'Passageiro 6632', 'phone': '+5564992686632'});
    expect(u.cadastroCompleto, isFalse);
    final completo = UserProfile.fromJson({
      'id': '1',
      'name': 'Evandro da Silva Gonchoroski',
      'phone': '+5564992686632',
      'cadastroCompleto': true,
      'genero': 'MASCULINO',
    });
    expect(completo.cadastroCompleto, isTrue);
    expect(completo.iniciais, 'EG');
    expect(rotuloGenero(completo.genero), 'Masculino');
  });
}
