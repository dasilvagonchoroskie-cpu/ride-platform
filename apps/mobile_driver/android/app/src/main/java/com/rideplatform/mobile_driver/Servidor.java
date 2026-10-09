package com.rideplatform.mobile_driver;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Conversa com o servidor a partir do codigo nativo (tela de chamado com o
 * aplicativo fechado). Usa o endereco que o vigia guardou e o login do
 * aplicativo, renovando sozinho se o acesso venceu.
 */
public final class Servidor {

    private Servidor() { }

    /** Resposta: codigo HTTP (0 = sem rede) e o corpo em JSON (ou null). */
    public static final class Resposta {
        public final int codigo;
        public final JSONObject corpo;

        Resposta(int codigo, JSONObject corpo) {
            this.codigo = codigo;
            this.corpo = corpo;
        }

        public boolean ok() {
            return codigo >= 200 && codigo < 300;
        }

        /** Mensagem de erro do servidor (ou uma padrao). */
        public String mensagem(String padrao) {
            if (corpo == null) return padrao;
            JSONObject erro = corpo.optJSONObject("error");
            String m = erro != null ? erro.optString("message", "") : "";
            return m.isEmpty() ? padrao : m;
        }
    }

    public static String api(Context c) {
        SharedPreferences p = c.getApplicationContext().getSharedPreferences("fortaleza_corridas", Context.MODE_PRIVATE);
        return p.getString("api", "");
    }

    public static Resposta pedir(Context c, String metodo, String caminho, JSONObject corpo) {
        String api = api(c);
        if (api.isEmpty()) return new Resposta(0, null);
        String token = Sessao.acesso(c, "");
        Resposta r = enviar(api, token, metodo, caminho, corpo);
        if (r.codigo == 401) {
            String novo = Sessao.renovar(c, api, token);
            if (novo != null && !novo.equals(token)) r = enviar(api, novo, metodo, caminho, corpo);
        }
        return r;
    }

    private static Resposta enviar(String api, String token, String metodo, String caminho, JSONObject corpo) {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(api + caminho).openConnection();
            con.setRequestMethod(metodo);
            con.setConnectTimeout(15000);
            con.setReadTimeout(20000);
            con.setRequestProperty("Authorization", "Bearer " + token);
            con.setRequestProperty("Content-Type", "application/json");
            if (corpo != null) {
                con.setDoOutput(true);
                try (OutputStream s = con.getOutputStream()) {
                    s.write(corpo.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            int codigo = con.getResponseCode();
            InputStream entrada = codigo >= 400 ? con.getErrorStream() : con.getInputStream();
            JSONObject json = null;
            if (entrada != null) {
                StringBuilder b = new StringBuilder();
                try (BufferedReader l = new BufferedReader(new InputStreamReader(entrada, StandardCharsets.UTF_8))) {
                    String linha;
                    while ((linha = l.readLine()) != null) b.append(linha);
                }
                try {
                    json = b.length() == 0 ? null : new JSONObject(b.toString());
                } catch (Exception ignored) {
                    json = null;
                }
            }
            return new Resposta(codigo, json);
        } catch (Exception e) {
            return new Resposta(0, null);
        } finally {
            if (con != null) con.disconnect();
        }
    }
}
