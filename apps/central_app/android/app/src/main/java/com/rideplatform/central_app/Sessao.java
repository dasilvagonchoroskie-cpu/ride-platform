package com.rideplatform.central_app;

import android.content.Context;
import android.content.SharedPreferences;

import com.it_nomads.fluttersecurestorage.CofreNativo;

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
 * simplesmente parava — e a Central deixava de avisar sem ninguem saber.
 * Agora ele le o login do mesmo lugar que o aplicativo (agora o cofre do
 * celular, 13/11/2026, e nao mais as preferencias comuns do Flutter), renova sozinho com o refresh token e grava o par novo de volta,
 * para o aplicativo e o vigia nunca usarem um refresh ja trocado.
 */
public final class Sessao {

    private Sessao() { }

    private static final String ARQUIVO_FLUTTER = "FlutterSharedPreferences";
    // Arquivo comum (antes do cofre) e nomes no cofre (lib/core/storage/cofre.dart).
    private static final String CHAVE_ACESSO = "flutter.ride.accessToken";
    private static final String CHAVE_REFRESH = "flutter.ride.refreshToken";
    private static final String COFRE_ACESSO = "ride.accessToken";
    private static final String COFRE_REFRESH = "ride.refreshToken";

    private static SharedPreferences flutter(Context c) {
        return c.getApplicationContext().getSharedPreferences(ARQUIVO_FLUTTER, Context.MODE_PRIVATE);
    }

    /**
     * Le do cofre (Requisicao 1, 11/11/2026); se o cofre falhar ou ainda nao
     * tiver o valor (app de antes do cofre que nao abriu desde a atualizacao),
     * usa o arquivo comum.
     */
    private static String ler(Context c, String noCofre, String noComum) {
        try {
            String v = CofreNativo.ler(c, noCofre);
            if (v != null && !v.isEmpty()) return v;
        } catch (Exception ignorado) {
            // cofre com defeito neste aparelho: segue com o arquivo comum
        }
        return flutter(c).getString(noComum, null);
    }

    /** Grava no cofre e tira a copia do arquivo comum; se o cofre falhar, grava no comum. */
    private static void gravar(Context c, String noCofre, String noComum, String valor) {
        try {
            CofreNativo.gravar(c, noCofre, valor);
            flutter(c).edit().remove(noComum).commit();
        } catch (Exception e) {
            flutter(c).edit().putString(noComum, valor).commit();
        }
    }

    /** Acesso atual do aplicativo (ou o reserva, se o aplicativo nao tiver). */
    public static String acesso(Context c, String reserva) {
        String t = ler(c, COFRE_ACESSO, CHAVE_ACESSO);
        return t != null && !t.isEmpty() ? t : (reserva == null ? "" : reserva);
    }

    /**
     * Renova o login depois de um 401 com [usado]. Devolve o acesso novo, ou
     * null se o login acabou de vez (precisa entrar de novo no aplicativo).
     */
    public static synchronized String renovar(Context c, String api, String usado) {
        String atual = ler(c, COFRE_ACESSO, CHAVE_ACESSO);
        // O aplicativo ja renovou enquanto esperavamos: usa o novo.
        if (atual != null && !atual.isEmpty() && !atual.equals(usado)) return atual;
        String refresh = ler(c, COFRE_REFRESH, CHAVE_REFRESH);
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
                String depois = ler(c, COFRE_REFRESH, CHAVE_REFRESH);
                if (depois != null && !depois.equals(refresh)) return ler(c, COFRE_ACESSO, CHAVE_ACESSO);
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
            gravar(c, COFRE_ACESSO, CHAVE_ACESSO, novo);
            if (!novoRefresh.isEmpty()) gravar(c, COFRE_REFRESH, CHAVE_REFRESH, novoRefresh);
            return novo;
        } catch (Exception e) {
            // Sem rede: nao e login vencido. Tenta de novo na proxima volta.
            return usado;
        }
    }
}
