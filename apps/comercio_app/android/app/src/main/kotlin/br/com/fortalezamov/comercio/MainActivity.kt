package br.com.fortalezamov.comercio

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Pontes com o Android: o alarme "o motorista chegou" (mesmo assobio do app
 * do passageiro) e as autorizacoes do celular (localizacao, notificacoes,
 * bateria e os ajustes de cada fabricante), iguais aos dos outros aplicativos.
 * Nao cria servico em segundo plano.
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
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "fortaleza/permissoes")
            .setMethodCallHandler { call, result ->
                try {
                    when (call.method) {
                        "estado" -> result.success(estado())
                        "pedir" -> {
                            pedir(call.argument<String>("qual") ?: "")
                            result.success(true)
                        }
                        "posicao" -> result.success(posicao())
                        "aparelho" -> result.success(Aparelho.perfil(this))
                        "abrirAjuste" -> {
                            Aparelho.abrir(this, call.argument<String>("chave") ?: "")
                            result.success(true)
                        }
                        "confirmarAjuste" -> {
                            Aparelho.confirmar(this, call.argument<String>("chave") ?: "", call.argument<Boolean>("sim") == true)
                            result.success(true)
                        }
                        else -> result.notImplemented()
                    }
                } catch (e: Exception) {
                    result.error("FALHA", e.message, null)
                }
            }
    }

    private fun temLocalizacao(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun gpsLigado(): Boolean {
        val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }

    private fun estado(): Map<String, Boolean> {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return mapOf(
            "localizacao" to temLocalizacao(),
            "gps" to gpsLigado(),
            "notificacao" to (Build.VERSION.SDK_INT < 33 ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED),
            "bateria" to (Build.VERSION.SDK_INT < 23 || pm.isIgnoringBatteryOptimizations(packageName)),
        ) + Aparelho.extras().associate { "x_$it" to Aparelho.confirmado(this, it) }
    }

    private fun pedir(qual: String) {
        when (qual) {
            "localizacao" -> ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                801,
            )
            "notificacao" -> if (Build.VERSION.SDK_INT >= 33) {
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 802)
            } else {
                abrirAjustes()
            }
            "gps" -> startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            // Ajustes do app: Bateria > Sem restricoes (a Play nao deixa pedir direto).
            "bateria" -> abrirAjustes()
            else -> abrirAjustes()
        }
    }

    private fun ultima(lm: LocationManager, provedor: String): Location? =
        try { lm.getLastKnownLocation(provedor) } catch (e: SecurityException) { null }

    /** Ultima posicao conhecida do aparelho, ou null se nunca houve. */
    private fun posicao(): Map<String, Double>? {
        if (!temLocalizacao()) return null
        val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        var melhor: Location? = null
        for (p in lm.getProviders(true)) {
            val l = ultima(lm, p) ?: continue
            val atual = melhor
            if (atual == null || l.time > atual.time) melhor = l
        }
        val m = melhor ?: return null
        return mapOf("latitude" to m.latitude, "longitude" to m.longitude)
    }

    private fun abrirAjustes() {
        startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
