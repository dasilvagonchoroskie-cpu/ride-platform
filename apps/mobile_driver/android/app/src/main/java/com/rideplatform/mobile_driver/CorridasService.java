package com.rideplatform.mobile_driver;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/**
 * Vigia de corridas enquanto o motorista esta DISPONIVEL — inclusive com o
 * aplicativo fechado e a tela apagada.
 *
 * Precisa ser um servico do Android (e nao codigo da tela) porque, com o
 * celular no bolso, o Android congela o aplicativo em segundos. Um servico
 * em primeiro plano continua vivo; o preco e o aviso fixo na barra, que o
 * proprio Android exige.
 *
 * Faz tres coisas:
 *  1. Consulta o servidor a cada 4 s atras de chamado novo.
 *  2. Manda a posicao do motorista, para o servidor saber quem esta perto.
 *  3. Quando chega chamado: toca como ALARME (passa pelo modo silencioso),
 *     vibra e abre a tela de chamada POR CIMA de qualquer coisa — outro
 *     aplicativo, tela inicial ou tela bloqueada.
 *
 * De brinde, cada motorista disponivel mantem o servidor acordado.
 */
public class CorridasService extends Service {

    public static final String ACAO_INICIAR = "INICIAR";
    public static final String ACAO_PARAR = "PARAR";
    public static final String ACAO_PARAR_ALARME = "PARAR_ALARME";

    private static final String CANAL_FIXO = "motorista_disponivel_v1";
    private static final String CANAL_CHAMADA = "motorista_chamada_v1";
    private static final int ID_FIXO = 5101;
    private static final int ID_CHAMADA = 5102;

    private static final long INTERVALO_MS = 4000;
    // Um chamado dura 30 s no servidor; o alarme nao toca alem disso.
    private static final long ALARME_MAX_MS = 32000;
    private static final long POSICAO_MIN_MS = 10000;

    private static final String PREFS = "fortaleza_corridas";

    private volatile boolean rodando = false;
    private Thread vigia;
    private String api = "";
    private String token = "";
    private final Set<String> jaTocadas = new HashSet<>();

    private MediaPlayer tocador;
    private Vibrator vibrador;
    private final Handler principal = new Handler(Looper.getMainLooper());
    private final Runnable desligarAlarme = this::pararAlarme;

    private PowerManager.WakeLock trava;
    private LocationManager gps;
    private long ultimaPosicaoMs = 0;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        criarCanais();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String acao = intent != null ? intent.getAction() : null;

