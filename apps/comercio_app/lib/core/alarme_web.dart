import 'dart:js_interop';

/// Alarme no navegador: a funcao `fmAlarme` esta definida no index.html
/// (bipes de alarme pelo audio do navegador + vibracao quando o aparelho tem).
@JS('fmAlarme')
external void _fmAlarme();

void tocarNoNavegador() {
  try {
    _fmAlarme();
  } catch (_) {}
}
