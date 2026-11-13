import 'dart:js_interop';

/// Instalar o Comercio como aplicativo (PWA): as funcoes `fmPodeInstalar` e
/// `fmInstalar` estao no index.html e guardam o pedido do navegador.
@JS('fmPodeInstalar')
external JSBoolean _fmPodeInstalar();

@JS('fmInstalar')
external void _fmInstalar();

bool navegadorPodeInstalar() {
  try {
    return _fmPodeInstalar().toDart;
  } catch (_) {
    return false;
  }
}

void instalarNoNavegador() {
  try {
    _fmInstalar();
  } catch (_) {}
}
