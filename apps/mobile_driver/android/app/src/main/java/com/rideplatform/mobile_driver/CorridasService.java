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
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
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
 *  1. Pergunta ao servidor por chamado novo e o servidor SEGURA a pergunta
 *     por ate 25 s: o chamado chega na hora em que e oferecido (09/10/2026,
 *     "ta demorando para notificar").
 *  2. Manda a posicao do motorista, para o servidor saber quem esta perto —
 *     inclusive PARADO (antes, parado no ponto, ele saia da busca em 2 min).
 *  3. Quando chega chamado: toca como ALARME (passa pelo modo silencioso),
 *     vibra e abre a TELA DE CHAMADO nativa (ChamadoActivity) por cima de
 *     qualquer coisa — outro aplicativo, tela inicial ou tela bloqueada —
 *     com o botao de deslizar para aceitar.
 *
 * De brinde, cada motorista disponivel mantem o servidor acordado.
 */
public class CorridasService extends Service {

    public static final String ACAO_INICIAR = "INICIAR";
    public static final String ACAO_PARAR = "PARAR";
    public static final String ACAO_PARAR_ALARME = "PARAR_ALARME";

    private static final String CANAL_FIXO = "motorista_disponivel_v1";
    private static final String CANAL_CHAMADA = "motorista_chamada_v1";
    private static final String CANAL_CARTEIRA = "motorista_carteira_v1";
    private static final int ID_CARTEIRA = 5103;
    private static final int ID_FIXO = 5101;
    public static final int ID_CHAMADA = 5102;

    /** Pausa entre perguntas quando a anterior falhou (sem rede). */
    private static final long INTERVALO_MS = 4000;
    /** Quanto o servidor segura a pergunta esperando chamado. */
    private static final int ESPERA_SERVIDOR_S = 25;
    private static final long POSICAO_MIN_MS = 10000;
    /** Parado: manda a ultima posicao pelo menos a cada 45 s. */
    private static final long POSICAO_MAX_MS = 45000;
    private static final long CARTEIRA_MS = 20000;
    private static final int ID_SESSAO = 5104;

    private static final String PREFS = "fortaleza_corridas";

    private volatile boolean rodando = false;
    private Thread vigia;
    private String api = "";
    private String token = "";

    private final Handler principal = new Handler(Looper.getMainLooper());

    private PowerManager.WakeLock trava;
    private LocationManager gps;
    private long ultimaPosicaoMs = 0;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        criarCanais(this);
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
        token = Sessao.acesso(this, token);
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

    private long carteiraEm = 0;

    /** Resultado de uma pergunta: falhou, sem chamado novo, chamado aberto. */
    private static final int FALHOU = -1, NADA = 0, TEM = 1;

