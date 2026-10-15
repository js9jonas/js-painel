#!/bin/bash
# Robô do navegador (15/10/2026): Chrome comum, sem modo de automação, numa tela virtual (Xvfb :99), com a
# extensão robo-navegador/extensao. Não aparece na tela de ninguém. Perfil próprio em ~/.local/share/js-robo.
#
#   iniciar.sh            sobe a tela virtual e o Chrome (se já estiverem rodando, não faz nada)
#   iniciar.sh reiniciar  fecha o Chrome do robô e abre de novo (recarrega a extensão do disco)
#   iniciar.sh parar      fecha o Chrome do robô
#   iniciar.sh tela       abre o mesmo perfil NA TELA (para logar à mão, carregar a extensão etc.); feche ao terminar
#   iniciar.sh foto ARQ   tira uma foto da tela virtual (png)
#   iniciar.sh manter     fica rodando e sobe de novo o que cair (é o que o serviço js-robo.service usa)
#
# A extensão precisa ter sido carregada uma vez no perfil (chrome://extensions → modo desenvolvedor →
# "Carregar sem compactação" → esta pasta/extensao). O Chrome atual ignora --load-extension.
set -u
PERFIL="$HOME/.local/share/js-robo/perfil"
TELA=":99"
URL="https://popplayer.pro/meuplayer/users.php"

chrome_pids() { pgrep -f "/opt/google/chrome/chrome --user-data-dir=$PERFIL"; }

parar() {
  for p in $(chrome_pids); do kill -TERM "$p" 2>/dev/null; done
  for _ in $(seq 1 20); do chrome_pids >/dev/null || return 0; sleep 1; done
  for p in $(chrome_pids); do kill -KILL "$p" 2>/dev/null; done
}

subir_tela() {
  pgrep -f "Xvfb $TELA" >/dev/null || { nohup Xvfb "$TELA" -screen 0 1366x768x24 >/dev/null 2>&1 & sleep 1; }
}

abrir() {
  local display="$1"
  # GTK_USE_PORTAL=0: diálogos (ex.: escolher pasta) abrem na própria tela do Chrome, não no desktop.
  DISPLAY="$display" GTK_USE_PORTAL=0 nohup google-chrome --user-data-dir="$PERFIL" --no-first-run \
    --no-default-browser-check --disable-session-crashed-bubble --hide-crash-restore-bubble "$URL" \
    >/dev/null 2>&1 &
}

case "${1:-iniciar}" in
  iniciar)   subir_tela; chrome_pids >/dev/null || abrir "$TELA" ;;
  reiniciar) parar; subir_tela; abrir "$TELA" ;;
  parar)     parar ;;
  tela)      parar; abrir "${DISPLAY:-:0}" ;;
  manter)    while true; do subir_tela; chrome_pids >/dev/null || abrir "$TELA"; sleep 30; done ;;
  foto)      ffmpeg -loglevel error -y -f x11grab -video_size 1366x768 -i "$TELA" -frames:v 1 "${2:-/tmp/robo-tela.png}" ;;
  *)         echo "uso: $0 [iniciar|reiniciar|parar|tela|foto ARQ|manter]"; exit 1 ;;
esac
