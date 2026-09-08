/*
  LA TABLA NUEVA LLEVA SUS DOS DISPARADORES.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP. No cambia ningún dato.
  ————————————————————————————————————————————————————————————————————————

  Regla 5: toda tabla nueva necesita `trg_auditar` y `trg_normalizar`.
  `articulo_presentaciones` nació esta mañana con el de auditoría y sin el otro.

  Hoy no muerde: las dos funciones que escriben ahí ya suben el nombre a
  mayúscula, y la clave foránea a `presentaciones` no admitiría otra cosa. Pero
  la regla existe precisamente porque «hoy no muerde» es como se pierden las
  reglas — la tercera puerta que escriba aquí no va a acordarse, y el disparador
  sí.
*/

drop trigger if exists trg_normalizar on public.articulo_presentaciones;
create trigger trg_normalizar
  before insert or update on public.articulo_presentaciones
  for each row execute function private.normalizar_texto('presentacion');
