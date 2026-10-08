package com.rideplatform.central_app

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.EventChannel

/**
 * Bussola dos mapas (Evandro, 08/10/2026: "aquela bussolazinha que tem no
 * Maps"): manda para o Flutter para onde o celular aponta, em graus
 * (0 = norte, sentido horario), lido do sensor de rotacao do Android.
 */
object Bussola {
    fun registrar(contexto: Context, mensageiro: BinaryMessenger) {
        EventChannel(mensageiro, "fortaleza/bussola").setStreamHandler(object : EventChannel.StreamHandler {
            private var ouvinte: SensorEventListener? = null

            override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
                val sm = contexto.getSystemService(Context.SENSOR_SERVICE) as SensorManager
                val sensor = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
                if (sensor == null) {
                    events.error("SEM_BUSSOLA", "Este celular nao tem bussola.", null)
                    return
                }
                val matriz = FloatArray(9)
                val orientacao = FloatArray(3)
                val novo = object : SensorEventListener {
                    override fun onSensorChanged(e: SensorEvent) {
                        // Alguns aparelhos mandam 5 valores: o Android so aceita 4.
                        val v = if (e.values.size > 4) e.values.copyOf(4) else e.values
                        SensorManager.getRotationMatrixFromVector(matriz, v)
                        SensorManager.getOrientation(matriz, orientacao)
                        var graus = Math.toDegrees(orientacao[0].toDouble())
                        if (graus < 0) graus += 360.0
                        events.success(graus)
                    }

                    override fun onAccuracyChanged(s: Sensor?, precisao: Int) {}
                }
                ouvinte = novo
                sm.registerListener(novo, sensor, SensorManager.SENSOR_DELAY_UI)
            }

            override fun onCancel(arguments: Any?) {
                val sm = contexto.getSystemService(Context.SENSOR_SERVICE) as SensorManager
                ouvinte?.let { sm.unregisterListener(it) }
                ouvinte = null
            }
        })
    }
}
