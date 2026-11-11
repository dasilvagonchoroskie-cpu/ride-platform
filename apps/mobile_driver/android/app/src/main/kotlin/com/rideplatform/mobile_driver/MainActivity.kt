package com.rideplatform.mobile_driver

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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

    companion object {
        /** Aplicativo na frente agora: o chamado aparece na tela do Flutter. */
        @JvmField
        @Volatile
        var visivel = false

        private var canalAtivo: MethodChannel? = null

        /** Avisa o Flutter (chamado novo, corrida aceita na tela nativa). */
        @JvmStatic
        fun avisarFlutter(metodo: String, valor: String) {
            val c = canalAtivo ?: return
            Handler(Looper.getMainLooper()).post {
                try {
                    c.invokeMethod(metodo, valor)
                } catch (e: Exception) {
                    // Flutter ainda nao esta pronto: ele confere sozinho ao abrir.
                }
            }
        }
    }

    private val canal = "fortaleza/corridas"

    override fun onResume() {
        super.onResume()
        visivel = true
    }

    override fun onPause() {
        visivel = false
        super.onPause()
    }

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
        Bussola.registrar(applicationContext, flutterEngine.dartExecutor.binaryMessenger)
        val metodos = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, canal)
        canalAtivo = metodos
        metodos.setMethodCallHandler { call, result ->
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
                        Sirene.parar()
                        try {
                            startService(Intent(this, CorridasService::class.java).setAction(CorridasService.ACAO_PARAR_ALARME))
                        } catch (e: Exception) {
                            // Servico parado e app em segundo plano: o som ja parou acima.
                        }
                        result.success(true)
                    }
                    // Chamado visto com o aplicativo aberto: toca tambem (uma vez so).
                    "tocarChamado" -> {
                        CorridasService.chamadaDoApp(
                            this,
                            call.argument<String>("rideId") ?: "",
                            call.argument<String>("expiresAt") ?: "",
                            call.argument<String>("embarque") ?: "",
                            call.argument<String>("destino") ?: ""
                        )
                        result.success(true)
                    }
                    // Botao "Testar a tela de chamado": em 5 s abre a tela cheia
                    // de chamado (da tempo de bloquear o celular para conferir).
                    "testarChamado" -> {
                        val ctx = applicationContext
                        Handler(Looper.getMainLooper()).postDelayed({
                            val o = org.json.JSONObject()
                            o.put("teste", true)
                            o.put("rideId", "teste")
                            o.put("passengerName", "Passageiro de teste")
                            o.put("passengerRating", 5.0)
                            o.put("pickupAddress", "Rua de teste, 100 - Centro")
                            o.put("dropoffAddress", "Rodoviária")
                            o.put("estimatedFareCents", 1500)
                            o.put("driverNetCents", 1380)
                            o.put("distanceKm", 1.2)
                            o.put("etaSeconds", 240)
                            o.put("tripDistanceMeters", 3500)
                            o.put("tripDurationSeconds", 600)
                            o.put("paymentMethodType", "CASH")
                            val vence = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.ROOT)
                            vence.timeZone = java.util.TimeZone.getTimeZone("UTC")
                            o.put("expiresAt", vence.format(java.util.Date(System.currentTimeMillis() + 15000)))
                            CorridasService.abrirChamado(ctx, o, 15000)
                        }, 5000)
                        result.success(true)
                    }
                    // Botao "Testar alarme": 5 segundos no volume maximo.
                    "testarAlarme" -> {
                        Sirene.tocar(this, 5000)
                        result.success(true)
                    }
                    // Endereco de push (Firebase) deste celular; null sem Firebase.
                    "tokenPush" -> Push.token(this) { t -> result.success(t) }
                    "permissoes" -> result.success(estado())
                    // Xiaomi/HyperOS: o motorista confirma que deixou o app
                    // em "Apps ativos" (o Android nao informa esse ajuste).
                    "confirmarBateria" -> {
                        Aparelho.confirmar(this, "bateriaFabricante", call.argument<Boolean>("sim") == true)
                        result.success(true)
                    }
                    // Celular onde o app esta (marca, sistema) e os ajustes
                    // proprios do fabricante que o motorista tem que fazer.
                    "aparelho" -> result.success(Aparelho.perfil(this))
                    "abrirAjuste" -> {
                        Aparelho.abrir(this, call.argument<String>("chave") ?: "")
                        result.success(true)
                    }
                    "confirmarAjuste" -> {
                        Aparelho.confirmar(this, call.argument<String>("chave") ?: "", call.argument<Boolean>("sim") == true)
                        result.success(true)
                    }
                    "pedir" -> {
                        pedir(call.argument<String>("qual") ?: "")
                        result.success(true)
                    }
                    "veioDeChamada" -> result.success(intent?.getBooleanExtra("chamada", false) == true)
                    // Fabricante do aparelho (Xiaomi, Samsung...) para mostrar o
                    // ajuste certo de "iniciar sozinho" / bateria.
                    "fabricante" -> result.success(Build.MANUFACTURER ?: "")
                    // O vigia nativo esta esperando chamados no servidor?
                    "vigiaVivo" -> result.success(CorridasService.vivo())
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
            // Xiaomi: o Android nao enxerga o "Nenhuma restricao" da Xiaomi;
            // vale a confirmacao do motorista no ajuste do fabricante.
            "bateria" to (Build.VERSION.SDK_INT < 23 || pm.isIgnoringBatteryOptimizations(packageName) ||
                (ehXiaomi() && Aparelho.confirmado(this, "bateriaFabricante"))),
            "xiaomi" to ehXiaomi(),
            "telaCheia" to (Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent()),
            "gps" to gpsLigado()
        ) + Aparelho.extras().associate { "x_$it" to Aparelho.confirmado(this, it) }
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
            // A Google Play nao deixa pedir a isencao direto
            // (REQUEST_IGNORE_BATTERY_OPTIMIZATIONS): abre os ajustes do app,
            // onde o motorista toca em Bateria > Sem restricoes.
            "bateria" -> abrirBateria()
            "telaCheia" -> if (Build.VERSION.SDK_INT >= 34) {
                startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pacote))
            }
            "gps" -> startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            "iniciarSozinho" -> Aparelho.abrir(this, "inicioAutomatico")
            else -> abrirAjustesDoApp()
        }
    }

    private fun gpsLigado(): Boolean {
        val lm = getSystemService(LOCATION_SERVICE) as android.location.LocationManager
        return lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) ||
            lm.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)
    }

    /**
     * Xiaomi/Redmi/Poco (MIUI e HyperOS): o "Nenhuma restricao" da tela de
     * bateria do app e da Xiaomi e nao tira o app da otimizacao do Android
     * (Evandro, Redmi 12, 09/11/2026). Abre a lista "Otimizacao de bateria" do
     * Android, onde o motorista marca "Nao otimizar". Nos outros aparelhos,
     * Bateria > Sem restricoes nos ajustes do app ja resolve.
     */
    private fun abrirBateria() {
        if (ehXiaomi() && Build.VERSION.SDK_INT >= 23) {
            try {
                startActivity(
                    Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
                return
            } catch (e: Exception) {
                // Sem a lista neste aparelho: os ajustes do app.
            }
        }
        abrirAjustesDoApp()
    }

    private fun ehXiaomi(): Boolean {
        val m = (Build.MANUFACTURER ?: "").lowercase()
        return m.contains("xiaomi") || m.contains("redmi") || m.contains("poco")
    }

    /** Para quando o motorista negou de vez: so pelos ajustes do Android. */
    private fun abrirAjustesDoApp() {
        startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}
