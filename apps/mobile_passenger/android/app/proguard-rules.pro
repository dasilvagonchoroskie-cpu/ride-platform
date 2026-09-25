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
