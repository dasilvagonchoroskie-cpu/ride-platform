# Regras de minificacao/R8 para producao.
#
# O conjunto de dependencias deste app (provider, http, shared_preferences,
# geolocator, intl) sao todas bibliotecas maduras que ja embutem suas
# proprias regras consumidoras (consumer-rules.pro) dentro do AAR — o
# Gradle aplica isso automaticamente. As linhas abaixo sao so a rede de
# seguranca padrao recomendada pelo proprio time do Flutter.

# O motor do Flutter e os plugins gerados na build nunca podem ser
# removidos ou renomeados: sao chamados por nome de fora do Dart.
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.**  { *; }
-keep class io.flutter.util.**  { *; }
-keep class io.flutter.view.**  { *; }
-keep class io.flutter.**  { *; }
-keep class io.flutter.plugins.**  { *; }

# O motor do Flutter referencia o Play Core (componentes adiaveis) de
# forma defensiva, mesmo quando o app nao usa essa funcionalidade — o
# que e o nosso caso. Sem esta linha, o R8 trata a classe ausente como
# erro fatal em vez de aviso. Este e o problema mais comum de builds
# release com Flutter + R8, documentado no proprio flutter.dev.
-dontwarn com.google.android.play.core.**
-keep class io.flutter.embedding.engine.deferredcomponents.** { *; }

# Producao sem registro no log do Android: o R8 tira as chamadas de android.util.Log (do app e das bibliotecas
# Java/Kotlin), para nada sensivel aparecer a quem ligar o celular num computador. Falhas que derrubam o app
# continuam sendo registradas pelo proprio Android.
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
    public static int e(...);
    public static int wtf(...);
    public static int println(...);
}
