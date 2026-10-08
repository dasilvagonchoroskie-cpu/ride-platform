package com.rideplatform.mobile_driver;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Login do aplicativo visto pelo codigo nativo (servicos que rodam com o
 * aplicativo fechado).
 *
 * O acesso vence de tempos em tempos. Antes, o vigia nativo recebia 401 e
 * simplesmente parava — e o motorista deixava de ouvir chamados sem saber.
 * Agora ele le o login do mesmo lugar que o aplicativo (as preferencias do
 * Flutter), renova sozinho com o refresh token e grava o par novo de volta,
 * para o aplicativo e o vigia nunca usarem um refresh ja trocado.
 */
public final class Sessao {

    private Sessao() { }

    private static final String ARQUIVO_FLUTTER = "FlutterSharedPreferences";
    private static final String CHAVE_ACESSO = "flutter.ride.accessToken";
    private static final String CHAVE_REFRESH = "flutter.ride.refreshToken";

    private static SharedPreferences flutter(Context c) {
        return c.getApplicationContext().getSharedPreferences(ARQUIVO_FLUTTER, Context.MODE_PRIVATE);
    }

    /** Acesso atual do aplicativo (ou o reserva, se o aplicativo nao tiver). */
    public static String acesso(Context c, String reserva) {
        String t = flutter(c).getString(CHAVE_ACESSO, null);
        return t != null && !t.isEmpty() ? t : (reserva == null ? "" : reserva);
    }

    /**
     * Renova o login depois de um 401 com [usado]. Devolve o acesso novo, ou
     * null se o login acabou de vez (precisa entrar de novo no aplicativo).
     */
    public static synchronized String renovar(Context c, String api, String usado) {
        SharedPreferences p = flutter(c);
        String atual = p.getString(CHAVE_ACESSO, null);
        // O aplicativo ja renovou enquanto esperavamos: usa o novo.
        if (atual != null && !atual.isEmpty() && !atual.equals(usado)) return atual;
        String refresh = p.getString(CHAVE_REFRESH, null);
        if (refresh == null || refresh.isEmpty()) return null;
        try {
            HttpURLConnection con = (HttpURLConnection) new URL(api + "/api/auth/refresh").openConnection();
            con.setRequestMethod("POST");
            con.setConnectTimeout(15000);
            con.setReadTimeout(15000);
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            JSONObject corpo = new JSONObject();
            corpo.put("refreshToken", refresh);
            try (OutputStream s = con.getOutputStream()) {
                s.write(corpo.toString().getBytes(StandardCharsets.UTF_8));
            }
            int codigo = con.getResponseCode();
            if (codigo >= 500) return usado; // servidor acordando: tenta depois com o mesmo
            if (codigo >= 400) {
                // Outro lado (o aplicativo) pode ter trocado o refresh agora mesmo.
                String depois = p.getString(CHAVE_REFRESH, null);
                if (depois != null && !depois.equals(refresh)) return p.getString(CHAVE_ACESSO, null);
                return null;
            }
            StringBuilder r = new StringBuilder();
            try (BufferedReader l = new BufferedReader(new InputStreamReader(con.getInputStream(), StandardCharsets.UTF_8))) {
                String linha;
                while ((linha = l.readLine()) != null) r.append(linha);
            }
            JSONObject d = new JSONObject(r.toString()).optJSONObject("data");
            if (d == null) return null;
            String novo = d.optString("accessToken", "");
            String novoRefresh = d.optString("refreshToken", "");
            if (novo.isEmpty()) return null;
            SharedPreferences.Editor e = p.edit().putString(CHAVE_ACESSO, novo);
            if (!novoRefresh.isEmpty()) e.putString(CHAVE_REFRESH, novoRefresh);
            e.commit();
            return novo;
        } catch (Exception e) {
            // Sem rede: nao e login vencido. Tenta de novo na proxima volta.
            return usado;
        }
    }
}
