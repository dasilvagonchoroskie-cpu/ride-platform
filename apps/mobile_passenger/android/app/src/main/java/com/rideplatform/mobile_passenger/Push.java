package com.rideplatform.mobile_passenger;

import android.content.Context;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Endereco de notificacao push (Firebase) deste celular. So funciona depois
 * que os dados do projeto Firebase entram no aplicativo (firebase.xml);
 * antes disso devolve null e o aplicativo segue com o vigia proprio.
 */
public final class Push {

    private Push() { }

    public interface Resposta {
        void token(String token);
    }

    public static boolean disponivel(Context c) {
        try {
            if (!FirebaseApp.getApps(c).isEmpty()) return true;
            return FirebaseApp.initializeApp(c) != null;
        } catch (Exception e) {
            return false;
        }
    }

    public static void token(Context c, Resposta r) {
        if (!disponivel(c)) {
            r.token(null);
            return;
        }
        try {
            FirebaseMessaging.getInstance().getToken()
                    .addOnCompleteListener(t -> r.token(t.isSuccessful() ? t.getResult() : null));
        } catch (Exception e) {
            r.token(null);
        }
    }
}
