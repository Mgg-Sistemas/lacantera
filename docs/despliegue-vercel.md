# Poner el sistema en línea (Vercel)

Vercel sirve el navegador. La base de datos, la autenticación, el almacenamiento
de las fotos y el tiempo real siguen en Supabase y no se mueven de ahí. Esto es
importante para entender qué se despliega y qué no: **subir a Vercel no aplica
migraciones**. Si hay una migración nueva sin aplicar, la pantalla nueva llega y
la tabla que necesita, no.

---

## Antes de exponerlo a internet

Mientras el sistema corría en `localhost` solo entraba quien estuviera sentado
en esa máquina. Con una dirección pública entra cualquiera que la encuentre, y
hay tres cosas que dejan de ser teóricas:

1. **El repositorio es público y la clave `la clave provisional` del usuario `admin_` está en
   el historial de git.** Borrarla del código no la borra del historial: sigue
   ahí para siempre en los commits viejos. Hay que cambiar la contraseña del
   administrador antes de publicar, no después.

2. **La contraseña de la base de datos pasó por conversaciones y por la línea de
   comandos.** Conviene rotarla en Supabase → Settings → Database. No afecta al
   sistema en línea: el navegador nunca la usa, solo la usan las migraciones.

3. **Decidir si el repositorio sigue público.** No es obligatorio hacerlo
   privado —el código no guarda secretos y las claves van en variables de
   entorno—, pero un repositorio público le regala a cualquiera el mapa
   completo: qué tablas hay, qué funciones existen y cómo se llaman los
   usuarios.

Con la contraseña cambiada, el resto es rutina.

---

## Lo que hay que tener

| Qué | Dónde se consigue |
| --- | --- |
| Cuenta de Vercel | vercel.com, entrando con la misma cuenta de GitHub del repositorio |
| Acceso al repositorio | `Mgg-Sistemas/lacantera` |
| URL del proyecto Supabase | Supabase → Settings → API → *Project URL* |
| Clave publicable | Supabase → Settings → API → *anon / publishable* |
| El dominio de GoDaddy | Solo si se va a usar dominio propio; con el `.vercel.app` funciona igual |

**La clave `service_role` no se usa aquí y no debe entrar nunca.** Todo lo que
empieza por `VITE_` termina dentro del archivo que descarga el navegador: quien
abra el sistema podría leerla, y esa clave se salta todos los permisos.

---

## Los pasos

### 1. Importar el proyecto

En Vercel: *Add New… → Project → Import* y elegir el repositorio.

Vercel lee `vercel.json` y ya sabe qué hacer: framework Vite, `npm run build`,
salida en `dist`. No hay que tocar nada de la configuración de compilación.

### 2. Cargar las dos variables de entorno

Antes de darle a *Deploy*, en *Environment Variables*:

```
VITE_SUPABASE_URL              = https://xxxxxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY  = eyJhbGciOi…
```

Marcar los tres entornos: **Production, Preview y Development**. Si falta
alguna, el sistema no arranca: `src/lib/supabase.ts` corta de entrada a
propósito, en vez de dejar que el fallo aparezca disperso como un 401 en cada
pantalla.

Estas variables **no se leen del archivo `.env.local`**: ese archivo está en
`.gitignore` y no llega a Vercel. Se cargan a mano, una vez.

### 3. Elegir la rama

Vercel publica `main` por defecto. Aquí la rama de trabajo es `develop`, así que
hay dos opciones:

- **Publicar `develop`** — cambiar la *Production Branch* en
  *Settings → Git*. Cada cosa que se sube sale en línea al momento.
- **Publicar `main` y fusionar `develop` cuando esté para salir** — más pasos,
  pero lo que ve la gente no cambia debajo de sus pies mientras trabaja.

Lo segundo es lo sano en cuanto haya alguien usándolo de verdad. Mientras siga
en construcción, lo primero ahorra fricción.

Sea cual sea la elección, cada rama y cada pull request obtiene una dirección de
prueba propia, con la misma base de datos. **Eso significa que una prueba en una
dirección de prueba escribe en los datos reales.** Para probar de verdad sin
tocarlos hace falta un segundo proyecto de Supabase, que es otra decisión.

### 4. Supabase: dar de alta la dirección

Supabase → Authentication → URL Configuration:

- *Site URL*: la dirección de producción.
- *Redirect URLs*: añadir también `https://*.vercel.app` para que las
  direcciones de prueba funcionen.

El sistema entra con usuario y contraseña, sin enlaces por correo, así que esto
no es imprescindible hoy. Se configura igual: el día que se añada
"recuperar contraseña", sin esto el enlace del correo no llevaría a ningún
sitio.

No hace falta tocar CORS: Supabase acepta peticiones de cualquier origen y los
permisos los deciden las políticas de la base, no el dominio.

### 5. El dominio de GoDaddy

En Vercel: *Settings → Domains → Add*, y escribir el dominio. Vercel muestra
entonces los registros exactos que hay que crear —cambian según sea el dominio
raíz (`empresa.com`) o un subdominio (`sistema.empresa.com`)—.

En GoDaddy: *Mis productos → DNS → Administrar zonas*, y copiar esos registros
tal cual los muestra Vercel. **Copiarlos de ahí y no de un tutorial**: las
direcciones IP de Vercel han cambiado más de una vez y una guía vieja deja el
dominio apuntando al vacío.

El certificado HTTPS lo emite Vercel solo, sin hacer nada. Tarda entre unos
minutos y unas horas, según lo que tarde el DNS en propagarse.

---

## Después de publicar, comprobar

1. **Entrar y navegar.** Que la sesión se mantenga al recargar.
2. **Recargar estando en una pantalla honda**, por ejemplo la ficha de un
   trabajador. Si devuelve 404, la regla de reescritura de `vercel.json` no se
   está aplicando.
3. **Abrir el sistema en dos dispositivos y cambiar algo en uno.** Si el otro no
   se entera en un par de segundos, el tiempo real no está llegando: mirar si
   sale el aviso "Sin conexión en vivo" arriba a la derecha.
4. **Bajar un carnet y una ficha en PDF.** Es lo único que se genera dentro del
   navegador y depende de que las fuentes hayan cargado.
5. **Subir una foto.** Comprueba de una vez el almacenamiento y sus permisos.

---

## Lo que sigue haciéndose a mano

**Las migraciones.** Cuando haya una nueva:

```bash
npx supabase db push --db-url "postgresql://postgres.<proyecto>:<clave>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

El puerto es el **5432** (sesión), no el 6543: el 6543 es el agrupador de
transacciones y no admite las sentencias que necesita una migración.

El orden importa: **primero la migración, después el despliegue.** Al revés, la
pantalla nueva sale en línea buscando una columna que todavía no existe.
