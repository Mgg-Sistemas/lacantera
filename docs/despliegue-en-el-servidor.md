# Cómo llega el sistema a producción

Producción **no es Vercel**. Es un servidor propio que sirve
`mineriainternacionalts.com` con nginx, y lo que el navegador descarga son los
archivos estáticos que deja `vite build` en `dist/`. La base de datos, la
autenticación y el almacenamiento de fotos siguen en Supabase y no se mueven de
ahí; esto solo explica cómo viaja el navegador.

`docs/despliegue-vercel.md` describe el despliegue en Vercel, que fue el plan
original y ya no es lo que corre. Lo que vale es este documento.

> **Lo que no está aquí, a propósito.** La dirección del servidor, el usuario,
> la llave SSH y el archivo con las dos variables `VITE_*` no viven en el
> repositorio, porque el repositorio es público. Pídeselos a quien administra.

---

## El resumen en una línea

Desde el PC se manda un comando corto por SSH; **el servidor se baja el código
de GitHub, lo construye él mismo y cambia la carpeta publicada de golpe.**

```
~/desplegar.sh main        # publica la rama main
~/desplegar.sh develop     # publica otra rama, para probar
```

## Por qué se construye allá y no se sube el `dist/`

Subir trece megas por SSH desde el PC se corta a la mitad: hay un interceptor
local que estropea las transferencias largas. Un `git pull` viene de GitHub y no
pasa por ahí. Lo único que viaja desde el PC es el comando, que son treinta
caracteres.

De eso sale una consecuencia que conviene tener presente: **el servidor publica
lo que hay en GitHub, no lo que hay en tu carpeta.** Si no has hecho `push`, no
se despliega, por mucho que compile en tu máquina.

## Los pasos, en orden

1. **Se trae la rama.** `git fetch`, `git checkout` y `git reset --hard` contra
   `origin/<rama>`. El `reset --hard` es a propósito: la copia del servidor es
   desechable y nunca debe tener cambios propios que se peleen con el `pull`.
2. **Se pone el entorno.** El archivo con `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_PUBLISHABLE_KEY` vive en el home del usuario de despliegue,
   **fuera del repositorio**, y se copia como `.env.local` antes de construir.
   Si falta, el script se planta y no hace nada.
3. **Se construye.** `npm ci` y `npm run build`. Después comprueba que existan
   `dist/index.html`, `dist/version.json` con contenido y la carpeta
   `dist/assets`. Si algo de eso falta, el script muere ahí y **lo publicado no
   se toca**.
4. **Se copia a un lado.** `dist/` se copia a `/var/www/lacantera.nuevo`. Todavía
   nadie lo está viendo.
5. **Se rescatan los archivos viejos** (ver abajo).
6. **Se cambia de golpe.** Tres movimientos de carpeta:

   ```
   rm -rf  /var/www/lacantera.anterior
   mv      /var/www/lacantera         /var/www/lacantera.anterior
   mv      /var/www/lacantera.nuevo   /var/www/lacantera
   ```

   nginx sirve `/var/www/lacantera` y no hay que reiniciarlo ni recargarlo: un
   `mv` en el mismo sistema de archivos es instantáneo, así que nadie llega a
   ver una carpeta a medio copiar.

7. **Se imprime qué quedó.** El script termina diciendo la versión publicada y
   la que quedó de respaldo:

   ```
   PUBLICADO: {"version":"af7e3c5 · 2026-09-22 20:49"}
   RESPALDO:  {"version":"33d15e6 · 2026-09-22 15:56"}  en /var/www/lacantera.anterior
   ```

## Los archivos de la versión anterior se quedan siete días

Este es el paso que menos se adivina, así que va con su motivo.

Desde el 14 de septiembre la aplicación **no se recarga sola** cuando ve una
versión nueva: avisa, y cada quien actualiza cuando termina lo que estaba
haciendo. Eso significa que una pestaña abierta sigue pidiendo archivos con los
nombres de la versión vieja durante horas. Una pantalla que esa persona no había
abierto todavía, o el PDF que se arma al imprimir, se descargan en ese momento.
Si esos archivos ya no están, falla justo lo que se quería proteger.

Por eso, antes del cambio, el script copia a la carpeta nueva los archivos de la
publicada sin pisar ninguno, y borra los que lleven más de siete días:

```
rsync -a --ignore-existing /var/www/lacantera/assets/ /var/www/lacantera.nuevo/assets/
find /var/www/lacantera.nuevo/assets -type f -mtime +7 -delete
```

Pisar no importa porque los nombres llevan hash: mismo nombre significa mismo
contenido. `rsync -a` conserva la fecha de cada archivo, que es la del despliegue
que lo trajo, mientras que `cp -r dist` le pone la de hoy a los nuevos; de ahí
que el `-mtime +7` sepa distinguirlos. Se usa `rsync` y no `cp -n` porque, según
la versión de coreutils, `cp -n` sale con error al saltarse un archivo, y con
`set -e` eso cortaría el despliegue a la mitad.

Cada versión pesa unos 6 MB.

## Volver atrás

La versión anterior queda entera en `/var/www/lacantera.anterior`, así que
deshacer es cambiar las carpetas de sitio otra vez:

```
mv /var/www/lacantera /var/www/lacantera.roto
mv /var/www/lacantera.anterior /var/www/lacantera
```

Solo hay un paso atrás: el despliegue siguiente borra `.anterior`. Si hay que
volver más lejos, se despliega el commit viejo.

## Lo que el despliegue NO hace

**No aplica migraciones.** Publicar es copiar archivos estáticos; la base de
datos ni se entera. Si una pantalla nueva necesita una tabla o una función que
no está aplicada, la pantalla llega y la tabla no, y el usuario ve un error de
«no existe la función». Las migraciones se aplican aparte, contra Supabase, y
**antes** de publicar la pantalla que las usa.

## Comprobar que salió bien

El archivo `version.json` se genera en cada construcción con el commit y la
fecha, y se sirve sin caché:

```
curl -s https://mineriainternacionalts.com/version.json
```

Lo que devuelva tiene que ser el commit que acabas de publicar. Si devuelve el
anterior, el despliegue no llegó a cambiar las carpetas y el motivo está en la
salida del script.
