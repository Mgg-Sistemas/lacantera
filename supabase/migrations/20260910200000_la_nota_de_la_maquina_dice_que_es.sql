/*
  LA NOTA DE LA MÁQUINA NO ERA DEL HORÓMETRO, PERO LO PARECÍA.

  Christopher: «las máquinas requieren de un campo llamado nota, u observación de
  la máquina (el campo nota que existe es del horómetro)».

  En la base nunca fue del horómetro. `maquinaria.nota` es de la máquina y
  siempre lo fue; lo que engañaba era dónde estaba puesta en la pantalla —al
  final de la tarjeta «Cuándo avisar», debajo de tres umbrales de horas— y una
  etiqueta que dice «Nota» ahí solo puede leerse como una nota sobre eso.

  Se movió en el front a su propia tarjeta. Aquí se deja escrito qué es, que es
  lo que faltaba: la columna no tenía comentario, y por eso la única respuesta a
  «¿de qué es esta nota?» estaba en dónde la habían dibujado.

  NO se añadió una segunda columna. Habría dos sitios donde escribir lo mismo, y
  la observación de una máquina acabaría repartida entre las dos sin que nadie
  supiera cuál mirar.
*/
comment on column public.maquinaria.nota is
  'Observacion de LA MAQUINA: lo que hay que saber de ella y no cabe en un campo —de donde vino, que manias tiene, que se le prometio a quien la presta—. NO es del horometro ni del mantenimiento, aunque el formulario la dibujaba dentro de «Cuando avisar» y por eso se leia asi; Christopher lo reporto el 10/09/2026 y se movio a su propia tarjeta. Las notas de una lectura de horometro viven en `horometro_lecturas.nota`, que es otra columna.';

comment on column public.horometro_lecturas.nota is
  'Observacion de ESA LECTURA, no de la maquina. La de la maquina es `maquinaria.nota`.';
