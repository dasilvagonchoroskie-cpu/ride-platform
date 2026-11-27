import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

/// Falha ao falar com o Google no celular. [mensagem] ja vem pronta para a
/// tela.
class FalhaGoogle implements Exception {
  const FalhaGoogle(this.mensagem);

  final String mensagem;

  @override
  String toString() => mensagem;
}

/// "Entrar com Google": o celular mostra as contas, a pessoa escolhe e o
/// aplicativo recebe um comprovante assinado pelo Google. Quem confere esse
/// comprovante e o servidor; o aplicativo nunca ve a senha do Google.
class EntradaGoogle {
  EntradaGoogle._();

  static Future<void>? _inicio;

  /// Trocado nos testes (nao ha Google no computador que testa).
  @visibleForTesting
  static Future<String?> Function(String idDoServidor)? deTeste;

  /// O pacote so aceita ser preparado uma vez; se falhar, da para tentar de novo.
  static Future<void> _preparar(String idDoServidor) async {
    try {
      await (_inicio ??= GoogleSignIn.instance.initialize(serverClientId: idDoServidor));
    } catch (_) {
      _inicio = null;
      rethrow;
    }
  }

  /// Devolve o comprovante, ou null se a pessoa fechou a janela.
  static Future<String?> escolherConta(String idDoServidor) async {
    final falso = deTeste;
    if (falso != null) return falso(idDoServidor);
    try {
      await _preparar(idDoServidor);
      final conta = await GoogleSignIn.instance.authenticate();
      final comprovante = conta.authentication.idToken;
      // A entrada daqui em diante e da Fortaleza Move: o Google e esquecido
      // para a proxima vez a pessoa poder escolher a conta de novo.
      try {
        await GoogleSignIn.instance.signOut();
      } catch (_) {}
      if (comprovante == null || comprovante.isEmpty) {
        throw const FalhaGoogle('O Google não enviou a confirmação. Tente de novo ou use o código por e-mail.');
      }
      return comprovante;
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) return null;
      throw FalhaGoogle(
        'Não deu para entrar com o Google. Use o código por e-mail. (erro: ${e.code.name})',
      );
    } on FalhaGoogle {
      rethrow;
    } catch (_) {
      throw const FalhaGoogle('Não deu para entrar com o Google neste aparelho. Use o código por e-mail.');
    }
  }
}
