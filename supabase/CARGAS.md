# Cargas de datos privados

`supabase/migrations/` lleva **cómo funciona** el sistema: tablas, vistas,
funciones, permisos. Todo eso se versiona y viaja al repositorio.

`supabase/cargas/` lleva **datos reales de la empresa**: el personal con su
cédula y su cuenta bancaria, el tabulador con lo que gana cada cargo. Esa
carpeta está en `.gitignore` y no sale de este equipo.

## Por qué separadas

Este repositorio es público y **el historial de git es permanente**. Un archivo
con diecisiete cédulas y diecisiete números de cuenta, commiteado una vez, queda
expuesto para siempre aunque se borre al minuto siguiente: sigue estando en el
historial, y cualquiera puede sacarlo.

Esos mismos datos, dentro de la base, están detrás del acceso y de políticas que
solo dejan verlos a RRHH, gerencia y tesorería. La diferencia entre un sitio y
otro no es de forma.

## Qué hay cargado

| Archivo | Qué carga | Aplicado |
|---|---|---|
| `20260729220000_carga_personal_cantera.sql` | Los 12 niveles del tabulador y las 17 fichas del personal, del libro `NOMINA - CANTERA.xlsx` | 29/07/2026 |

Los archivos son **idempotentes**: volver a aplicarlos no duplica a nadie ni
pisa una corrección hecha a mano después de la carga.

## Si hay que rehacer la base desde cero

1. Correr todo `supabase/migrations/` en orden.
2. Correr `supabase/cargas/` en orden.

Si esta carpeta se perdió, los datos siguen en la base de producción y se
vuelven a sacar de ahí. Lo que no se puede es reconstruirlos del repositorio, y
es a propósito.