        if (ACAO_PARAR.equals(acao)) {
            encerrar();
            return START_NOT_STICKY;
        }
        if (ACAO_PARAR_ALARME.equals(acao)) {
            pararAlarme();
            // Se o servico ja nao estava de pe, nao o deixa renascer sem o
            // aviso fixo — o Android derrubaria o aplicativo por isso.
            if (!rodando) {
                stopSelf();
                return START_NOT_STICKY;
            }
            return START_STICKY;
        }

        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (intent != null && intent.getStringExtra("api") != null) {
            api = intent.getStringExtra("api");
            token = intent.getStringExtra("token");
            p.edit().putString("api", api).putString("token", token).apply();
        } else {
            // Reiniciado pelo proprio Android: recupera o que tinha.
            api = p.getString("api", "");
            token = p.getString("token", "");
        }
        if (api.isEmpty() || token == null || token.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        try {
            Notification fixo = avisoFixo("Aguardando chamados.");
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(ID_FIXO, fixo, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(ID_FIXO, fixo);
            }
        } catch (Exception e) {
            // Sem a permissao de localizacao o Android recusa o servico.
            stopSelf();
            return START_NOT_STICKY;
        }

        segurarProcessador();
        ligarGps();

        if (!rodando) {
            rodando = true;
            vigia = new Thread(this::laco, "vigia-corridas");
            vigia.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        encerrar();
        super.onDestroy();
    }

    private void encerrar() {
        rodando = false;
        if (vigia != null) vigia.interrupt();
        pararAlarme();
        desligarGps();
        soltarProcessador();
        try { NotificationManagerCompat.from(this).cancel(ID_CHAMADA); } catch (Exception ignored) { }
        try { stopForeground(true); } catch (Exception ignored) { }
        stopSelf();
    }

    // ------------------------------------------------------------------
    // Consulta de chamados
    // ------------------------------------------------------------------

    private void laco() {
        while (rodando) {
            try {
                conferirChamados();
            } catch (Exception ignored) {
                // Rede caiu: tenta de novo na proxima volta.
            }
            segurarProcessador();
            try {
                Thread.sleep(INTERVALO_MS);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    private void conferirChamados() throws Exception {
        JSONObject corpo = requisitar("GET", "/api/driver/rides/offers", null);
        if (corpo == null || !corpo.optBoolean("success", false)) return;
        JSONArray lista = corpo.optJSONArray("data");
        if (lista == null || lista.length() == 0) return;

        JSONObject oferta = lista.getJSONObject(0);
        String id = oferta.optString("rideId", "");
        if (id.isEmpty() || jaTocadas.contains(id)) return;
        jaTocadas.add(id);
        if (jaTocadas.size() > 50) jaTocadas.clear();

        String embarque = oferta.optString("pickupAddress", "");
        String destino = oferta.optString("dropoffAddress", "");
        principal.post(() -> chamar(embarque, destino));
    }

    private JSONObject requisitar(String metodo, String caminho, JSONObject corpo) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(api + caminho).openConnection();
        c.setRequestMethod(metodo);
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestProperty("Authorization", "Bearer " + token);
        c.setRequestProperty("Content-Type", "application/json");
        try {
            if (corpo != null) {
                c.setDoOutput(true);
                try (OutputStream s = c.getOutputStream()) {
                    s.write(corpo.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            int codigo = c.getResponseCode();
            if (codigo == 401) {
                // Sessao expirou: nao adianta insistir ate o motorista
                // entrar de novo no aplicativo.
                rodando = false;
                principal.post(this::encerrar);
                return null;
            }
            if (codigo >= 400) return null;
            StringBuilder r = new StringBuilder();
            try (BufferedReader l = new BufferedReader(
                    new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                String linha;
                while ((linha = l.readLine()) != null) r.append(linha);
            }
            return new JSONObject(r.toString());
        } finally {
            c.disconnect();
        }
    }

    // ------------------------------------------------------------------
    // Chamado: alarme + tela cheia por cima de tudo
    // ------------------------------------------------------------------

    private void chamar(String embarque, String destino) {
        Intent abrir = new Intent(this, MainActivity.class);
        abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        abrir.putExtra("chamada", true);

        int marcas = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent telaCheia = PendingIntent.getActivity(this, 7, abrir, marcas);

        // Aviso de tela cheia: e o que acende e cobre a TELA BLOQUEADA.
        Notification aviso = new NotificationCompat.Builder(this, CANAL_CHAMADA)
                .setSmallIcon(android.R.drawable.ic_dialog_map)
                .setContentTitle("Corrida nova!")
                .setContentText(embarque.isEmpty() ? "Toque para ver." : "Buscar em: " + embarque)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(
                        "Buscar em: " + embarque + "\nDestino: " + destino))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(telaCheia)
                .setFullScreenIntent(telaCheia, true)
                .setOngoing(true)
                .setTimeoutAfter(ALARME_MAX_MS)
                .build();
        try {
            NotificationManagerCompat.from(this).notify(ID_CHAMADA, aviso);
        } catch (SecurityException ignored) { }

        ligarAlarme();

        // Por cima de OUTRO aplicativo aberto: so o Android permite trazer a
        // tela para a frente se o motorista liberou "sobrepor a outros apps".
        try {
            if (Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this)) {
                startActivity(abrir);
            }
        } catch (Exception ignored) { }
    }

    /** Toca em alca, como ligacao, pelo canal de ALARME. */
    private void ligarAlarme() {
        pararAlarme();
        try {
            Uri som = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (som == null) som = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (som != null) {
                tocador = new MediaPlayer();
                tocador.setDataSource(this, som);
                tocador.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                tocador.setLooping(true);
                tocador.prepare();
                tocador.start();
            }
        } catch (Exception e) {
            tocador = null;
        }
        try {
            if (vibrador == null) vibrador = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            long[] padrao = new long[]{0, 700, 400, 700, 400, 900, 600};
            if (Build.VERSION.SDK_INT >= 26) {
                vibrador.vibrate(VibrationEffect.createWaveform(padrao, 0));
            } else {
                vibrador.vibrate(padrao, 0);
            }
        } catch (Exception ignored) { }
        principal.removeCallbacks(desligarAlarme);
        principal.postDelayed(desligarAlarme, ALARME_MAX_MS);
    }

    private void pararAlarme() {
        principal.removeCallbacks(desligarAlarme);
        try {
            if (tocador != null) {
                tocador.stop();
                tocador.release();
            }
        } catch (Exception ignored) { }
        tocador = null;
        try { if (vibrador != null) vibrador.cancel(); } catch (Exception ignored) { }
        try { NotificationManagerCompat.from(this).cancel(ID_CHAMADA); } catch (Exception ignored) { }
    }

    // ------------------------------------------------------------------
    // Posicao do motorista
    // ------------------------------------------------------------------

    private final LocationListener ouvinte = new LocationListener() {
        @Override public void onLocationChanged(Location l) { enviarPosicao(l); }
        @Override public void onProviderEnabled(String p) { }
        @Override public void onProviderDisabled(String p) { }
        @Override public void onStatusChanged(String p, int s, Bundle b) { }
    };

    private void ligarGps() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) return;
        try {
            if (gps == null) gps = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            gps.removeUpdates(ouvinte);
            if (gps.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                gps.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10000, 20f, ouvinte, Looper.getMainLooper());
            }
            if (gps.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                gps.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15000, 30f, ouvinte, Looper.getMainLooper());
            }
        } catch (SecurityException ignored) { }
    }

    private void desligarGps() {
        try { if (gps != null) gps.removeUpdates(ouvinte); } catch (Exception ignored) { }
    }

    private void enviarPosicao(Location l) {
        long agora = System.currentTimeMillis();
        if (agora - ultimaPosicaoMs < POSICAO_MIN_MS) return;
        ultimaPosicaoMs = agora;
        final JSONObject corpo = new JSONObject();
        try {
            corpo.put("latitude", l.getLatitude());
            corpo.put("longitude", l.getLongitude());
            // O servidor recusa precisao acima de 1000 m: limita aqui.
            if (l.hasAccuracy()) corpo.put("accuracy", Math.min(l.getAccuracy(), 999f));
            if (l.hasSpeed()) corpo.put("speed", Math.min(l.getSpeed(), 299f));
            if (l.hasBearing()) corpo.put("heading", Math.min(l.getBearing(), 359.9f));
        } catch (Exception e) {
            return;
        }
        new Thread(() -> {
            try { requisitar("POST", "/api/drivers/me/location", corpo); } catch (Exception ignored) { }
        }, "posicao-motorista").start();
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    /** Mantem o processador acordado enquanto disponivel (renovado a cada volta). */
    private void segurarProcessador() {
        try {
            if (trava == null) {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                trava = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fortaleza:corridas");
                trava.setReferenceCounted(false);
            }
            trava.acquire(10 * 60 * 1000L);
        } catch (Exception ignored) { }
    }

    private void soltarProcessador() {
        try { if (trava != null && trava.isHeld()) trava.release(); } catch (Exception ignored) { }
    }

    private void criarCanais() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager g = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (g == null) return;
        if (g.getNotificationChannel(CANAL_FIXO) == null) {
            NotificationChannel fixo = new NotificationChannel(
                    CANAL_FIXO, "Disponível para corridas", NotificationManager.IMPORTANCE_LOW);
            fixo.setDescription("Aviso fixo enquanto você está disponível. Não toca nem vibra.");
            fixo.setShowBadge(false);
            fixo.setSound(null, null);
            fixo.enableVibration(false);
            g.createNotificationChannel(fixo);
        }
        if (g.getNotificationChannel(CANAL_CHAMADA) == null) {
            NotificationChannel chamada = new NotificationChannel(
                    CANAL_CHAMADA, "Corrida nova", NotificationManager.IMPORTANCE_HIGH);
            chamada.setDescription("Abre a tela de chamada quando aparece corrida.");
            // O som e a vibracao ficam por conta do alarme, que passa pelo
            // modo silencioso. O canal fica mudo para nao tocar em dobro.
            chamada.setSound(null, null);
            chamada.enableVibration(false);
            chamada.setBypassDnd(true);
            chamada.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            g.createNotificationChannel(chamada);
        }
    }

    private Notification avisoFixo(String texto) {
        Intent abrir = new Intent(this, MainActivity.class);
        abrir.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent toque = PendingIntent.getActivity(this, 3, abrir,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CANAL_FIXO)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("Fortaleza Mov — disponível")
                .setContentText(texto)
                .setOngoing(true)
                .setContentIntent(toque)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }
}
