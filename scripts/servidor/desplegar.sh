#!/usr/bin/env bash
# Despliega La Cantera en este droplet construyendo desde GitHub.
#
# POR QUE SE CONSTRUYE AQUI Y NO SE SUBE EL BUILD
# Subir 13 MB por SSH desde el PC de Christopher se corta: hay un interceptor
# local que mangla las transferencias largas. Un "git pull" viene de GitHub y
# no pasa por ahi. Lo unico que viaja desde el PC es este comando, corto.
#
# USO:  ~/desplegar.sh            (rama main)
#       ~/desplegar.sh develop    (otra rama, para probar)
#
# CODIGOS DE SALIDA:  0 publicado · 75 habia otro despliegue corriendo (no se
# hizo nada; espere y reintente) · cualquier otro, fallo con el sitio intacto.
set -euo pipefail

# EL CANDADO PROPIO: UN DESPLIEGUE A LA VEZ, Y EL QUE LLEGA TARDE SE VA
#
# El 05/10 y el 06/10 dos despliegues a la vez dejaron /var/www a medias y el
# sitio caido: uno borraba $WEB.nuevo mientras el otro lo estaba copiando. El
# candado de desplegar-si-cambio.sh solo protege al robot y al cron entre si;
# este protege el trabajo en si, lo llame quien lo llame.
#
# Rehusa en vez de esperar (-n): un despliegue encolado publicaria lo suyo
# minutos despues, encima de lo recien publicado y sin nadie mirando. El 75
# quiere decir "ocupado, no se hizo nada": no es un fallo y el que avisa
# distinto es desplegar-si-cambio.sh, que lo reintenta solo a los dos minutos.
CANDADO_PROPIO="$HOME/.desplegar-exclusivo.lock"
exec 8>"$CANDADO_PROPIO"
if ! flock -n 8; then
  echo "OCUPADO: hay otro despliegue corriendo ahora mismo y no se hizo nada." >&2
  echo "Mire ~/despliegue-automatico.log, espere a que termine y reintente."   >&2
  exit 75
fi

REPO="https://github.com/Mgg-Sistemas/lacantera.git"
DIR="$HOME/lacantera"
WEB="/var/www/lacantera"
ENV="$HOME/lacantera.env"      # las dos VITE_*, fuera del repo para que git no las toque
RAMA="${1:-main}"

[ -s "$ENV" ] || { echo "Falta $ENV con VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY"; exit 1; }

if [ ! -d "$DIR/.git" ]; then
  git clone --quiet "$REPO" "$DIR"
fi
cd "$DIR"
git fetch --quiet origin
git checkout --quiet "$RAMA" 2>/dev/null || git checkout --quiet -b "$RAMA" "origin/$RAMA"
git reset --quiet --hard "origin/$RAMA"
cp "$ENV" .env.local

# Lo que se espera publicar. Se usa dos veces: para negarse a publicar un
# arbol que no sea este, y para avisar si lo publicado no quedo siendo esto.
ESPERADO=$(git rev-parse --short=7 HEAD)

echo "Construyendo $(git log -1 --format='%h %s' | cut -c1-80)"
npm ci --silent --no-audit --no-fund
npm run build --silent >/dev/null

test -f dist/index.html && test -s dist/version.json && test -d dist/assets

rm -rf "$WEB.nuevo"
cp -r dist "$WEB.nuevo"

# LA VERSION ANTERIOR SIGUE SIRVIENDO SUS ARCHIVOS UNOS DIAS
#
# Desde el 14-sep la aplicacion no se recarga sola al ver una version nueva:
# avisa, y cada cual actualiza cuando termina y guarda lo que estaba haciendo.
# Mientras tanto su pestana sigue pidiendo archivos con los nombres de la version
# vieja -una pantalla que no habia abierto, el PDF al imprimir-, y si ya no
# estan, falla justo lo que se queria proteger.
#
# Asi que se copian a la version nueva los de la publicada, sin pisar ninguno
# (llevan hash: mismo nombre, mismo contenido), y se borran los que llevan mas de
# DIAS_DE_GRACIA dias publicados. `rsync -a` conserva la fecha de cada archivo,
# que es la del despliegue que lo trajo; `cp -r dist` le pone la de hoy a los
# nuevos. Cada version pesa unos 6 MB.
#
# rsync y no `cp -n`: segun la version de coreutils, `cp -n` sale con error al
# saltarse un archivo, y con `set -e` eso cortaria el despliegue a la mitad.
DIAS_DE_GRACIA=7
if [ -d "$WEB/assets" ]; then
  rsync -a --ignore-existing "$WEB/assets/" "$WEB.nuevo/assets/"
  find "$WEB.nuevo/assets" -type f -mtime +"$DIAS_DE_GRACIA" -delete
fi

# SE MIRA LO QUE SE VA A PUBLICAR, NO SOLO LO QUE SE CONSTRUYO
#
# Las tres caidas publicaron un $WEB.nuevo roto -un dist anidado, un arbol a
# medio copiar- que el `test` de arriba no podia ver, porque mira dist y no lo
# que de verdad se pone en linea. Si este arbol no tiene index.html o su
# version.json no dice el commit que se acaba de construir, aqui se para todo:
# el sitio sigue sirviendo la version de siempre y no se perdio nada.
[ -f "$WEB.nuevo/index.html" ] ||
  { echo "NO SE PUBLICA: $WEB.nuevo quedo sin index.html. El sitio sigue intacto." >&2; exit 1; }
grep -q "$ESPERADO" "$WEB.nuevo/version.json" ||
  { echo "NO SE PUBLICA: $WEB.nuevo/version.json no dice $ESPERADO. El sitio sigue intacto." >&2; exit 1; }

rm -rf "$WEB.anterior"
if [ -d "$WEB" ]; then mv "$WEB" "$WEB.anterior"; fi
mv "$WEB.nuevo" "$WEB"

echo "PUBLICADO: $(cat "$WEB/version.json")"
if [ -f "$WEB.anterior/version.json" ]; then
  echo "RESPALDO:  $(cat "$WEB.anterior/version.json")  en $WEB.anterior"
fi

# La verificacion final INFORMA, no restaura: restaurar solo requiere criterio
# -saber si lo raro es de este despliegue o de otro que gano la carrera- y las
# restauraciones automaticas ya pisaron una vez un despliegue bueno. Si esto
# avisa, un humano mira $WEB y decide; el respaldo espera en $WEB.anterior.
if ! grep -q "$ESPERADO" "$WEB/version.json" 2>/dev/null; then
  echo "AVISO: lo publicado no dice $ESPERADO. Revise $WEB a mano; el respaldo sigue en $WEB.anterior." >&2
  exit 1
fi

# El final de antes era `[ -f ... ] && echo ...`: cuando no habia respaldo que
# ensenar, ese test fallido era lo ultimo que corria y un despliegue PERFECTO
# salia con codigo 1. El registro decia FALLO sobre un sitio sano. Este exit 0
# es la garantia de que un despliegue bueno jamas se reporta como fallo.
exit 0
