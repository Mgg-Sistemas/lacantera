# Por qué el HTML no se guarda en caché

La regla que había antes decía esto:

```json
{ "source": "/index.html", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] }
```

**Esa regla no se aplicaba nunca.** Las cabeceras se resuelven contra la
dirección que pide el navegador, no contra el archivo que acaba sirviéndose.
Nadie escribe `/index.html`: se escribe `/`, o `/entrar`, o
`/app/nomina/personal`. La reescritura convierte esas direcciones en
`index.html` *después* de haber decidido las cabeceras, así que la regla se
quedaba mirando una puerta por la que no pasa nadie.

Resultado: el HTML salía con la caché que Vercel decidiera por su cuenta. Y el
HTML es justo el archivo que **no** puede guardarse, porque es el único que
sabe cómo se llaman los demás. Los `.js` y `.css` llevan un hash en el nombre
—`index-Bw4Kq9z3.js`— y por eso pueden guardarse un año sin riesgo: si el
contenido cambia, cambia el nombre. El HTML no: se llama igual siempre y es
quien dice cuál de todos los `index-*.js` hay que cargar.

Con el HTML en caché, el navegador sigue pidiendo el JavaScript viejo aunque
el despliegue nuevo lleve horas publicado. Por fuera se ve como si el arreglo
no hubiera servido.

## Cómo queda

- **Todo por defecto: `no-store`.** El HTML no se guarda nunca.
- **`/assets/*`: un año, inmutable.** Llevan hash en el nombre; no hace falta
  volver a pedirlos jamás.
- **`/version.json`: `no-store`.** Es el archivo que la aplicación consulta
  para saber si lo que tiene cargado sigue siendo lo último. Guardarlo en
  caché sería como preguntarle la hora a un reloj parado.

El orden importa: la regla general va primera y la de `assets` después, para
que la segunda gane sobre los archivos con hash. Si algún día Vercel cambiara
ese criterio y ganara la primera, los assets se volverían a pedir cada vez —
más lento, pero nunca incorrecto. Se prefiere ese fallo al contrario.
