/*
  LA SALIDA DICE EL MOTIVO TAL CUAL, Y YA NO HAY «DAR DE BAJA» APARTE

  Christopher, 15/09/2026:

    «Debemos eliminar la opción de dar de baja a los artículos, si algo va a
    salir que sea por registrar salida».

    «Sé explícito con los motivos: lo que sea robado, explícitamente dice
    robado; lo que dice extraviado, explícitamente debe aparecer como tal».

  LO QUE LO TRAJO

  Las cuatro bajas que había —MOV 0078, 0079, 0085 y 0086— eran ventas,
  despachos y una donación, todas anotadas como robo. La puerta de «Dar de baja»
  entregaba una nota de salida, y se usaba para eso. Esos cuatro registros no se
  tocan aquí: los revisa Christopher con el equipo.

  QUÉ CAMBIA

  Registrar salida ya tenía las cinco causas como clases, con nombres que no
  decían la palabra: «SE LO LLEVARON» guardaba ROBADO y «NO APARECE» guardaba
  EXTRAVIADO. Ahora se llaman como lo que son. Los códigos no cambian —los usan
  la base y lo ya escrito—; cambia lo que se lee en la lista y en el papel.

  Y la puerta vieja se cierra para quien tiene sesión. `registrar_baja` queda en
  la base porque sus bajas se siguen leyendo, pero ninguna pantalla la llama y
  nadie puede llamarla por fuera: toda salida va por `registrar_salidas`, que
  anota la causa de la baja igual que antes.
*/
update public.clases_de_salida set nombre = 'ROBADO'     where codigo = 'SE_LO_LLEVARON';
update public.clases_de_salida set nombre = 'EXTRAVIADO' where codigo = 'NO_APARECE';
update public.clases_de_salida set nombre = 'DAÑADO'     where codigo = 'SE_DANO';
update public.clases_de_salida set nombre = 'VENCIDO'    where codigo = 'SE_VENCIO';
update public.clases_de_salida set nombre = 'OBSOLETO'   where codigo = 'QUEDO_OBSOLETO';

revoke execute on function public.registrar_baja(bigint,bigint,numeric,text,text,text,date,text)
  from public, anon, authenticated;

comment on function public.registrar_baja(bigint,bigint,numeric,text,text,text,date,text) is
  'Retirada el 15/09/2026: ninguna pantalla la llama y nadie con sesión puede. '
  'Toda salida va por registrar_salidas con su clase, que anota la causa de la baja.';

do $ver$
begin
  if exists (select 1 from public.clases_de_salida
              where (codigo, nombre) not in (('SE_LO_LLEVARON', 'ROBADO'), ('NO_APARECE', 'EXTRAVIADO'),
                                             ('SE_DANO', 'DAÑADO'), ('SE_VENCIO', 'VENCIDO'),
                                             ('QUEDO_OBSOLETO', 'OBSOLETO'))
                and tipo = 'SALIDA_BAJA') then
    raise exception 'queda una clase de baja sin su nombre explícito';
  end if;
  if has_function_privilege('authenticated',
       'public.registrar_baja(bigint,bigint,numeric,text,text,text,date,text)', 'execute') then
    raise exception 'registrar_baja sigue abierta para quien tiene sesión';
  end if;
end
$ver$;
