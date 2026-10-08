package com.rideplatform.central_app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Alarme do SOS na Central com o aplicativo fechado (Evandro, 08/10/2026:
 * "reforcar os alarmes, os aplicativos nao estao alarmando").
 *
 * - Toca pelo canal de ALARME (passa pelo modo silencioso) e sobe o volume
 *   do alarme ao maximo enquanto toca; depois devolve o volume que estava.
 * - Um alerta toca uma vez so por aqui (a chave e o id do alerta); com a
 *   Central aberta, quem toca em volta e o proprio aplicativo.
 */
public final class Sirene {

    private Sirene() { }

    private static MediaPlayer tocador;
    private static Vibrator vibrador;
    private static Integer volumeAntes;
    private static Context app;
    private static final Handler principal = new Handler(Looper.getMainLooper());
    private static final Runnable desligar = () -> parar();
    private static final LinkedHashSet<String> tocadas = new LinkedHashSet<>();

    /** true na primeira vez que a chave aparece. */
    public static synchronized boolean primeiraVez(String chave) {
        if (tocadas.contains(chave)) return false;
        tocadas.add(chave);
        if (tocadas.size() > 100) {
            Iterator<String> i = tocadas.iterator();
            i.next();
            i.remove();
        }
        return true;
    }

    /** Quanto tempo falta para o chamado vencer (entre 10 e 65 s). */
    public static long duracaoAte(String expiraEm) {
        long ms = 30000;
        if (expiraEm != null && !expiraEm.isEmpty()) {
            String[] formatos = {"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'"};
            for (String f : formatos) {
                try {
                    SimpleDateFormat sdf = new SimpleDateFormat(f, Locale.ROOT);
                    sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                    Date d = sdf.parse(expiraEm);
                    if (d != null) {
                        ms = d.getTime() - System.currentTimeMillis();
                        break;
                    }
                } catch (Exception ignored) { }
            }
        }
        return Math.max(10000, Math.min(65000, ms));
    }

    public static synchronized boolean tocando() {
        return tocador != null;
    }

    public static synchronized void tocar(Context c, long duracaoMs) {
        app = c.getApplicationContext();
        pararSom();
        AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
        try {
            if (am != null) {
                if (volumeAntes == null) volumeAntes = am.getStreamVolume(AudioManager.STREAM_ALARM);
                am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
            }
        } catch (Exception ignored) {
            // Alguns aparelhos no "Nao perturbe" total recusam: toca no volume que estiver.
        }
        Uri[] sons = {
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
        };
        for (Uri som : sons) {
            if (som == null) continue;
            try {
                MediaPlayer m = new MediaPlayer();
                m.setDataSource(app, som);
                m.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                m.setLooping(true);
                m.prepare();
                m.start();
                tocador = m;
                break;
            } catch (Exception e) {
                tocador = null;
            }
        }
        try {
            if (vibrador == null) vibrador = (Vibrator) app.getSystemService(Context.VIBRATOR_SERVICE);
            long[] padrao = new long[]{0, 700, 400, 700, 400, 900, 600};
            if (vibrador != null) {
                if (Build.VERSION.SDK_INT >= 26) {
                    vibrador.vibrate(VibrationEffect.createWaveform(padrao, 0));
                } else {
                    vibrador.vibrate(padrao, 0);
                }
            }
        } catch (Exception ignored) { }
        principal.removeCallbacks(desligar);
        principal.postDelayed(desligar, duracaoMs);
    }

    public static synchronized void parar() {
        principal.removeCallbacks(desligar);
        pararSom();
        try { if (vibrador != null) vibrador.cancel(); } catch (Exception ignored) { }
        if (app != null && volumeAntes != null) {
            try {
                AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
                if (am != null) am.setStreamVolume(AudioManager.STREAM_ALARM, volumeAntes, 0);
            } catch (Exception ignored) { }
        }
        volumeAntes = null;
    }

    private static void pararSom() {
        try {
            if (tocador != null) {
                tocador.stop();
                tocador.release();
            }
        } catch (Exception ignored) { }
        tocador = null;
    }
}
