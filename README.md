# La Cantera — Sistema de control interno

Sistema de gestión para la explotación y comercialización de agregados.
Módulos previstos: explotación, inventario, compras, ventas, nómina, pagos a
personal y tesorería.

## Stack

| Capa | Tecnología |
| --- | --- |
| UI | React 19 + TypeScript + Tailwind CSS 4 |
| Build | Vite 8 |
| Datos | Supabase (PostgreSQL) |
| Estado de servidor | TanStack Query |
| Rutas | React Router |

## Arrancar en local

Requiere Node.js 22 o superior (probado con 24.15).

```bash
npm install
cp .env.example .env.local   # y rellenar las credenciales de Supabase
npm run dev
```

Vite queda escuchando en `http://localhost:5173` y además publica una URL de
red (`http://192.168.x.x:5173`) para abrir la aplicación desde el teléfono
estando en la misma red Wi-Fi.

### Desde Visual Studio Code

- `Ctrl+Shift+B` levanta el servidor de desarrollo (tarea por defecto).
- `F5` levanta el servidor y abre Chrome con el depurador enganchado; los
  puntos de interrupción se colocan directamente sobre los `.tsx`.
- `Ctrl+ñ` abre el terminal integrado, ya posicionado en la raíz del repo.

Al abrir el proyecto, VS Code recomienda las extensiones necesarias
(Tailwind IntelliSense, Oxlint, GitLens).

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run typecheck` | Verifica tipos sin generar salida |
| `npm run lint` | Analiza el código con Oxlint |
| `npm run build` | Verifica tipos y compila a `dist/` |
| `npm run preview` | Sirve el build de producción en local |
| `npm run prueba` | Corre las pruebas contra la base |

## Pruebas

Hace falta la variable `DBURL`: la cadena de conexión de Postgres que da
Supabase en Project Settings → Database → Connection string. No se versiona,
se pone en el entorno antes de correr.

```bash
DBURL="postgresql://..." npm run prueba            # todas
DBURL="postgresql://..." npm run prueba permisos   # solo esa suite
```

Se prueba contra la base de verdad —no hay otra—, así que cada archivo corre
dentro de una transacción que se deshace al terminar, pase lo que pase. Nada
de lo que crea la prueba sobrevive: ni usuarios, ni movimientos, ni asientos.

Sin `DBURL` el comando corta con un mensaje explicativo y sale con código 2.
Por eso en GitHub Actions estas pruebas van en un job aparte que se salta solo
cuando el secreto no está: quien abre un pull request desde una bifurcación no
tiene acceso a los secretos del repositorio.

## Ramas (gitflow-simple)

| Rama | Propósito |
| --- | --- |
| `main` | Producción. Solo recibe merges desde `develop`. Cada merge es una versión desplegable |
| `develop` | Integración. Es la rama base del trabajo diario |
| `feature/<nombre>` | Una funcionalidad. Sale de `develop` y vuelve a `develop` |
| `hotfix/<nombre>` | Corrección urgente en producción. Sale de `main` y se mergea a `main` y a `develop` |

```bash
git checkout develop
git checkout -b feature/inventario-movimientos
# ... trabajo ...
git checkout develop
git merge --no-ff feature/inventario-movimientos
```

## Variables de entorno

Se declaran en `.env.local`, que nunca se versiona. La plantilla está en
`.env.example`.

Todo lo que empieza por `VITE_` termina dentro del bundle que descarga el
navegador. Por eso solo se expone la clave publicable de Supabase; la clave
secreta (`service_role`) no debe aparecer nunca en este proyecto.

## Documentación

Las especificaciones de diseño viven en `docs/superpowers/specs/`.
