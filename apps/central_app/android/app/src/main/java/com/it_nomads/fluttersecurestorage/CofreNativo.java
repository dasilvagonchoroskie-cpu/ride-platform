package com.it_nomads.fluttersecurestorage;

import android.content.Context;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Cofre do celular visto pelo codigo nativo (Requisicao 1, 11/11/2026).
 *
 * Os servicos que rodam com o aplicativo fechado (chamadas do motorista,
 * acompanhamento da corrida) precisam ler e renovar o login. O login agora
 * fica no flutter_secure_storage; esta classe usa o MESMO armazenamento do
 * plugin (mesmo arquivo, mesma chave do Keystore, mesmas opcoes do lado Dart
 * em lib/core/storage/cofre.dart), para app e servico nunca terem copias
 * diferentes do login.
 *
 * Fica no pacote do plugin porque a preparacao do cofre (initialize) nao e
 * publica. A versao do plugin esta TRAVADA no pubspec (10.0.0): a esteira
 * so compila se esta API continuar igual.
 */
public final class CofreNativo {

    private CofreNativo() { }

    private static FlutterSecureStorage cofre;

    /** As mesmas opcoes que AndroidOptions(resetOnError: false) manda do Dart. */
    private static Map<String, Object> opcoes() {
        Map<String, Object> o = new HashMap<>();
        o.put("encryptedSharedPreferences", "false");
        o.put("resetOnError", "false");
        o.put("migrateOnAlgorithmChange", "true");
        o.put("enforceBiometrics", "false");
        o.put("keyCipherAlgorithm", "RSA_ECB_OAEPwithSHA_256andMGF1Padding");
        o.put("storageCipherAlgorithm", "AES_GCM_NoPadding");
        o.put("sharedPreferencesName", "");
        o.put("preferencesKeyPrefix", "");
        return o;
    }

    private static synchronized FlutterSecureStorage pronto(Context c) throws Exception {
        if (cofre != null) return cofre;
        FlutterSecureStorage s = new FlutterSecureStorage(c.getApplicationContext());
        final Exception[] erro = new Exception[1];
        final CountDownLatch fim = new CountDownLatch(1);
        s.initialize(new FlutterSecureStorageConfig(opcoes()), new SecurePreferencesCallback<Void>() {
            @Override
            public void onSuccess(Void r) {
                fim.countDown();
            }

            @Override
            public void onError(Exception e) {
                erro[0] = e;
                fim.countDown();
            }
        });
        if (!fim.await(10, TimeUnit.SECONDS)) throw new Exception("cofre demorou para abrir");
        if (erro[0] != null) throw erro[0];
        cofre = s;
        return s;
    }

    /** Valor guardado pelo app (ou null). Lanca excecao se o cofre falhar. */
    public static String ler(Context c, String chave) throws Exception {
        FlutterSecureStorage s = pronto(c);
        String k = s.addPrefixToKey(chave);
        return s.containsKey(k) ? s.read(k) : null;
    }

    /** Grava no cofre. Lanca excecao se o cofre falhar. */
    public static void gravar(Context c, String chave, String valor) throws Exception {
        FlutterSecureStorage s = pronto(c);
        s.write(s.addPrefixToKey(chave), valor);
    }
}
