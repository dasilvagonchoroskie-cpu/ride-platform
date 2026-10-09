package com.rideplatform.mobile_driver;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Tela de CHAMADO em tela cheia (Evandro, 09/10/2026: "com o telefone parado
 * e a tela desligada, tem que imediatamente abrir a tela cheia mostrando o
 * chamado e o botao de deslizar para aceitar").
 *
 * E uma tela nativa (nao Flutter) de proposito: abre na hora, por cima da
 * tela bloqueada, sem esperar o aplicativo carregar. Aceitar = deslizar para
 * o lado; o aceite vai direto ao servidor e o aplicativo abre ja na corrida.
 */
public class ChamadoActivity extends Activity {

    public static final String EXTRA_OFERTA = "oferta";

    private static final int AZUL = Color.parseColor("#1E5BB8");
    private static final int VERDE = Color.parseColor("#1F9D55");
    private static final int FUNDO = Color.parseColor("#0E1116");
    private static final int CARTAO = Color.parseColor("#1A1F27");
    private static final int TEXTO_FRACO = Color.parseColor("#9AA4B2");

    /** Tela de chamado aberta agora (o vigia nao abre outra por cima). */
    public static volatile String aberta = null;

    private final Handler principal = new Handler(Looper.getMainLooper());
    private JSONObject oferta;
    private String rideId = "";
    private long venceEm = 0;
    private TextView contador;
    private ProgressBar barra;
    private TextView situacao;
    private Deslizar deslizar;
    private Button recusar;
    private boolean respondido = false;
    private int totalSegundos = 25;

    private final Runnable relogio = new Runnable() {
        @Override
        public void run() {
            long resta = Math.max(0, venceEm - System.currentTimeMillis());
            int s = (int) Math.ceil(resta / 1000.0);
            if (contador != null) contador.setText(s + " s");
            if (barra != null) barra.setProgress(Math.min(totalSegundos, s));
            if (resta <= 0) {
                if (!respondido) encerrar("Tempo esgotado. O chamado foi para outro motorista.", 1500);
                return;
            }
            principal.postDelayed(this, 250);
        }
    };

    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        acenderTela();
        lerOferta(getIntent());
        montarTela();
        principal.post(relogio);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // Chegou outro chamado com esta tela ainda aberta (o anterior venceu).
        principal.removeCallbacks(relogio);
        respondido = false;
        acenderTela();
        lerOferta(intent);
        montarTela();
        principal.post(relogio);
    }

    @Override
    protected void onDestroy() {
        principal.removeCallbacks(relogio);
        if (rideId.equals(aberta)) aberta = null;
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // Voltar nao some com o chamado sem resposta: o motorista decide.
        if (respondido) super.onBackPressed();
    }

    private void acenderTela() {
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void lerOferta(Intent i) {
        try {
            oferta = new JSONObject(i.getStringExtra(EXTRA_OFERTA));
        } catch (Exception e) {
            oferta = new JSONObject();
        }
        rideId = oferta.optString("rideId", "");
        aberta = rideId;
        venceEm = quando(oferta.optString("expiresAt", ""));
        if (venceEm <= System.currentTimeMillis()) venceEm = System.currentTimeMillis() + 20000;
        totalSegundos = (int) Math.max(5, Math.ceil((venceEm - System.currentTimeMillis()) / 1000.0));
    }

    private static long quando(String iso) {
        if (iso == null || iso.isEmpty()) return 0;
        String[] formatos = {"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'"};
        for (String f : formatos) {
            try {
                SimpleDateFormat sdf = new SimpleDateFormat(f, Locale.ROOT);
                sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date d = sdf.parse(iso);
                if (d != null) return d.getTime();
            } catch (Exception ignored) { }
        }
        return 0;
    }

    // ------------------------------------------------------------------
    // Tela
    // ------------------------------------------------------------------

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private TextView texto(String t, float tamanho, int cor, boolean negrito) {
        TextView v = new TextView(this);
        v.setText(t);
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, tamanho);
        v.setTextColor(cor);
        if (negrito) v.setTypeface(Typeface.DEFAULT_BOLD);
        return v;
    }

    private static String reais(long cents) {
        long a = Math.abs(cents);
        return (cents < 0 ? "-" : "") + "R$ " + (a / 100) + "," + String.format(Locale.ROOT, "%02d", a % 100);
    }

    private static String km(double metros) {
        if (metros < 1000) return Math.round(metros) + " m";
        return String.format(new Locale("pt", "BR"), "%.1f km", metros / 1000.0);
    }

    private LinearLayout cartao() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable fundo = new GradientDrawable();
        fundo.setColor(CARTAO);
        fundo.setCornerRadius(dp(14));
        c.setBackground(fundo);
        c.setPadding(dp(16), dp(14), dp(16), dp(14));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(12);
        c.setLayoutParams(lp);
        return c;
    }

    private void montarTela() {
        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setBackgroundColor(FUNDO);
        raiz.setPadding(dp(20), dp(28), dp(20), dp(20));

        // Topo: "Corrida nova" e o tempo que falta.
        LinearLayout topo = new LinearLayout(this);
        topo.setOrientation(LinearLayout.HORIZONTAL);
        topo.setGravity(Gravity.CENTER_VERTICAL);
        TextView titulo = texto(oferta.isNull("scheduledFor") ? "CORRIDA NOVA" : "CORRIDA AGENDADA", 22, Color.WHITE, true);
        topo.addView(titulo, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        contador = texto("", 22, Color.parseColor("#FFC043"), true);
        topo.addView(contador);
        raiz.addView(topo);

        barra = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        barra.setMax(totalSegundos);
        barra.setProgress(totalSegundos);
        LinearLayout.LayoutParams lpBarra = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(8));
        lpBarra.topMargin = dp(10);
        raiz.addView(barra, lpBarra);

        ScrollView rolagem = new ScrollView(this);
        LinearLayout meio = new LinearLayout(this);
        meio.setOrientation(LinearLayout.VERTICAL);

        // Valor.
        LinearLayout valor = cartao();
        long tarifa = oferta.optLong("estimatedFareCents", 0);
        long desconto = oferta.optLong("discountCents", 0);
        long liquido = oferta.has("driverNetCents") ? oferta.optLong("driverNetCents", tarifa) : tarifa;
        valor.addView(texto(reais(tarifa - desconto), 34, Color.WHITE, true));
        valor.addView(texto("Você recebe " + reais(liquido - desconto) + " · " + pagamento(oferta.optString("paymentMethodType", "")), 15, TEXTO_FRACO, false));
        meio.addView(valor);

        // Passageiro.
        LinearLayout passageiro = cartao();
        double nota = oferta.optDouble("passengerRating", 5);
        passageiro.addView(texto(oferta.optString("passengerName", "Passageiro"), 18, Color.WHITE, true));
        passageiro.addView(texto(String.format(new Locale("pt", "BR"), "★ %.1f", nota), 15, Color.parseColor("#FFC043"), false));
        meio.addView(passageiro);

        // Embarque.
        LinearLayout embarque = cartao();
        embarque.addView(texto("BUSCAR EM", 12, TEXTO_FRACO, true));
        embarque.addView(texto(oferta.optString("pickupAddress", ""), 18, Color.WHITE, false));
        double ate = oferta.optDouble("distanceKm", 0) * 1000;
        long eta = oferta.optLong("etaSeconds", 0);
        embarque.addView(texto(km(ate) + " de você" + (eta > 0 ? " · ~" + Math.max(1, Math.round(eta / 60.0)) + " min" : ""), 14, TEXTO_FRACO, false));
        meio.addView(embarque);

        // Destino.
        LinearLayout destino = cartao();
        destino.addView(texto("DESTINO", 12, TEXTO_FRACO, true));
        destino.addView(texto(oferta.optString("dropoffAddress", ""), 18, Color.WHITE, false));
        long viagem = oferta.optLong("tripDistanceMeters", 0);
        long dur = oferta.optLong("tripDurationSeconds", 0);
        destino.addView(texto("Viagem " + km(viagem) + (dur > 0 ? " · ~" + Math.max(1, Math.round(dur / 60.0)) + " min" : ""), 14, TEXTO_FRACO, false));
        meio.addView(destino);

        rolagem.addView(meio);
        raiz.addView(rolagem, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        situacao = texto("", 15, Color.parseColor("#FF8A80"), true);
        situacao.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams lpSit = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpSit.topMargin = dp(8);
        raiz.addView(situacao, lpSit);

        deslizar = new Deslizar(this, "DESLIZE PARA ACEITAR", VERDE, this::aceitar);
        LinearLayout.LayoutParams lpDes = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(68));
        lpDes.topMargin = dp(12);
        raiz.addView(deslizar, lpDes);

        recusar = new Button(this);
        recusar.setText("Recusar");
        recusar.setAllCaps(false);
        recusar.setTextColor(Color.WHITE);
        recusar.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        GradientDrawable fundoRecusar = new GradientDrawable();
        fundoRecusar.setColor(Color.TRANSPARENT);
        fundoRecusar.setStroke(dp(1), TEXTO_FRACO);
        fundoRecusar.setCornerRadius(dp(26));
        recusar.setBackground(fundoRecusar);
        recusar.setOnClickListener(v -> recusarChamado());
        LinearLayout.LayoutParams lpRec = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
        lpRec.topMargin = dp(10);
        raiz.addView(recusar, lpRec);

        setContentView(raiz);
    }

    private static String pagamento(String tipo) {
        switch (tipo) {
            case "PIX": return "Pix";
            case "CREDIT_CARD":
            case "DEBIT_CARD": return "Cartão (maquininha)";
            default: return "Dinheiro";
        }
    }

    // ------------------------------------------------------------------
    // Respostas
    // ------------------------------------------------------------------

    private void calarAlarme() {
        Sirene.parar();
        try { NotificationManagerCompat.from(this).cancel(CorridasService.ID_CHAMADA); } catch (Exception ignored) { }
    }

    private void aceitar() {
        if (respondido) return;
        if (oferta.optBoolean("teste", false)) {
            encerrar("Teste: a tela de chamado está funcionando. Na corrida de verdade, deslizar aceita.", 3000);
            return;
        }
        respondido = true;
        calarAlarme();
        situacao.setTextColor(Color.WHITE);
        situacao.setText("Aceitando...");
        recusar.setEnabled(false);
        final Context c = getApplicationContext();
        new Thread(() -> {
            Servidor.Resposta r = Servidor.pedir(c, "POST", "/api/driver/rides/" + rideId + "/accept", null);
            if (r.ok()) {
                // Como no aplicativo: o aceite ja avisa "a caminho".
                Servidor.pedir(c, "POST", "/api/driver/rides/" + rideId + "/arriving", new JSONObject());
            }
            principal.post(() -> {
                if (r.ok()) {
                    abrirAplicativo(true);
                } else {
                    String m = r.codigo == 0
                            ? "Sem internet agora. Tente de novo."
                            : r.mensagem("Não deu para aceitar: o chamado já foi para outro motorista.");
                    if (r.codigo == 0 && System.currentTimeMillis() < venceEm) {
                        // Sem rede: deixa tentar de novo enquanto houver tempo.
                        respondido = false;
                        recusar.setEnabled(true);
                        deslizar.voltar();
                        situacao.setTextColor(Color.parseColor("#FF8A80"));
                        situacao.setText(m);
                    } else {
                        encerrar(m, 2500);
                    }
                }
            });
        }, "aceitar-chamado").start();
    }

    private void recusarChamado() {
        if (respondido) return;
        if (oferta.optBoolean("teste", false)) {
            encerrar("Teste encerrado.", 800);
            return;
        }
        respondido = true;
        calarAlarme();
        final Context c = getApplicationContext();
        new Thread(() -> Servidor.pedir(c, "POST", "/api/driver/rides/" + rideId + "/decline", null), "recusar-chamado").start();
        encerrar("Chamado recusado.", 600);
    }

    private void encerrar(String mensagem, long depoisMs) {
        respondido = true;
        calarAlarme();
        principal.removeCallbacks(relogio);
        if (situacao != null) {
            situacao.setTextColor(Color.parseColor("#FF8A80"));
            situacao.setText(mensagem);
        }
        if (deslizar != null) deslizar.setEnabled(false);
        if (recusar != null) recusar.setEnabled(false);
        principal.postDelayed(this::finish, depoisMs);
    }

    /** Abre o aplicativo ja na corrida aceita (por cima da tela bloqueada). */
    private void abrirAplicativo(boolean aceita) {
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra("chamada", true);
        if (aceita) i.putExtra("aceita", rideId);
        startActivity(i);
        // Pede para destravar a tela (senha/digital) para seguir no app.
        if (Build.VERSION.SDK_INT >= 26) {
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && km.isKeyguardLocked()) {
                try { km.requestDismissKeyguard(this, null); } catch (Exception ignored) { }
            }
        }
        MainActivity.avisarFlutter("corridaAceita", rideId);
        principal.postDelayed(this::finish, 300);
    }

    // ------------------------------------------------------------------
    // Botao de deslizar
    // ------------------------------------------------------------------

    /** Faixa com bolinha: arrastar ate o fim confirma. */
    static final class Deslizar extends View {
        private final Paint fundo = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint bola = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint seta = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint letra = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final String rotulo;
        private final Runnable aoConfirmar;
        private final RectF faixa = new RectF();
        private float posicao = 0;
        private boolean arrastando = false;
        private float inicioToque = 0;
        private boolean confirmado = false;

        Deslizar(Context c, String rotulo, int cor, Runnable aoConfirmar) {
            super(c);
            this.rotulo = rotulo;
            this.aoConfirmar = aoConfirmar;
            fundo.setColor(Color.argb(60, Color.red(cor), Color.green(cor), Color.blue(cor)));
            bola.setColor(cor);
            seta.setColor(Color.WHITE);
            seta.setStyle(Paint.Style.STROKE);
            seta.setStrokeCap(Paint.Cap.ROUND);
            seta.setStrokeJoin(Paint.Join.ROUND);
            letra.setColor(Color.WHITE);
            letra.setTypeface(Typeface.DEFAULT_BOLD);
            letra.setTextAlign(Paint.Align.CENTER);
        }

        private float limite() {
            return getWidth() - getHeight();
        }

        void voltar() {
            confirmado = false;
            animarPara(0);
        }

        private void animarPara(float alvo) {
            ValueAnimator a = ValueAnimator.ofFloat(posicao, alvo);
            a.setDuration(180);
            a.addUpdateListener(v -> {
                posicao = (float) v.getAnimatedValue();
                invalidate();
            });
            a.start();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float h = getHeight();
            float r = h / 2f;
            faixa.set(0, 0, getWidth(), h);
            canvas.drawRoundRect(faixa, r, r, fundo);
            letra.setTextSize(h * 0.27f);
            letra.setAlpha((int) (255 * Math.max(0.15f, 1f - posicao / Math.max(1f, limite()))));
            float base = h / 2f - (letra.descent() + letra.ascent()) / 2f;
            canvas.drawText(rotulo, (getWidth() + h) / 2f, base, letra);
            float cx = posicao + r;
            canvas.drawCircle(cx, r, r - h * 0.06f, bola);
            seta.setStrokeWidth(h * 0.07f);
            Path p = new Path();
            float s = h * 0.13f;
            p.moveTo(cx - s * 1.2f, r - s);
            p.lineTo(cx - s * 0.2f, r);
            p.lineTo(cx - s * 1.2f, r + s);
            p.moveTo(cx + s * 0.1f, r - s);
            p.lineTo(cx + s * 1.1f, r);
            p.lineTo(cx + s * 0.1f, r + s);
            canvas.drawPath(p, seta);
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            if (!isEnabled() || confirmado) return false;
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    // So pega quem tocou na bolinha (ou perto dela).
                    if (e.getX() > posicao + getHeight() * 1.4f) return false;
                    arrastando = true;
                    inicioToque = e.getX() - posicao;
                    getParent().requestDisallowInterceptTouchEvent(true);
                    return true;
                case MotionEvent.ACTION_MOVE:
                    if (!arrastando) return false;
                    posicao = Math.max(0, Math.min(limite(), e.getX() - inicioToque));
                    invalidate();
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (!arrastando) return false;
                    arrastando = false;
                    if (posicao >= limite() * 0.85f) {
                        confirmado = true;
                        animarPara(limite());
                        performClick();
                        aoConfirmar.run();
                    } else {
                        animarPara(0);
                    }
                    return true;
                default:
                    return false;
            }
        }

        @Override
        public boolean performClick() {
            return super.performClick();
        }
    }
}
