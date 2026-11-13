package br.com.fortalezamov.comercio

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * So uma ponte: o alarme "o motorista chegou" (mesmo assobio do app do
 * passageiro, toca como alarme e vibra). Nao pede localizacao, nao cria
 * servico em segundo plano e nao usa notificacao nativa.
 */
class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "fortaleza/comercio_alarme")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "assobio" -> result.success(Assobio.tocar(this, call.argument<String>("chave")))
                    "parar" -> {
                        Assobio.parar()
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
