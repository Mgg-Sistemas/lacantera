-- ---------------------------------------------------------------------------
-- El catálogo, con lo que de verdad se compra en una cantera
--
-- LO QUE HABÍA
--
-- Treinta artículos: la semilla mínima de `20260727145000`, la justa para que
-- las pantallas tuvieran algo que enseñar. Ninguna herramienta —cero filas en
-- esa categoría, con un módulo de asignación de herramienta ya construido—, dos
-- filtros para toda la flota, y ningún consumible de taller.
--
-- Con eso, cargar una orden de compra terminaba casi siempre en «no está en el
-- catálogo, lo describo abajo», que es la puerta por la que el control de
-- compras se escapa: lo que se describe a mano no tiene existencias, ni costo
-- promedio, ni mínimo que avise.
--
-- QUÉ ENTRA
--
-- Lo corriente de una cantera con primaria, planta fija y flota propia:
-- desgaste de trituración (muelas, mantos, cóncavos, mallas, correa y sus
-- rodillos), tren de rodaje y cucharón, hidráulica, filtros por familia,
-- consumibles de soldadura y corte, dotación completa de seguridad, la
-- herramienta del taller y los servicios que se contratan fuera.
--
-- LAS UNIDADES DEL PRODUCTO SIGUEN EN TONELADA, Y ES A PROPÓSITO
--
-- La cantera despacha en metros cúbicos mientras tramita la licencia de
-- toneladas. Pero la unidad del catálogo es la tonelada desde el principio y
-- `articulos.densidad_ton_m3` existe justo para pasar de una a otra: la medida
-- del despacho se elige en la guía. Meter productos nuevos en M3 rompería esa
-- simetría y dejaría media tabla sin poder convertirse.
--
-- Las densidades siguen en nulo. No las tenemos —lo dijo Christopher— y
-- ponerlas a ojo sería peor que no tenerlas: son las que convierten lo que se
-- factura.
--
-- ES REPETIBLE
--
-- `on conflict (codigo) do nothing`. Volver a correrla no duplica nada ni pisa
-- un artículo que alguien haya corregido a mano después. Los treinta que ya
-- estaban se quedan como están.
--
-- Y ENTRA SIN PASAR POR `guardar_articulo`
--
-- Esa función exige rol y firma con `auth.uid()`, que en una migración es nulo.
-- Es una carga de catálogo, no la acción de una persona: se inserta directo,
-- como hizo la semilla original. Los disparadores de normalización y auditoría
-- corren igual, así que los nombres quedan en mayúscula solos.
-- ---------------------------------------------------------------------------
insert into public.articulos (codigo, nombre, categoria, unidad, inventariable, stock_minimo) values
  -- Producto -----------------------------------------------------------------
  ('PRD-P3',    'Piedra picada N.º 3',                  'PRODUCTO',    'TON',  true,    0),
  ('PRD-P4',    'Piedra picada N.º 4',                  'PRODUCTO',    'TON',  true,    0),
  ('PRD-GRV',   'Gravilla',                             'PRODUCTO',    'TON',  true,    0),
  ('PRD-ARC',   'Arena cernida',                        'PRODUCTO',    'TON',  true,    0),
  ('PRD-ARG',   'Arena gruesa',                         'PRODUCTO',    'TON',  true,    0),
  ('PRD-BASE',  'Base granular',                        'PRODUCTO',    'TON',  true,    0),
  ('PRD-SBAS',  'Sub-base granular',                    'PRODUCTO',    'TON',  true,    0),
  ('PRD-ESC',   'Escollera',                            'PRODUCTO',    'TON',  true,    0),
  ('PRD-REL',   'Material de relleno',                  'PRODUCTO',    'TON',  true,    0),

  -- Combustible --------------------------------------------------------------
  ('CMB-KER',   'Kerosene',                             'COMBUSTIBLE', 'L',    true,  100),
  ('CMB-GLP',   'Gas licuado de petróleo',              'COMBUSTIBLE', 'KG',   true,   40),

  -- Lubricante ---------------------------------------------------------------
  ('LUB-10W30', 'Aceite de motor 10W-30',               'LUBRICANTE',  'L',    true,  100),
  ('LUB-SAE50', 'Aceite de motor SAE 50',               'LUBRICANTE',  'L',    true,  100),
  ('LUB-80W90', 'Aceite de diferencial 80W-90',         'LUBRICANTE',  'L',    true,   80),
  ('LUB-85W140','Aceite de transmisión 85W-140',        'LUBRICANTE',  'L',    true,   80),
  ('LUB-ATF',   'Aceite de transmisión automática ATF', 'LUBRICANTE',  'L',    true,   40),
  ('LUB-REF',   'Refrigerante de motor',                'LUBRICANTE',  'L',    true,   60),
  ('LUB-GRAT',  'Grasa de alta temperatura',            'LUBRICANTE',  'KG',   true,   30),
  ('LUB-PEN',   'Aceite penetrante',                    'LUBRICANTE',  'L',    true,   10),

  -- Insumo -------------------------------------------------------------------
  ('INS-ACE',   'Acetileno industrial',                 'INSUMO',      'UND',  true,    2),
  ('INS-ARG',   'Argón industrial',                     'INSUMO',      'UND',  true,    2),
  ('INS-E7018', 'Electrodo 7018 de 1/8',                'INSUMO',      'KG',   true,   50),
  ('INS-E6013', 'Electrodo 6013 de 1/8',                'INSUMO',      'KG',   true,   50),
  ('INS-EREV',  'Electrodo de revestimiento duro',      'INSUMO',      'KG',   true,   30),
  ('INS-ALA',   'Alambre de soldadura MIG 0.9',         'INSUMO',      'KG',   true,   20),
  ('INS-DISC',  'Disco de corte de 14 pulgadas',        'INSUMO',      'UND',  true,   20),
  ('INS-DISD',  'Disco de desbaste de 7 pulgadas',      'INSUMO',      'UND',  true,   20),
  ('INS-LIJ',   'Lija para metal',                      'INSUMO',      'UND',  true,   20),
  ('INS-TRA',   'Trapo industrial',                     'INSUMO',      'KG',   true,   20),
  ('INS-SEL',   'Sellador de silicón',                  'INSUMO',      'UND',  true,   10),
  ('INS-TEF',   'Cinta de teflón',                      'INSUMO',      'ROLLO',true,   20),
  ('INS-AIS',   'Cinta aislante',                       'INSUMO',      'ROLLO',true,   20),
  ('INS-PINA',  'Pintura anticorrosiva',                'INSUMO',      'GAL',  true,    8),
  ('INS-THI',   'Thinner',                              'INSUMO',      'GAL',  true,    8),
  ('INS-BRO',   'Brocha de 4 pulgadas',                 'INSUMO',      'UND',  true,   10),
  ('INS-SOG',   'Soga de 3/4 de pulgada',               'INSUMO',      'M',    true,   50),
  ('INS-CAB',   'Cable de acero de 1/2 pulgada',        'INSUMO',      'M',    true,   50),
  ('INS-ESL',   'Eslinga de 5 toneladas',               'INSUMO',      'UND',  true,    4),
  ('INS-GRI',   'Grillete de 1 pulgada',                'INSUMO',      'UND',  true,    8),
  ('INS-TOR',   'Tornillería surtida',                  'INSUMO',      'CAJA', true,    4),

  -- Equipo de protección personal --------------------------------------------
  ('EPP-CHA',   'Chaleco reflectivo',                   'EPP',         'UND',  true,   20),
  ('EPP-MAS',   'Mascarilla contra polvo N95',          'EPP',         'CAJA', true,    6),
  ('EPP-RES',   'Respirador de media cara',             'EPP',         'UND',  true,    8),
  ('EPP-FILR',  'Filtro para respirador',               'EPP',         'PAR',  true,   16),
  ('EPP-GUAN',  'Guantes de nitrilo',                   'EPP',         'PAR',  true,   30),
  ('EPP-BOTG',  'Botas de goma',                        'EPP',         'PAR',  true,   10),
  ('EPP-UNI',   'Uniforme de trabajo',                  'EPP',         'JGO',  true,   15),
  ('EPP-IMP',   'Impermeable',                          'EPP',         'UND',  true,   10),
  ('EPP-ARN',   'Arnés de seguridad',                   'EPP',         'UND',  true,    4),
  ('EPP-LIN',   'Línea de vida con absorbedor',         'EPP',         'UND',  true,    4),
  ('EPP-TAP',   'Tapones auditivos',                    'EPP',         'PAR',  true,   40),
  ('EPP-CAR',   'Careta para soldar',                   'EPP',         'UND',  true,    4),
  ('EPP-MANC',  'Mangas de carnaza',                    'EPP',         'PAR',  true,    8),
  ('EPP-DEL',   'Delantal de carnaza',                  'EPP',         'UND',  true,    6),
  ('EPP-POL',   'Polainas de carnaza',                  'EPP',         'PAR',  true,    6),

  -- Herramienta --------------------------------------------------------------
  ('HER-LLAM',  'Juego de llaves mixtas',               'HERRAMIENTA', 'JGO',  true,    2),
  ('HER-LLAT',  'Llave de tubo de 18 pulgadas',         'HERRAMIENTA', 'UND',  true,    2),
  ('HER-LLAA',  'Juego de llaves Allen',                'HERRAMIENTA', 'JGO',  true,    2),
  ('HER-DEST',  'Juego de destornilladores',            'HERRAMIENTA', 'JGO',  true,    2),
  ('HER-PIN',   'Juego de pinzas',                      'HERRAMIENTA', 'JGO',  true,    2),
  ('HER-MART',  'Martillo de bola',                     'HERRAMIENTA', 'UND',  true,    3),
  ('HER-MAND',  'Mandarria de 12 libras',               'HERRAMIENTA', 'UND',  true,    2),
  ('HER-BAR',   'Barra de acero',                       'HERRAMIENTA', 'UND',  true,    3),
  ('HER-PALA',  'Pala',                                 'HERRAMIENTA', 'UND',  true,    6),
  ('HER-PICO',  'Pico',                                 'HERRAMIENTA', 'UND',  true,    4),
  ('HER-CARR',  'Carretilla',                           'HERRAMIENTA', 'UND',  true,    3),
  ('HER-ESM',   'Esmeril angular de 7 pulgadas',        'HERRAMIENTA', 'UND',  true,    2),
  ('HER-TAL',   'Taladro percutor',                     'HERRAMIENTA', 'UND',  true,    2),
  ('HER-SOLD',  'Máquina de soldar de 300 amperios',    'HERRAMIENTA', 'UND',  true,    1),
  ('HER-COMP',  'Compresor de aire',                    'HERRAMIENTA', 'UND',  true,    1),
  ('HER-GATO',  'Gato hidráulico de 20 toneladas',      'HERRAMIENTA', 'UND',  true,    2),
  ('HER-EXTR',  'Extractor de rodamientos',             'HERRAMIENTA', 'UND',  true,    1),
  ('HER-TORQ',  'Torquímetro',                          'HERRAMIENTA', 'UND',  true,    1),
  ('HER-ENGR',  'Engrasadora manual',                   'HERRAMIENTA', 'UND',  true,    2),
  ('HER-SIER',  'Sierra de mano',                       'HERRAMIENTA', 'UND',  true,    2),
  ('HER-CINT',  'Cinta métrica de 8 metros',            'HERRAMIENTA', 'UND',  true,    4),
  ('HER-NIV',   'Nivel de burbuja',                     'HERRAMIENTA', 'UND',  true,    2),
  ('HER-MULT',  'Multímetro',                           'HERRAMIENTA', 'UND',  true,    2),
  ('HER-LINT',  'Linterna recargable',                  'HERRAMIENTA', 'UND',  true,    6),
  ('HER-ESCA',  'Escalera de fibra de 8 pies',          'HERRAMIENTA', 'UND',  true,    2),

  -- Repuesto: trituración y transporte de material ---------------------------
  ('REP-MANF',  'Muela fija de mandíbula',              'REPUESTO',    'UND',  true,    1),
  ('REP-MANM',  'Muela móvil de mandíbula',             'REPUESTO',    'UND',  true,    1),
  ('REP-MANT',  'Manto de cono',                        'REPUESTO',    'UND',  true,    1),
  ('REP-CONC',  'Cóncavo de cono',                      'REPUESTO',    'UND',  true,    1),
  ('REP-MART',  'Martillo de impactor',                 'REPUESTO',    'UND',  true,    2),
  ('REP-MALL1', 'Malla de zaranda de 1 pulgada',        'REPUESTO',    'UND',  true,    2),
  ('REP-MALL2', 'Malla de zaranda de 3/4 de pulgada',   'REPUESTO',    'UND',  true,    2),
  ('REP-MALL3', 'Malla de zaranda de 1/2 pulgada',      'REPUESTO',    'UND',  true,    2),
  ('REP-CORR',  'Correa transportadora de 24 pulgadas', 'REPUESTO',    'M',    true,   20),
  ('REP-ROLC',  'Rodillo de carga',                     'REPUESTO',    'UND',  true,    8),
  ('REP-ROLR',  'Rodillo de retorno',                   'REPUESTO',    'UND',  true,    8),
  ('REP-POLE',  'Polea de cola',                        'REPUESTO',    'UND',  true,    1),
  ('REP-CHUM',  'Chumacera',                            'REPUESTO',    'UND',  true,    4),
  ('REP-GRAP',  'Grapa para correa',                    'REPUESTO',    'JGO',  true,    4),

  -- Repuesto: filtros --------------------------------------------------------
  ('REP-FILH',  'Filtro hidráulico',                    'REPUESTO',    'UND',  true,    6),
  ('REP-FILR',  'Filtro de refrigerante',               'REPUESTO',    'UND',  true,    4),
  ('REP-FILS',  'Filtro separador de agua',             'REPUESTO',    'UND',  true,    6),
  ('REP-FILT',  'Filtro de transmisión',                'REPUESTO',    'UND',  true,    4),

  -- Repuesto: motor y tren de potencia ---------------------------------------
  ('REP-BAT',   'Batería de 27 placas',                 'REPUESTO',    'UND',  true,    2),
  ('REP-ALT',   'Alternador',                           'REPUESTO',    'UND',  true,    1),
  ('REP-ARR',   'Motor de arranque',                    'REPUESTO',    'UND',  true,    1),
  ('REP-INY',   'Inyector',                             'REPUESTO',    'UND',  true,    2),
  ('REP-TURB',  'Turbo alimentador',                    'REPUESTO',    'UND',  true,    1),
  ('REP-RADI',  'Radiador',                             'REPUESTO',    'UND',  true,    1),
  ('REP-BOMA',  'Bomba de agua',                        'REPUESTO',    'UND',  true,    1),
  ('REP-TERM',  'Termostato',                           'REPUESTO',    'UND',  true,    2),
  ('REP-CORV',  'Correa en V',                          'REPUESTO',    'UND',  true,    4),
  ('REP-EMPA',  'Juego de empacaduras',                 'REPUESTO',    'JGO',  true,    2),
  ('REP-EMBR',  'Disco de embrague',                    'REPUESTO',    'UND',  true,    1),

  -- Repuesto: hidráulica -----------------------------------------------------
  ('REP-MANG',  'Manguera hidráulica de 1/2 pulgada',   'REPUESTO',    'M',    true,   20),
  ('REP-CONX',  'Conexión hidráulica',                  'REPUESTO',    'UND',  true,   10),
  ('REP-CILH',  'Cilindro hidráulico',                  'REPUESTO',    'UND',  true,    1),
  ('REP-BOMH',  'Bomba hidráulica',                     'REPUESTO',    'UND',  true,    1),
  ('REP-ORIN',  'Juego de O-rings',                     'REPUESTO',    'JGO',  true,    4),

  -- Repuesto: rodaje, cucharón y suspensión ----------------------------------
  ('REP-ZAPA',  'Zapata de oruga',                      'REPUESTO',    'UND',  true,    4),
  ('REP-DIEN',  'Diente de cucharón',                   'REPUESTO',    'UND',  true,   10),
  ('REP-ADAP',  'Adaptador de diente',                  'REPUESTO',    'UND',  true,    6),
  ('REP-CUCH',  'Cuchilla de cargador',                 'REPUESTO',    'UND',  true,    2),
  ('REP-ESQU',  'Esquinero de cucharón',                'REPUESTO',    'PAR',  true,    2),
  ('REP-PAST',  'Pastillas de freno',                   'REPUESTO',    'JGO',  true,    2),
  ('REP-AMOR',  'Amortiguador',                         'REPUESTO',    'UND',  true,    2),
  ('REP-MUEL',  'Muelle de suspensión',                 'REPUESTO',    'UND',  true,    2),

  -- Explosivo ----------------------------------------------------------------
  ('EXP-COR',   'Cordón detonante',                     'EXPLOSIVO',   'M',    true,  200),
  ('EXP-MEC',   'Mecha lenta',                          'EXPLOSIVO',   'M',    true,  100),
  ('EXP-FUL',   'Fulminante',                           'EXPLOSIVO',   'UND',  true,   50),
  ('EXP-ANFO',  'ANFO',                                 'EXPLOSIVO',   'KG',   true,  200),
  ('EXP-BOO',   'Booster',                              'EXPLOSIVO',   'UND',  true,   20),
  ('EXP-RET',   'Retardo de superficie',                'EXPLOSIVO',   'UND',  true,   30),

  -- Servicio (nunca inventariable: lo impide un CHECK) ------------------------
  ('SRV-TOR',   'Torneado y rectificación',             'SERVICIO',    'SERV', false,   0),
  ('SRV-SOL',   'Soldadura especializada',              'SERVICIO',    'SERV', false,   0),
  ('SRV-VUL',   'Vulcanizado de correa',                'SERVICIO',    'SERV', false,   0),
  ('SRV-HID',   'Reparación de mangueras hidráulicas',  'SERVICIO',    'SERV', false,   0),
  ('SRV-CAU',   'Servicio de caucheras',                'SERVICIO',    'SERV', false,   0),
  ('SRV-GRU',   'Alquiler de grúa',                     'SERVICIO',    'HORA', false,   0),
  ('SRV-PER',   'Perforación',                          'SERVICIO',    'HORA', false,   0),
  ('SRV-LOW',   'Transporte de maquinaria en lowboy',   'SERVICIO',    'SERV', false,   0),
  ('SRV-CAL',   'Calibración de romana',                'SERVICIO',    'SERV', false,   0),
  ('SRV-LAB',   'Análisis de laboratorio de material',  'SERVICIO',    'SERV', false,   0),
  ('SRV-TOP',   'Levantamiento topográfico',            'SERVICIO',    'SERV', false,   0),
  ('SRV-MAN',   'Mantenimiento preventivo externo',     'SERVICIO',    'SERV', false,   0)
on conflict (codigo) do nothing;
