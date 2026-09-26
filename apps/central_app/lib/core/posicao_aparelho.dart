import 'permissoes_nativas.dart';
import 'utils/geo.dart';

/// Onde o aparelho da Central esta. O mapa de monitoramento abre aqui
/// quando nao ha corrida — nunca numa cidade fixa.
class PosicaoDoAparelho {
  PosicaoDoAparelho._();

  static Coords? atual;

  static Future<void> carregar() async {
    final p = await PermissoesNativas.posicao();
    if (p != null) atual = Coords(p['latitude']!, p['longitude']!);
  }
}
