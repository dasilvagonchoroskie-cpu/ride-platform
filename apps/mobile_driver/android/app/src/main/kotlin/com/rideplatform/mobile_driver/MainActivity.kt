package com.rideplatform.mobile_driver

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Tela do aplicativo + ponte com o servico de corridas.
 *
 * Quando o servico abre esta tela por causa de um chamado, ela acende a
 * tela e aparece POR CIMA da tela bloqueada. Aberta normalmente pelo icone,
 * ela se comporta como qualquer aplicativo.
 */
class MainActivity : FlutterActivity() {

    private val canal = "fortaleza/corridas"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        mostrarSobreBloqueio(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        mostrarSobreBloqueio(intent)
    }

    private fun mostrarSobreBloqueio(i: Intent?) {
        if (i?.getBooleanExtra("chamada", false) != true) return
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, canal).setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "iniciar" -> {
                        val i = Intent(this, CorridasService::class.java)
                            .setAction(CorridasService.ACAO_INICIAR)
                            .putExtra("api", call.argument<String>("api"))
                            .putExtra("token", call.argument<String>("token"))
                        ContextCompat.startForegroundService(this, i)
                        result.success(true)
                    }
                    "parar" -> {
                        startService(Intent(this, CorridasService::class.java).setAction(CorridasService.ACAO_PARAR))
                        result.success(true)
                    }
                    "pararAlarme" -> {
                        startService(Intent(this, CorridasService::class.java).setAction(CorridasService.ACAO_PARAR_ALARME))
                        result.success(true)
                    }
                    "permissoes" -> result.success(estado())
                    "pedir" -> {
                        pedir(call.argument<String>("qual") ?: "")
                        result.success(true)
                    }
                    "veioDeChamada" -> result.success(intent?.getBooleanExtra("chamada", false) == true)
                    else -> result.notImplemented()
                }
            } catch (e: Exception) {
                result.error("FALHA", e.message, null)
            }
        }
    }

    /** O que ja foi liberado pelo motorista. */
    private fun estado(): Map<String, Boolean> {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        return mapOf(
            "localizacao" to (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED),
            "notificacao" to (Build.VERSION.SDK_INT < 33 ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED),
            "sobrepor" to (Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this)),
            "bateria" to (Build.VERSION.SDK_INT < 23 || pm.isIgnoringBatteryOptimizations(packageName)),
            "telaCheia" to (Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent())
        )
    }

    /** Abre o pedido certo do Android para cada autorizacao. */
    private fun pedir(qual: String) {
        val pacote = Uri.parse("package:$packageName")
        when (qual) {
            "localizacao" -> ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                701
            )
            "notificacao" -> if (Build.VERSION.SDK_INT >= 33) {
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 702)
            } else {
                abrirAjustesDoApp()
            }
            "sobrepor" -> if (Build.VERSION.SDK_INT >= 23) {
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pacote))
            }
            "bateria" -> if (Build.VERSION.SDK_INT >= 23) {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pacote))
            }
            "telaCheia" -> if (Build.VERSION.SDK_INT >= 34) {
                startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pacote))
            }
            else -> abrirAjustesDoApp()
        }
    }

    /** Para quando o motorista negou de vez: so pelos ajustes do Android. */
    private fun abrirAjustesDoApp() {
        startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}
