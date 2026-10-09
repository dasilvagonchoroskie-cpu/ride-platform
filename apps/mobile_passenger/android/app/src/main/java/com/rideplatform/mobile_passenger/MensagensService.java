package com.rideplatform.mobile_passenger;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Push (Firebase) do passageiro: cada etapa da corrida (motorista a
 * caminho, chegou, viagem iniciada, concluida, cancelada) chega mesmo com o
 * aplicativo fechado.
 */
public class MensagensService extends FirebaseMessagingService {

    private static final String CANAL = "passageiro_avisos_v1";

    @Override
    public void onNewToken(String token) {
        getSharedPreferences("fortaleza_corrida", MODE_PRIVATE).edit().putString("push_token", token).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage mensagem) {
        Map<String, String> d = mensagem.getData();
        if (!"corrida".equals(d.get("tipo"))) return;
        // Com o vigia da corrida de pe, os avisos ja saem por ele.
        if (CorridaService.ativo) return;
        String titulo = d.get("titulo") != null ? d.get("titulo") : "Fortaleza Mov";
        String texto = d.get("texto") != null ? d.get("texto") : "";
        String evento = d.get("evento") != null ? d.get("evento") : "";

        Context c = getApplicationContext();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager g = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (g != null && g.getNotificationChannel(CANAL) == null) {
                NotificationChannel canal = new NotificationChannel(CANAL, "Avisos da corrida", NotificationManager.IMPORTANCE_HIGH);
                canal.setDescription("Motorista a caminho, motorista chegou, mensagens e fim da corrida.");
                canal.enableVibration(true);
                canal.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                g.createNotificationChannel(canal);
            }
        }
        Intent abrir = new Intent(c, MainActivity.class);
        abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent toque = PendingIntent.getActivity(c, 6200, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(c, CANAL)
                .setSmallIcon(android.R.drawable.ic_dialog_map)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(toque)
                .setAutoCancel(true)
                .build();
        try {
            NotificationManagerCompat.from(c).notify(6200 + Math.abs(evento.hashCode() % 50), n);
        } catch (SecurityException ignored) { }
    }
}
