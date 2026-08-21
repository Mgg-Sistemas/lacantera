-- ---------------------------------------------------------------------------
-- Las tablas nuevas avisan en vivo
--
-- El carril de base de datos lo reportó: cuatro tablas de los últimos dos días
-- estaban fuera de la publicación. Sin ella, quien tiene la pantalla abierta no
-- se entera de lo que hace otro y sigue viendo lo de antes.
--
-- Duele especialmente en `compras_papeles`, que es de las pocas tablas que
-- escriben tres áreas distintas —tesorería el comprobante, almacén la nota de
-- entrega, compras la factura— y las tres sobre la misma compra a la vez, que
-- es justo cuando se está cerrando.
--
-- `firmas` no entra: la propia la cambia uno mismo y su pantalla ya se refresca
-- sola; la de los demás solo hace falta al armar un papel, que la lee entonces.
-- Publicarla sería mandar el PNG de cada firma a todos los navegadores
-- conectados cada vez que alguien cambia la suya.
--
-- El mapa de qué invalida qué en el front va en `src/lib/tiempoReal.ts`, y se
-- actualiza en el mismo empujón. Publicar sin mapear no sirve de nada: el aviso
-- llega y nadie sabe qué consulta rehacer.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.compras_papeles;
alter publication supabase_realtime add table public.organigrama_nodos;
alter publication supabase_realtime add table public.incidencias_personal;
alter publication supabase_realtime add table public.incidencia_participantes;
