#!/usr/bin/env bash
# Mede, num Android de teste (emulador da esteira), quanto o mapa demora
# para aparecer. Etapa 2 do pedido do Evandro (29/10/2026).
#
#   medir-mapa.sh <pacote> <apk> <pasta-de-saida>
#
# Tres aberturas seguidas do app (sessao de teste ja gravada no APK de
# medicao):
#   r1  primeira abertura, sem nada guardado e com o GPS sem sinal nos
#       primeiros 8 segundos (como dentro de casa);
#   r2  segunda abertura, GPS respondendo e ruas ja guardadas no celular;
#   r3  terceira abertura, igual a r2 (para ver se repete).
# Em cada uma: fotos da tela por 20 s e os registros "MEDIDA" do app.
set -u
PKG="$1"; APK="$2"; OUT="$3"; REDE="${4:-normal}"
LAT=-18.0125; LNG=-49.3547
mkdir -p "$OUT/fotos"
agora() { date +%s%3N; }

adb wait-for-device
if [ "$REDE" = "4g" ]; then
  # 4G fraco, como numa cidade do interior: 6 Mbit/s para baixar, 1,5 para
  # subir e 100 a 250 ms de atraso em cada ida e volta.
  adb emu network speed 1500:6000 >/dev/null 2>&1 || true
  adb emu network delay 100:250 >/dev/null 2>&1 || true
  echo "Rede: 4G fraco (1500:6000 kbit/s, 100-250 ms)" | tee -a "$OUT/info.txt"
fi
adb shell cmd location set-location-enabled true >/dev/null 2>&1 || adb shell settings put secure location_mode 3
adb install -r -g "$APK" > "$OUT/instalar.txt" 2>&1 || { cat "$OUT/instalar.txt"; exit 1; }
# Autorizacoes especiais do motorista (as normais o -g ja libera).
adb shell appops set "$PKG" SYSTEM_ALERT_WINDOW allow >/dev/null 2>&1 || true
adb shell appops set "$PKG" USE_FULL_SCREEN_INTENT allow >/dev/null 2>&1 || true
adb shell dumpsys deviceidle whitelist +"$PKG" >/dev/null 2>&1 || true
ATIVIDADE=$(adb shell cmd package resolve-activity --brief "$PKG" | tr -d '\r' | tail -1)
echo "Atividade: $ATIVIDADE" | tee "$OUT/info.txt"
adb shell getprop ro.build.version.release | tr -d '\r' | sed 's/^/Android: /' | tee -a "$OUT/info.txt"
adb shell wm size | tr -d '\r' | tee -a "$OUT/info.txt"

GPS_PID=""
gps_ligar() {  # o GPS do emulador manda a posicao a cada 1 s, como um GPS de verdade
  ( sleep "$1"; while true; do adb emu geo fix "$LNG" "$LAT" >/dev/null 2>&1; sleep 1; done ) &
  GPS_PID=$!
}
gps_parar() { [ -n "$GPS_PID" ] && kill "$GPS_PID" 2>/dev/null; GPS_PID=""; }

rodada() {
  local nome="$1" atraso="$2" t0 fim t am
  adb shell am force-stop "$PKG"
  sleep 2
  # Foto de referencia: a tela do Android antes de abrir o app.
  adb exec-out screencap -p > "$OUT/fotos/$nome-base.png" 2>/dev/null
  adb logcat -c
  t0=$(agora)
  echo "$t0" > "$OUT/$nome-inicio.txt"
  adb shell am start -W -n "$ATIVIDADE" > "$OUT/$nome-am.txt" 2>&1 &
  am=$!
  gps_ligar "$atraso"
  fim=$((t0 + 20000))
  while [ "$(agora)" -lt "$fim" ]; do
    t=$(( $(agora) - t0 ))
    adb exec-out screencap -p > "$OUT/fotos/$nome-$(printf '%05d' "$t").png" 2>/dev/null
  done
  wait "$am" 2>/dev/null || true
  gps_parar
  adb logcat -d | tr -d '\r' | grep -E "MEDIDA" > "$OUT/$nome-log.txt" || true
  echo "$nome: $(grep -c . "$OUT/$nome-log.txt") registros, $(ls "$OUT/fotos" | grep -c "^$nome-") fotos"
}

rodada r1 8
rodada r2 0
rodada r3 0
adb logcat -d | tr -d '\r' | grep -iE "google maps|authorization failure|API key|flutter.*(error|exception)" | tail -40 > "$OUT/erros.txt" || true
