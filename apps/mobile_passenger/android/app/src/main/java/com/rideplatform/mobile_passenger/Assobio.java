package com.rideplatform.mobile_passenger;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

/**
 * Assobio curto da plataforma (res/raw/aviso.ogg) quando o motorista chega.
 * Evandro (10/10/2026): "ele era para alarmar" e nao tocava. Agora toca
 * como ALARME (soa mesmo com o celular no silencioso ou no vibrar) e vibra.
 * Uma vez so por corrida: o vigia (app minimizado) e o app aberto usam a
 * mesma chave, e quem chegar primeiro toca.
 */
public final class Assobio {
    private Assobio() { }

    private static String ultimaChave = null;
    private static MediaPlayer toque;
    private static final Handler principal = new Handler(Looper.getMainLooper());

    public static synchronized boolean tocar(Context ctx, String chave) {
        if (chave != null && chave.equals(ultimaChave)) return false;
        ultimaChave = chave;
        final Context app = ctx.getApplicationContext();
        principal.post(() -> iniciar(app));
        return true;
    }

    private static AudioAttributes comoAlarme() {
        return new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
    }

    private static void iniciar(Context ctx) {
        parar();
        vibrar(ctx);
        try {
            MediaPlayer m = new MediaPlayer();
            m.setAudioAttributes(comoAlarme());
            try {
                m.setDataSource(ctx, Uri.parse("android.resource://" + ctx.getPackageName() + "/" + R.raw.aviso));
            } catch (Exception e) {
                Uri som = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                if (som == null) {
                    m.release();
                    return;
                }
                m.reset();
                m.setAudioAttributes(comoAlarme());
                m.setDataSource(ctx, som);
            }
            m.setLooping(true);
            m.prepare();
            m.start();
            toque = m;
            principal.postDelayed(Assobio::parar, 8000);
        } catch (Exception ignored) {
            toque = null;
        }
    }

    public static void parar() {
        try {
            if (toque != null) {
                toque.stop();
                toque.release();
            }
        } catch (Exception ignored) { }
        toque = null;
    }

    private static void vibrar(Context ctx) {
        long[] padrao = {0, 600, 300, 600, 300, 600};
        try {
            Vibrator v;
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                v = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createWaveform(padrao, -1));
            } else {
                v.vibrate(padrao, -1);
            }
        } catch (Exception ignored) { }
    }
}
