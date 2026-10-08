package com.rideplatform.central_app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Vigia da Central com o aplicativo fechado (Evandro, 08/10/2026: "reforcar
 * os alarmes, os aplicativos nao estao alarmando").
 *
 * Com a Central minimizada, o Android congela o aplicativo e o alarme do
 * SOS so tocava quando alguem abria a tela. Este servico pergunta ao
 * servidor a cada 8 s e, com a Central fora da tela:
 *  - SOS novo: toca como despertador (volume maximo) e mostra o aviso;
 *  - motorista novo esperando aprovacao: notificacao com som.
 * Com a Central aberta, quem avisa e o proprio aplicativo (sem dobrar).
 */
public class VigiaCentralService extends Service {

    public static final String ACAO_INICIAR = "INICIAR";
    public static final String ACAO_PARAR = "PARAR";

    /** A tela da Central esta aberta (o aplicativo avisa por conta propria). */
    public static volatile boolean naTela = false;

    private static final String CANAL_FIXO = "central_vigia_v1";
    private static final String CANAL_SOS = "central_sos_v1";
    private static final String CANAL_CADASTRO = "central_cadastros_v1";
    private static final int ID_FIXO = 7101;
    private static final int ID_SOS = 7102;
    private static final int ID_CADASTRO = 7103;
    private static final int ID_SESSAO = 7104;
    private static final long INTERVALO_MS = 8000;
    private static final String PREFS = "fortaleza_central";

    private volatile boolean rodando = false;
    private Thread vigia;
    private String api = "";
    private String token = "";
    private final Handler principal = new Handler(Looper.getMainLooper());

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
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (intent != null && intent.getStringExtra("api") != null) {
            api = intent.getStringExtra("api");
            p.edit().putString("api", api).apply();
        } else {
            api = p.getString("api", "");
        }
        token = Sessao.acesso(this, token);
        if (api.isEmpty() || token.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            Notification fixo = avisoFixo();
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(ID_FIXO, fixo, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(ID_FIXO, fixo);
            }
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!rodando) {
            rodando = true;
            vigia = new Thread(this::laco, "vigia-central");
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
        Sirene.parar();
        try { stopForeground(true); } catch (Exception ignored) { }
        stopSelf();
    }

    private void laco() {
        while (rodando) {
            try {
                conferir();
            } catch (Exception ignored) {
                // Sem rede nesta volta.
            }
            try {
                Thread.sleep(INTERVALO_MS);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    private void conferir() throws Exception {
        JSONObject r = requisitar("/api/admin/overview");
        JSONObject d = r != null ? r.optJSONObject("data") : null;
        if (d == null) return;
        if (d.optInt("sosActive", 0) > 0) conferirSos();
        JSONObject pendente = d.optJSONObject("latestPendingDriver");
        if (pendente != null) conferirCadastro(pendente, d.optInt("driversPending", 1));
    }

    private void conferirSos() throws Exception {
        JSONObject r = requisitar("/api/admin/safety?resolved=false");
        if (r == null) return;
        JSONObject dados = r.optJSONObject("data");
        JSONArray lista = dados != null ? dados.optJSONArray("items") : r.optJSONArray("data");
        if (lista == null) return;
        for (int i = 0; i < lista.length(); i++) {
            JSONObject a = lista.optJSONObject(i);
            if (a == null) continue;
            String id = a.optString("id", "");
            if (id.isEmpty() || !Sirene.primeiraVez("sos|" + id)) continue;
            if (naTela) continue; // a Central aberta toca e abre a janela do SOS
            JSONObject quem = a.optJSONObject("who");
            String nome = quem != null ? quem.optString("name", "Alguém") : "Alguém";
            String papel = quem != null && "DRIVER".equals(quem.optString("role", "")) ? "Motorista" : "Passageiro";
            final String texto = papel + " " + nome + " pediu socorro. Toque para ver no mapa.";
            principal.post(() -> {
                Sirene.tocar(this, 60000);
                avisar(CANAL_SOS, ID_SOS, "SOS — pedido de socorro!", texto, true);
            });
            break;
        }
    }

    private void conferirCadastro(JSONObject pendente, int fila) {
        String id = pendente.optString("id", "");
        if (id.isEmpty()) return;
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        // O aplicativo guarda o ultimo cadastro que ja mostrou.
        String vistoNoApp = getApplicationContext()
                .getSharedPreferences("FlutterSharedPreferences", MODE_PRIVATE)
                .getString("flutter.central.pendenteVisto", null);
        String avisado = p.getString("cadastro_avisado", null);
        if (id.equals(vistoNoApp) || id.equals(avisado)) return;
        if (naTela) return; // a Central aberta mostra a janela
        p.edit().putString("cadastro_avisado", id).apply();
        String nome = pendente.optString("name", "");
        if (nome.trim().isEmpty()) nome = "Motorista novo";
        int outros = fila - 1;
        final String texto = nome + " terminou o cadastro" + (outros > 0 ? " (e mais " + outros + " na fila)" : "")
                + ". Toque para conferir.";
        principal.post(() -> avisar(CANAL_CADASTRO, ID_CADASTRO, "Motorista aguardando aprovação", texto, false));
    }

    private JSONObject requisitar(String caminho) throws Exception {
        return requisitar(caminho, true);
    }

    private JSONObject requisitar(String caminho, boolean renovarSe401) throws Exception {
        token = Sessao.acesso(this, token);
        HttpURLConnection c = (HttpURLConnection) new URL(api + caminho).openConnection();
        c.setRequestMethod("GET");
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestProperty("Authorization", "Bearer " + token);
        try {
            int codigo = c.getResponseCode();
            if (codigo == 401 || codigo == 403) {
                if (!renovarSe401 || codigo == 403) return null;
                String usado = token;
                String novo = Sessao.renovar(this, api, usado);
                if (novo == null) {
                    principal.post(() -> avisar(CANAL_CADASTRO, ID_SESSAO, "Central desconectada",
                            "Entre de novo na Central para voltar a receber os alarmes.", false));
                    rodando = false;
                    principal.post(this::encerrar);
                    return null;
                }
                if (novo.equals(usado)) return null;
                token = novo;
                return requisitar(caminho, false);
            }
            if (codigo >= 400) return null;
            StringBuilder r = new StringBuilder();
            try (BufferedReader l = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                String linha;
                while ((linha = l.readLine()) != null) r.append(linha);
            }
            return new JSONObject(r.toString());
        } finally {
            c.disconnect();
        }
    }

    private PendingIntent abrirApp(int codigo) {
        Intent abrir = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (abrir == null) abrir = new Intent(this, MainActivity.class);
        abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, codigo, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void avisar(String canal, int id, String titulo, String texto, boolean urgente) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, canal)
                .setSmallIcon(urgente ? android.R.drawable.ic_dialog_alert : android.R.drawable.ic_dialog_info)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
                .setPriority(urgente ? NotificationCompat.PRIORITY_MAX : NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(abrirApp(id))
                .setAutoCancel(true);
        if (urgente) {
            b.setCategory(NotificationCompat.CATEGORY_ALARM).setFullScreenIntent(abrirApp(id + 100), true);
        }
        try {
            NotificationManagerCompat.from(this).notify(id, b.build());
        } catch (SecurityException ignored) { }
    }

    private Notification avisoFixo() {
        return new NotificationCompat.Builder(this, CANAL_FIXO)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("Central Fortaleza Mov ativa")
                .setContentText("Avisa SOS e cadastros novos mesmo com o aplicativo fechado.")
                .setOngoing(true)
                .setContentIntent(abrirApp(1))
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void criarCanais() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager g = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (g == null) return;
        if (g.getNotificationChannel(CANAL_FIXO) == null) {
            NotificationChannel fixo = new NotificationChannel(CANAL_FIXO, "Central ativa", NotificationManager.IMPORTANCE_LOW);
            fixo.setDescription("Aviso fixo enquanto a Central vigia SOS e cadastros. Não toca.");
            fixo.setShowBadge(false);
            fixo.setSound(null, null);
            g.createNotificationChannel(fixo);
        }
        if (g.getNotificationChannel(CANAL_SOS) == null) {
            NotificationChannel sos = new NotificationChannel(CANAL_SOS, "SOS", NotificationManager.IMPORTANCE_HIGH);
            sos.setDescription("Pedido de socorro de passageiro ou motorista.");
            // O som e o do alarme (passa pelo silencioso); o canal fica mudo.
            sos.setSound(null, null);
            sos.enableVibration(false);
            sos.setBypassDnd(true);
            sos.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            g.createNotificationChannel(sos);
        }
        if (g.getNotificationChannel(CANAL_CADASTRO) == null) {
            NotificationChannel c = new NotificationChannel(CANAL_CADASTRO, "Cadastros e avisos", NotificationManager.IMPORTANCE_HIGH);
            c.setDescription("Motorista novo esperando aprovação.");
            c.enableVibration(true);
            g.createNotificationChannel(c);
        }
    }
}