    private void laco() {
        while (rodando) {
            int r;
            try {
                r = conferirChamados();
            } catch (Exception e) {
                r = FALHOU;
            }
            long agora = System.currentTimeMillis();
            if (agora - carteiraEm >= CARTEIRA_MS) {
                carteiraEm = agora;
                try {
                    conferirCarteira();
                } catch (Exception ignored) { }
            }
            posicaoParado();
            segurarProcessador();
            try {
                // Sem chamado: o servidor ja esperou; pergunta de novo logo.
                // Chamado aberto (ja mostrado): pergunta devagar ate ele sair.
                // Falha de rede: espera um pouco antes de tentar de novo.
                Thread.sleep(r == NADA ? 300 : (r == TEM ? 2500 : INTERVALO_MS));
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    private int conferirChamados() throws Exception {
        // Ja ha chamado na tela: nao segura a pergunta (so confere se continua).
        boolean mostrando = ChamadoActivity.aberta != null;
        JSONObject corpo = requisitar("GET", "/api/driver/rides/offers" + (mostrando ? "" : "?aguardar=" + ESPERA_SERVIDOR_S), null);
        if (corpo == null || !corpo.optBoolean("success", false)) return FALHOU;
        JSONArray lista = corpo.optJSONArray("data");
        if (lista == null || lista.length() == 0) return NADA;

        JSONObject oferta = lista.getJSONObject(0);
        String id = oferta.optString("rideId", "");
        String expira = oferta.optString("expiresAt", "");
        // Corrida + prazo: a Central reenviando a mesma corrida toca de novo.
        if (id.isEmpty() || !Sirene.primeiraVez(id + "|" + expira)) return TEM;

        long duracao = Sirene.duracaoAte(expira);
        principal.post(() -> chamar(oferta, duracao));
        return TEM;
    }

    /**
     * Chamado visto pelo aplicativo aberto (o vigia pode estar parado ou
     * ainda nao ter consultado): toca do mesmo jeito, uma vez so.
     */
    public static void chamadaDoApp(Context c, String rideId, String expira, String embarque, String destino) {
        if (rideId == null || rideId.isEmpty() || !Sirene.primeiraVez(rideId + "|" + (expira == null ? "" : expira))) return;
        Sirene.tocar(c, Sirene.duracaoAte(expira));
    }

    /**
     * Carteira pre-paga: quando a Central lanca uma recarga (ou o saldo
     * acaba), o motorista fica sabendo por notificacao mesmo com o
     * aplicativo fechado, e o aviso fixo mostra o saldo.
     */
    private void conferirCarteira() throws Exception {
        JSONObject corpo = requisitar("GET", "/api/driver/wallet/resumo", null);
        if (corpo == null || !corpo.optBoolean("success", false)) return;
        JSONObject d = corpo.optJSONObject("data");
        if (d == null) return;
        long saldo = d.optLong("balanceCents", 0);
        boolean bloqueado = d.optBoolean("blocking", false);
        JSONObject ultimo = d.optJSONObject("last");
        String idUltimo = ultimo != null ? ultimo.optString("id", "") : "";

        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        String visto = p.getString("carteira_ultimo", null);
        boolean estavaBloqueado = p.getBoolean("carteira_bloqueado", false);
        p.edit().putString("carteira_ultimo", idUltimo).putBoolean("carteira_bloqueado", bloqueado).apply();

        final String textoFixo = bloqueado
                ? "Sem saldo: recarregue para receber corridas."
                : "Aguardando chamados. Saldo " + reais(saldo) + ".";
        principal.post(() -> atualizarFixo(textoFixo));

        // Primeira consulta deste aparelho: so guarda, nao avisa.
        if (visto == null) return;
        if (ultimo != null && !idUltimo.isEmpty() && !idUltimo.equals(visto)
                && "CREDIT".equals(ultimo.optString("kind", ""))) {
            long valor = ultimo.optLong("amountCents", 0);
            avisarCarteira("Recarga confirmada: +" + reais(valor),
                    "Saldo da carteira: " + reais(saldo) + ".");
        } else if (bloqueado && !estavaBloqueado) {
            avisarCarteira("Saldo insuficiente",
                    "Você não recebe corridas até fazer uma recarga com a Central. Saldo: " + reais(saldo) + ".");
        }
    }

    private static String reais(long cents) {
        String sinal = cents < 0 ? "-" : "";
        long a = Math.abs(cents);
        return sinal + "R$ " + (a / 100) + "," + String.format(java.util.Locale.ROOT, "%02d", a % 100);
    }

    private void atualizarFixo(String texto) {
        try {
            NotificationManagerCompat.from(this).notify(ID_FIXO, avisoFixo(texto));
        } catch (SecurityException ignored) { }
    }

    private void avisarCarteira(String titulo, String texto) {
        Intent abrir = new Intent(this, MainActivity.class);
        abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent toque = PendingIntent.getActivity(this, 9, abrir,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification aviso = new NotificationCompat.Builder(this, CANAL_CARTEIRA)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(toque)
                .setAutoCancel(true)
                .build();
        principal.post(() -> {
            try {
                NotificationManagerCompat.from(this).notify(ID_CARTEIRA, aviso);
            } catch (SecurityException ignored) { }
        });
    }

    private JSONObject requisitar(String metodo, String caminho, JSONObject corpo) throws Exception {
        return requisitar(metodo, caminho, corpo, true);
    }

    private JSONObject requisitar(String metodo, String caminho, JSONObject corpo, boolean renovarSe401) throws Exception {
        // O login mais novo e sempre o que o aplicativo guardou.
        token = Sessao.acesso(this, token);
        HttpURLConnection c = (HttpURLConnection) new URL(api + caminho).openConnection();
        c.setRequestMethod(metodo);
        c.setConnectTimeout(15000);
        // A pergunta por chamado fica ate 25 s no servidor esperando.
        c.setReadTimeout(caminho.contains("aguardar=") ? 40000 : 15000);
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
                if (!renovarSe401) return null;
                // Acesso vencido: renova sozinho (antes o vigia parava aqui
                // e o motorista deixava de receber chamados sem saber).
                String usado = token;
                String novo = Sessao.renovar(this, api, usado);
                if (novo == null) {
                    avisarSessaoVencida();
                    rodando = false;
                    principal.post(this::encerrar);
                    return null;
                }
                if (novo.equals(usado)) return null; // sem rede agora: tenta na proxima volta
                token = novo;
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("token", novo).apply();
                return requisitar(metodo, caminho, corpo, false);
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

    private void avisarSessaoVencida() {
        Intent abrir = new Intent(this, MainActivity.class);
        abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent toque = PendingIntent.getActivity(this, 11, abrir,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String texto = "Abra o aplicativo e entre de novo para voltar a receber corridas.";
        Notification aviso = new NotificationCompat.Builder(this, CANAL_CARTEIRA)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle("Você parou de receber corridas")
                .setContentText(texto)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(toque)
                .setAutoCancel(true)
                .build();
        principal.post(() -> {
            try {
                NotificationManagerCompat.from(this).notify(ID_SESSAO, aviso);
            } catch (SecurityException ignored) { }
        });
    }

    private void chamar(JSONObject oferta, long duracao) {
        // Aplicativo aberto na frente: ele mostra a propria tela de chamado
        // (com o mapa) — so avisa para buscar agora e toca.
        if (MainActivity.visivel) {
            MainActivity.avisarFlutter("chamadoNovo", oferta.optString("rideId", ""));
            Sirene.tocar(this, duracao);
            return;
        }
        abrirChamado(this, oferta, duracao);
    }

    /**
     * Toca o alarme e abre a tela de chamado nativa (tambem usado pelo botao
     * "Testar a tela de chamado"). O aviso de tela cheia acende e cobre a
     * tela bloqueada; com "sobrepor a outros apps" liberado, a tela abre por
     * cima de qualquer coisa tambem com o celular desbloqueado.
     */
    public static void abrirChamado(Context c, JSONObject oferta, long duracao) {
        criarCanais(c);
        String embarque = oferta.optString("pickupAddress", "");
        String destino = oferta.optString("dropoffAddress", "");

        Intent abrir = new Intent(c, ChamadoActivity.class);
        abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        abrir.putExtra(ChamadoActivity.EXTRA_OFERTA, oferta.toString());

        int marcas = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent telaCheia = PendingIntent.getActivity(c, 7, abrir, marcas);

        Notification aviso = new NotificationCompat.Builder(c, CANAL_CHAMADA)
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
                .setTimeoutAfter(duracao)
                .build();
        try {
            NotificationManagerCompat.from(c).notify(ID_CHAMADA, aviso);
        } catch (SecurityException ignored) { }

        Sirene.tocar(c, duracao);

        try {
            if (Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c)) {
                c.startActivity(abrir);
            }
        } catch (Exception ignored) { }
    }

    /**
     * Motorista parado (GPS nao manda posicao se ele nao anda 20 m): a cada
     * 45 s manda a ultima posicao conhecida, para continuar na busca.
     */
    private void posicaoParado() {
        if (System.currentTimeMillis() - ultimaPosicaoMs < POSICAO_MAX_MS) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) return;
        try {
            if (gps == null) gps = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            Location melhor = null;
            for (String fonte : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER }) {
                Location l = gps.getLastKnownLocation(fonte);
                if (l != null && (melhor == null || l.getTime() > melhor.getTime())) melhor = l;
            }
            if (melhor != null) enviarPosicao(melhor);
        } catch (SecurityException ignored) { }
    }

    private void pararAlarme() {
        Sirene.parar();
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

    static void criarCanais(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager g = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
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
        if (g.getNotificationChannel(CANAL_CARTEIRA) == null) {
            NotificationChannel carteira = new NotificationChannel(
                    CANAL_CARTEIRA, "Carteira e recargas", NotificationManager.IMPORTANCE_DEFAULT);
            carteira.setDescription("Avisa quando a Central confirma uma recarga ou o saldo acaba.");
            g.createNotificationChannel(carteira);
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
