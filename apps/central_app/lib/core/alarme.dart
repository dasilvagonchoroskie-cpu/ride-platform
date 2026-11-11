import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

/// Alarme do SOS e atalhos do telefone (ligar, abrir mapa e WhatsApp).
class Alarme {
  Alarme._();

  static const MethodChannel _canal = MethodChannel('fortaleza/alarme');

  static Future<void> tocar() async {
    try {
      await _canal.invokeMethod('tocar');
    } catch (_) {}
  }

  /// Aviso curto (nao e SOS): um som de notificacao, uma vibracao e a
  /// notificacao do Android na barra — ex.: motorista novo esperando
  /// aprovacao.
  static Future<void> aviso(String titulo, String texto, {String? id}) async {
    try {
      await _canal.invokeMethod('aviso', {'titulo': titulo, 'texto': texto, if (id != null) 'id': id});
    } catch (_) {}
  }

  static Future<void> parar() async {
    try {
      await _canal.invokeMethod('parar');
    } catch (_) {}
  }

  static Future<void> ligar(String numero) async {
    if (kIsWeb) return _web('tel:${numero.replaceAll(RegExp(r'[^0-9+]'), '')}');
    try {
      await _canal.invokeMethod('ligar', {'numero': numero});
    } catch (_) {}
  }

  /// Central pelo navegador (10/11/2026): links abrem numa aba nova.
  static Future<void> _web(String url) async {
    try {
      await launchUrl(Uri.parse(url), webOnlyWindowName: '_blank');
    } catch (_) {}
  }

  static Future<void> abrir(String url) async {
    if (kIsWeb) return _web(url);
    try {
      await _canal.invokeMethod('abrir', {'url': url});
    } catch (_) {}
  }

  static Future<void> whatsapp(String numero) => abrir('https://wa.me/${numero.replaceAll(RegExp(r'\D'), '')}');

  static Future<void> mapa(double lat, double lng) =>
      kIsWeb ? _web('https://www.google.com/maps/search/?api=1&query=$lat,$lng') : abrir('geo:$lat,$lng?q=$lat,$lng(SOS)');
}

/// Vigia da Central com o aplicativo fechado (servico do Android): alarme
/// do SOS e aviso de cadastro novo mesmo com a Central minimizada.
class VigiaCentral {
  VigiaCentral._();

  static const MethodChannel _canal = MethodChannel('fortaleza/vigia');

  static Future<void> iniciar(String api) async {
    try {
      await _canal.invokeMethod('iniciar', {'api': api});
    } catch (_) {}
  }

  static Future<void> parar() async {
    try {
      await _canal.invokeMethod('parar');
    } catch (_) {}
  }
}
