package com.rideplatform.mobile_passenger;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Acompanha a corrida do passageiro com o aplicativo fechado ou em segundo
 * plano (Evandro, 08/10/2026: "reforcar os alarmes, os aplicativos nao estao
 * alarmando").
 *
 * Sem este servico, o Android congela o aplicativo minimizado e o
 * passageiro so ficava sabendo que o motorista aceitou ou chegou quando
 * abria o aplicativo de novo. Agora, a cada 5 s, ele pergunta ao servidor
 * e avisa com som e notificacao:
 *  - motorista a caminho (nome, carro e placa);
 *  - motorista chegou (toca por alguns segundos);
 *  - viagem iniciada, mensagem nova do motorista;
 *  - corrida concluida (pede a avaliacao), cancelada ou sem motorista.
 * Quando a corrida termina, o servico se desliga sozinho.
 */
public class CorridaService extends Service {

    public static final String ACAO_INICIAR = "INICIAR";
    public static final String ACAO_PARAR = "PARAR";

    private static final String CANAL_FIXO = "passageiro_corrida_v1";
    private static final String CANAL_AVISO = "passageiro_avisos_v1";
    private static final int ID_FIXO = 6101;
    private static final int ID_AVISO = 6102;
    private static final int ID_MENSAGEM = 6103;
    private static final long INTERVALO_MS = 5000;
    private static final String PREFS = "fortaleza_corrida";

    private volatile boolean rodando = false;

    /** Vigia de pe: os avisos da corrida saem por ele (o push nao repete). */
    public static volatile boolean ativo = false;
    private Thread vigia;
    private String api = "";
    private String token = "";
    private String rideId = "";
    private String ultimoStatus = null;
    private int ultimasMensagens = -1;
    private final Handler principal = new Handler(Looper.getMainLooper());
    private MediaPlayer toque;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        ativo = true;
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
            String novo = intent.getStringExtra("rideId");
            if (novo != null && !novo.equals(rideId)) {
                rideId = novo;
                ultimoStatus = p.getString("status_" + novo, null);
                ultimasMensagens = -1;
            }
            p.edit().putString("api", api).putString("rideId", rideId).apply();
        } else {
            api = p.getString("api", "");
            rideId = p.getString("rideId", "");
            ultimoStatus = p.getString("status_" + rideId, null);
        }
        token = Sessao.acesso(this, token);
        if (api.isEmpty() || rideId.isEmpty() || token.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            Notification fixo = avisoFixo("Acompanhando sua corrida.");
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(ID_FIXO, fixo, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(ID_FIXO, fixo);
            }
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!rodando) {
            rodando = true;
            vigia = new Thread(this::laco, "vigia-corrida-passageiro");
            vigia.start();
        }
        return START_STICKY;
    }

    /** Android 15+: servico de sincronia tem limite de horas por dia. */
    public void onTimeout(int startId, int fgsType) {
        encerrar();
    }

    @Override
    public void onDestroy() {
        ativo = false;
        encerrar();
        super.onDestroy();
    }

    private void encerrar() {
        rodando = false;
        if (vigia != null) vigia.interrupt();
        pararToque();
        try { stopForeground(true); } catch (Exception ignored) { }
        stopSelf();
    }

    private void laco() {
        while (rodando) {
            try {
                conferir();
            } catch (Exception ignored) {
                // Sem rede nesta volta: tenta de novo na proxima.
            }
            try {
                Thread.sleep(INTERVALO_MS);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    private void conferir() throws Exception {
        JSONObject r = requisitar("/api/rides/current");
        if (r == null || !r.optBoolean("success", false)) return;
        JSONObject dados = r.optJSONObject("data");
        JSONObject ride = dados != null ? dados.optJSONObject("ride") : null;
        if (ride == null) {
            terminou();
            return;
        }
        String id = ride.optString("id", "");
        if (!id.isEmpty() && !id.equals(rideId)) {
            rideId = id;
            ultimoStatus = null;
            ultimasMensagens = -1;
        }
        String status = ride.optString("status", "");
        int mensagens = ride.optInt("mensagensNaoLidas", 0);

        if (!status.equals(ultimoStatus)) {
            // Na primeira consulta so anota (o aplicativo ja mostra a situacao).
            if (ultimoStatus != null) mudou(ultimoStatus, status, ride);
            ultimoStatus = status;
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("status_" + rideId, status).apply();
            final String texto = textoFixo(status);
            principal.post(() -> atualizarFixo(texto));
        }
        if (ultimasMensagens >= 0 && mensagens > ultimasMensagens) {
            avisar(ID_MENSAGEM, "Nova mensagem do motorista", "Toque para abrir a conversa.", false);
        }
        ultimasMensagens = mensagens;
    }

    /** A corrida saiu das abertas: confere como terminou, avisa e desliga. */
    private void terminou() throws Exception {
        if (!rideId.isEmpty()) {
            JSONObject r = requisitar("/api/rides/" + rideId);
            JSONObject dados = r != null ? r.optJSONObject("data") : null;
            JSONObject ride = dados != null ? dados.optJSONObject("ride") : null;
            String status = ride != null ? ride.optString("status", "") : "";
            switch (status) {
                case "COMPLETED":
                    avisar(ID_AVISO, "Você chegou ao destino!", "Toque para avaliar o motorista.", false);
                    break;
                case "CANCELLED_BY_DRIVER":
                    avisar(ID_AVISO, "O motorista cancelou a corrida", "Abra o aplicativo para pedir outra.", false);
                    break;
                case "CANCELLED_BY_SYSTEM":
                    avisar(ID_AVISO, "A Central cancelou a corrida", "Abra o aplicativo para ver o motivo.", false);
                    break;
                case "EXPIRED":
                    avisar(ID_AVISO, "Nenhum motorista disponível agora", "Tente de novo em alguns minutos.", false);
                    break;
                default:
                    break;
            }
        }
        rodando = false;
        principal.postDelayed(this::encerrar, 7000);
    }

    private void mudou(String antes, String agora, JSONObject ride) {
        JSONObject driver = ride.optJSONObject("driver");
        JSONObject user = driver != null ? driver.optJSONObject("user") : null;
        JSONObject carro = ride.optJSONObject("vehicle");
        String nome = user != null ? user.optString("name", "Seu motorista") : "Seu motorista";
        String veiculo = carro != null
                ? (carro.optString("brand", "") + " " + carro.optString("model", "") + " " + carro.optString("color", "")).trim()
                : "";
        String placa = carro != null ? carro.optString("plate", "") : "";
        String carroTexto = veiculo + (placa.isEmpty() ? "" : " · placa " + placa);
        boolean procurando = "REQUESTED".equals(antes) || "SEARCHING".equals(antes) || "SCHEDULED".equals(antes);
        switch (agora) {
            case "DRIVER_ASSIGNED":
            case "DRIVER_ARRIVING":
                // Aceite + "a caminho" chegam juntos: avisa uma vez so.
                if (!("DRIVER_ASSIGNED".equals(antes) || "DRIVER_ARRIVING".equals(antes))) {
                    avisar(ID_AVISO, "Motorista a caminho!", nome + (carroTexto.isEmpty() ? "" : " — " + carroTexto), false);
                }
                break;
            case "DRIVER_WAITING":
                String pin = ride.optString("pin", "");
                avisar(ID_AVISO, "Seu motorista chegou!",
                        (carroTexto.isEmpty() ? nome : carroTexto) + " está te esperando no embarque."
                                + (pin.isEmpty() ? "" : " Código: " + pin), true);
                break;
            case "IN_PROGRESS":
                avisar(ID_AVISO, "Viagem iniciada", "Boa viagem! O valor aparece no aplicativo.", false);
                break;
            case "SEARCHING":
                if (!procurando) avisar(ID_AVISO, "Procurando outro motorista", "O motorista anterior não vai mais. Já estamos chamando outro.", false);
                break;
            default:
                break;
        }
    }

    private static String textoFixo(String status) {
        switch (status) {
            case "DRIVER_ASSIGNED":
            case "DRIVER_ARRIVING":
                return "Motorista a caminho.";
            case "DRIVER_WAITING":
                return "O motorista chegou e está te esperando.";
            case "IN_PROGRESS":
                return "Em viagem.";
            default:
                return "Procurando motorista.";
        }
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
            if (codigo == 401) {
                if (!renovarSe401) return null;
                String usado = token;
                String novo = Sessao.renovar(this, api, usado);
                if (novo == null) {
                    // Login acabou de vez: o aplicativo pede para entrar de novo.
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

    // ------------------------------------------------------------------
    // Avisos
    // ------------------------------------------------------------------

    private PendingIntent abrirApp(int codigo) {
        Intent abrir = new Intent(this, MainActivity.class);
        abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, codigo, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void avisar(int id, String titulo, String texto, boolean tocarMais) {
        Notification n = new NotificationCompat.Builder(this, CANAL_AVISO)
                .setSmallIcon(android.R.drawable.ic_dialog_map)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(abrirApp(id))
                .setAutoCancel(true)
                .build();
        principal.post(() -> {
            try {
                NotificationManagerCompat.from(this).notify(id, n);
            } catch (SecurityException ignored) { }
            if (tocarMais) Assobio.tocar(this, rideId + ":chegou");
        });
    }

    /** "Seu motorista chegou": toca o som de chamada por uns segundos. */
    private void tocarPorUnsSegundos() {
        pararToque();
        try {
            // Assobio curto proprio da plataforma (res/raw/aviso.ogg): igual em
            // qualquer celular. O toque do aparelho fica so de reserva.
            MediaPlayer m = new MediaPlayer();
            try {
                m.setDataSource(this, Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.aviso));
            } catch (Exception e) {
                Uri som = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                if (som == null) som = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                if (som == null) {
                    m.release();
                    return;
                }
                m.reset();
                m.setDataSource(this, som);
            }
            m.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            m.setLooping(true);
            m.prepare();
            m.start();
            toque = m;
            principal.postDelayed(this::pararToque, 8000);
        } catch (Exception ignored) {
            toque = null;
        }
    }

    private void pararToque() {
        try {
            if (toque != null) {
                toque.stop();
                toque.release();
            }
        } catch (Exception ignored) { }
        toque = null;
    }

    private void atualizarFixo(String texto) {
        try {
            NotificationManagerCompat.from(this).notify(ID_FIXO, avisoFixo(texto));
        } catch (SecurityException ignored) { }
    }

    private Notification avisoFixo(String texto) {
        return new NotificationCompat.Builder(this, CANAL_FIXO)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("Fortaleza Mov — sua corrida")
                .setContentText(texto)
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
            NotificationChannel fixo = new NotificationChannel(CANAL_FIXO, "Corrida em andamento", NotificationManager.IMPORTANCE_LOW);
            fixo.setDescription("Aviso fixo enquanto a corrida acontece. Não toca.");
            fixo.setShowBadge(false);
            fixo.setSound(null, null);
            g.createNotificationChannel(fixo);
        }
        if (g.getNotificationChannel(CANAL_AVISO) == null) {
            NotificationChannel aviso = new NotificationChannel(CANAL_AVISO, "Avisos da corrida", NotificationManager.IMPORTANCE_HIGH);
            aviso.setDescription("Motorista a caminho, motorista chegou, mensagens e fim da corrida.");
            aviso.enableVibration(true);
            aviso.setVibrationPattern(new long[]{0, 500, 250, 500});
            aviso.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            g.createNotificationChannel(aviso);
        }
    }
}
