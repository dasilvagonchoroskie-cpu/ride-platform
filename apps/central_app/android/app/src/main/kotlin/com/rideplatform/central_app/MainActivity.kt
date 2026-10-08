package com.rideplatform.central_app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Autorizacoes do Android, pedidas logo na primeira abertura, e a ultima
 * posicao conhecida do aparelho — para o mapa abrir onde a pessoa esta,
 * nunca numa cidade fixa.
 */
class MainActivity : FlutterActivity() {

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        Bussola.registrar(applicationContext, flutterEngine.dartExecutor.binaryMessenger)
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
                        else -> result.notImplemented()
                    }
                } catch (e: Exception) {
                    result.error("FALHA", e.message, null)
                }
            }

        // Alarme do SOS (toca como despertador, em volta, ate a Central
        // atender), ligacao e abrir mapa/WhatsApp.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "fortaleza/alarme")
            .setMethodCallHandler { call, result ->
                try {
                    when (call.method) {
                        "tocar" -> { tocar(); result.success(true) }
                        "parar" -> { parar(); result.success(true) }
                        "aviso" -> {
                            aviso(call.argument<String>("titulo") ?: "", call.argument<String>("texto") ?: "")
                            result.success(true)
                        }
                        "ligar" -> {
                            val numero = call.argument<String>("numero") ?: ""
                            startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$numero")))
                            result.success(true)
                        }
                        "abrir" -> {
                            val url = call.argument<String>("url") ?: ""
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                            result.success(true)
                        }
                        else -> result.notImplemented()
                    }
                } catch (e: Exception) {
                    result.error("FALHA", e.message, null)
                }
            }
    }

    private var toque: Ringtone? = null

    private fun vibrador(): Vibrator? =
        if (Build.VERSION.SDK_INT >= 31) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }

    private fun tocar() {
        if (toque?.isPlaying == true) return
        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        toque = RingtoneManager.getRingtone(applicationContext, uri)?.apply {
            audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            if (Build.VERSION.SDK_INT >= 28) isLooping = true
            play()
        }
        val padrao = longArrayOf(0, 800, 400, 800, 400)
        if (Build.VERSION.SDK_INT >= 26) {
            vibrador()?.vibrate(VibrationEffect.createWaveform(padrao, 0))
        } else {
            @Suppress("DEPRECATION")
            vibrador()?.vibrate(padrao, 0)
        }
    }

    /**
     * Aviso curto (motorista novo esperando aprovacao): som de notificacao
     * uma vez, uma vibracao e a notificacao na barra do Android, que abre a
     * Central ao tocar.
     */
    private fun aviso(titulo: String, texto: String) {
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            RingtoneManager.getRingtone(applicationContext, uri)?.play()
        } catch (e: Exception) {}
        if (Build.VERSION.SDK_INT >= 26) {
            vibrador()?.vibrate(VibrationEffect.createOneShot(400, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrador()?.vibrate(400)
        }
        val canal = "cadastros"
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(canal) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(canal, "Cadastros de motoristas", NotificationManager.IMPORTANCE_HIGH)
                        .apply { description = "Motorista novo esperando aprovacao" }
                )
            }
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) return
        val abrir = packageManager.getLaunchIntentForPackage(packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val toque = abrir?.let {
            PendingIntent.getActivity(this, 901, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val n = NotificationCompat.Builder(this, canal)
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setStyle(NotificationCompat.BigTextStyle().bigText(texto))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .apply { if (toque != null) setContentIntent(toque) }
            .build()
        try {
            NotificationManagerCompat.from(this).notify(902, n)
        } catch (e: SecurityException) {}
    }

    private fun parar() {
        toque?.stop()
        toque = null
        vibrador()?.cancel()
    }

    override fun onDestroy() {
        parar()
        super.onDestroy()
    }

    private fun temLocalizacao(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    private fun gpsLigado(): Boolean {
        val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
            lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }

    private fun estado(): Map<String, Boolean> = mapOf(
        "localizacao" to temLocalizacao(),
        "gps" to gpsLigado(),
        "notificacao" to (Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED)
    )

    private fun pedir(qual: String) {
        when (qual) {
            "localizacao" -> ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                801
            )
            "notificacao" -> if (Build.VERSION.SDK_INT >= 33) {
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 802)
            } else {
                abrirAjustes()
            }
            "gps" -> startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
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
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}
