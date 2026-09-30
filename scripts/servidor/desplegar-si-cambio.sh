#!/usr/bin/env bash
#
# DESPLIEGA SOLO CUANDO MAIN SE MUEVE
#
# Lo pidio Angelica: que el droplet se actualice solo cuando entra algo en la
# rama main, sin que nadie tenga que entrar por SSH a correr el despliegue.
#
# Lo llama el cron cada dos minutos. Casi todas las veces no hace nada: mira si
# la rama se movio y se va. Cuando se movio, llama a ~/desplegar.sh, que es el
# mismo de siempre y no se toco.
#
# CONTRA QUE SE COMPARA, Y POR QUE NO CONTRA EL CLON
#
# Se compara la rama de GitHub contra lo que esta PUBLICADO -el version.json
# que sirve el sitio-, no contra el clon de ~/lacantera. El clon dice lo que se
# construyo la ultima vez; el version.json dice lo que la gente esta viendo, que
# es la unica pregunta que importa. Si un despliegue se cae a la mitad, el clon
# queda adelantado y el sitio atrasado: comparando contra el clon, esto no
# volveria a intentarlo nunca.
#
# `git ls-remote` y no `git fetch`: es una pregunta de red de un segundo y no
# toca el disco. Cada dos minutos, todo el dia, eso importa.
#
# EL FRENO DE MANO
#
#   touch ~/.sin-despliegue-automatico     lo detiene
#   rm    ~/.sin-despliegue-automatico     lo devuelve
#
# Sirve para cuando alguien quiere probar la rama develop en el droplet: sin el
# freno, esto le devolveria main encima a los dos minutos. Produccion sale de
# main, y este guion lo hace cumplir.
#
# DONDE MIRAR:  ~/despliegue-automatico.log

set -euo pipefail

RAMA="${1:-main}"
REPO="https://github.com/Mgg-Sistemas/lacantera.git"
WEB="/var/www/lacantera"
REGISTRO="$HOME/despliegue-automatico.log"
FRENO="$HOME/.sin-despliegue-automatico"
CANDADO="$HOME/.despliegue.lock"
TOPE_DEL_REGISTRO=2000

# Que no pregunte credenciales jamas: en cron no hay quien conteste y se
# quedaria colgado ocupando el candado.
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=/bin/true

decir() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$REGISTRO"; }

[ -e "$FRENO" ] && exit 0

# Dos despliegues a la vez dejarian /var/www a medias. El candado para las
# corridas del cron; el pgrep para cuando alguien esta desplegando a mano.
exec 9>"$CANDADO"
flock -n 9 || exit 0
if pgrep -u "$(id -u)" -f 'desplegar\.sh' >/dev/null 2>&1; then exit 0; fi

remoto=$(git ls-remote "$REPO" "refs/heads/$RAMA" 2>/dev/null | cut -f1)
if [ -z "$remoto" ]; then
  decir "GitHub no contesto; se reintenta en la proxima vuelta"
  exit 0
fi

publicado=""
if [ -s "$WEB/version.json" ]; then
  publicado=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{7,40\}\).*/\1/p' "$WEB/version.json")
fi

# El version.json guarda el sha corto y ls-remote devuelve el largo: se compara
# el principio. Sin nada publicado -primer arranque, o /var/www vacio- se
# despliega.
if [ -n "$publicado" ] && [ "${remoto:0:${#publicado}}" = "$publicado" ]; then
  exit 0
fi

decir "$RAMA cambio: publicado ${publicado:-ninguno} -> ${remoto:0:7}. Desplegando."

if salida=$("$HOME/desplegar.sh" "$RAMA" 2>&1); then
  decir "LISTO ${remoto:0:7}. $(printf '%s\n' "$salida" | grep '^PUBLICADO' || true)"
else
  decir "FALLO el despliegue de ${remoto:0:7}. Ultimas lineas:"
  printf '%s\n' "$salida" | tail -25 >>"$REGISTRO"
  decir "El sitio sigue sirviendo ${publicado:-la version anterior}: desplegar.sh no publica nada hasta que la construccion termina bien."
fi

# Que el registro no crezca sin fin: se queda con la mitad mas reciente.
if [ "$(wc -l <"$REGISTRO")" -gt "$TOPE_DEL_REGISTRO" ]; then
  tail -n "$((TOPE_DEL_REGISTRO / 2))" "$REGISTRO" >"$REGISTRO.recorte" &&
    mv "$REGISTRO.recorte" "$REGISTRO"
fi
