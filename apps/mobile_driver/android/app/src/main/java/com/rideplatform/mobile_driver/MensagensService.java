package com.rideplatform.mobile_driver;

import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Push (Firebase) do motorista: "chamado" chega mesmo se o Android fechou o
 * aplicativo e o vigia. Busca o chamado no servidor, abre a tela de chamado
 * em tela cheia e tenta religar o vigia.
 */
public class MensagensService extends FirebaseMessagingService {

    @Override
    public void onNewToken(String token) {
        // O aplicativo manda o endereco novo ao servidor na proxima abertura.
        getSharedPreferences("fortaleza_corridas", MODE_PRIVATE).edit().putString("push_token", token).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage mensagem) {
        String tipo = mensagem.getData().get("tipo");
        if (!"chamado".equals(tipo)) return;
        final Context c = getApplicationContext();

        // O vigia caiu? Religa (o Android deixa por alguns segundos depois de
        // um push de alta prioridade).
        try {
            Intent vigia = new Intent(c, CorridasService.class).setAction(CorridasService.ACAO_INICIAR);
            ContextCompat.startForegroundService(c, vigia);
        } catch (Exception ignored) { }

        // Este metodo ja roda fora da tela: pode usar a rede direto.
        Servidor.Resposta r = Servidor.pedir(c, "GET", "/api/driver/rides/offers", null);
        if (!r.ok() || r.corpo == null) return;
        JSONArray lista = r.corpo.optJSONArray("data");
        if (lista == null || lista.length() == 0) return;
        final JSONObject oferta = lista.optJSONObject(0);
        if (oferta == null) return;
        final String id = oferta.optString("rideId", "");
        String expira = oferta.optString("expiresAt", "");
        if (id.isEmpty() || !Sirene.primeiraVez(id + "|" + expira)) return;
        final long duracao = Sirene.duracaoAte(expira);
        new Handler(Looper.getMainLooper()).post(() -> {
            if (MainActivity.visivel) {
                MainActivity.avisarFlutter("chamadoNovo", id);
                Sirene.tocar(c, duracao);
            } else {
                CorridasService.abrirChamado(c, oferta, duracao);
            }
        });
    }
}
