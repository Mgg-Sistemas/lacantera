# Reescritura del historial del 28 de julio de 2026

El 28 de julio de 2026 se reescribió el historial completo del repositorio para
sacar de los commits viejos la clave provisional con la que se creó el usuario
`admin_`.

## Qué había

La migración `supabase/migrations/20260727120000_usuario_administrador.sql`
nació con la clave escrita dentro. Se corrigió después —hoy la lee de
`app.clave_admin`, un parámetro de sesión que no se versiona—, pero corregir un
archivo no toca los commits anteriores: la clave seguía visible en siete
commits, en un repositorio público.

## Qué se hizo

Se reescribieron las 31 revisiones de todas las ramas sustituyendo el literal
por un texto muerto, y se publicaron a la fuerza `develop` y `main`. Los
commits cambiaron de código: los de antes de la reescritura ya no existen en
este repositorio.

Antes de tocar nada se guardó una copia completa del repositorio original en un
`git bundle`, fuera del proyecto.

## Qué NO arregla esto

**Una reescritura no deshace una publicación.** Conviene tenerlo claro porque es
justo lo que la gente supone que hace:

- GitHub conserva los commits huérfanos accesibles por su código durante un
  tiempo. Quien lo tenga apuntado, entra.
- Cualquier copia, bifurcación o clon hecho antes de hoy conserva la clave
  entera.
- Los servicios que indexan repositorios públicos pueden haberla leído ya.

Lo único que cierra el agujero es **cambiar la clave del usuario `admin_`**.
Está explicado en `despliegue-vercel.md`. La reescritura sirve para que no siga
apareciendo a la vista de quien clone el proyecto de aquí en adelante; no para
dar por recuperado lo que estuvo publicado.

## Si alguien tiene una copia local anterior

Un `git pull` sobre un clon viejo mezclaría las dos historias y devolvería la
clave al repositorio. Lo correcto es volver a clonar:

```bash
git clone https://github.com/Mgg-Sistemas/lacantera.git
```

Si hay trabajo sin publicar en la copia vieja, se saca con `git format-patch` y
se aplica sobre el clon nuevo.

## La regla que evita repetirlo

Ninguna clave se escribe en un archivo versionado. Las del navegador van en
variables de entorno (`.env.local`, que está en `.gitignore`); las de la base se
pasan como parámetro de sesión en el momento de ejecutar. Una clave en un commit
no se borra: se cambia.
