interface MinerIllustrationProps {
  className?: string
}

/**
 * Ilustración del login.
 *
 * Materio pone un personaje 3D con un portátil. Aquí el personaje es un
 * minero con tableta: no está picando piedra, está registrando el despacho.
 * Es deliberado — el sistema no vive en el frente de explotación, vive en el
 * momento en que alguien anota lo que salió. Esa es la operación que el
 * software cambia.
 *
 * Vector plano, sin dependencias ni imágenes externas: escala sin pesar y no
 * suma una petición de red al arranque. Los brazos van como trazo con remate
 * redondo en vez de silueta rellena — a este tamaño una silueta se lee como
 * un bulto, y el trazo mantiene el grosor constante en el codo.
 */
export function MinerIllustration({ className }: MinerIllustrationProps) {
  return (
    <svg
      viewBox="0 0 360 430"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Ilustración de un minero registrando producción en una tableta"
    >
      <defs>
        <linearGradient id="miner-shirt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3B62F0" />
          <stop offset="100%" stopColor="#2340B4" />
        </linearGradient>
        <linearGradient id="miner-helmet-fill" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#F7B845" />
          <stop offset="100%" stopColor="#E08E17" />
        </linearGradient>
        <linearGradient id="miner-lamp" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFF6DC" />
          <stop offset="100%" stopColor="#FFE29A" />
        </linearGradient>
      </defs>

      {/* Sombra en el piso: ancla la figura para que no flote */}
      <ellipse cx="180" cy="400" rx="112" ry="14" fill="#262C3D" opacity="0.07" />

      {/* Acopio de agregado, detrás de la figura.
          Tres granulometrías de mayor a menor, que es el orden en que salen
          de la zaranda. */}
      <path d="M268 400 L296 354 L324 400 Z" fill="#C6CBDA" />
      <path d="M296 354 L324 400 L338 400 L314 362 Z" fill="#AEB4C7" />
      <path d="M304 400 L318 378 L332 400 Z" fill="#D9DDE8" />

      {/* --- Piernas --- */}
      <path d="M152 262 h26 v106 a13 13 0 0 1 -26 0 Z" fill="#1D358F" />
      <path d="M186 262 h26 v106 a13 13 0 0 1 -26 0 Z" fill="#1A2E73" />
      <path d="M146 368 h37 v14 a6 6 0 0 1 -6 6 h-25 a6 6 0 0 1 -6 -6 Z" fill="#3A4256" />
      <path d="M181 368 h37 v14 a6 6 0 0 1 -6 6 h-25 a6 6 0 0 1 -6 -6 Z" fill="#262C3D" />

      {/* --- Torso --- */}
      <path
        d="M180 166 c26 0 46 14 50 36 l7 50 a15 15 0 0 1 -15 17 h-84 a15 15 0 0 1 -15 -17 l7 -50 c4 -22 24 -36 50 -36 Z"
        fill="url(#miner-shirt)"
      />

      {/* Chaleco reflectivo: el único cálido de toda la interfaz */}
      <path d="M157 176 h13 l-5 93 h-14 Z" fill="#F0A128" opacity="0.92" />
      <path d="M196 176 h13 l6 93 h-14 Z" fill="#F0A128" opacity="0.92" />
      <path d="M144 220 h72 v13 h-72 Z" fill="#F0A128" opacity="0.92" />

      {/* --- Brazos ---
          Ambos se cierran al frente sobre la tableta. Con un solo brazo
          extendido la figura queda desbalanceada y el objeto parece a punto
          de caerse. */}
      <path
        d="M143 196 C126 214 122 244 132 274"
        stroke="#1D358F"
        strokeWidth="23"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M217 196 C234 214 238 244 228 274"
        stroke="#1D358F"
        strokeWidth="23"
        strokeLinecap="round"
        fill="none"
      />

      {/* --- Cuello --- */}
      <path d="M168 146 h24 v24 h-24 Z" fill="#D9A078" />

      {/* --- Cabeza --- */}
      <ellipse cx="180" cy="126" rx="35" ry="37" fill="#E8B48D" />
      <circle cx="146" cy="130" r="7" fill="#D9A078" />
      <circle cx="214" cy="130" r="7" fill="#D9A078" />

      {/* Rasgos mínimos: más detalle la vuelve caricatura */}
      <ellipse cx="168" cy="126" rx="3.2" ry="4.2" fill="#262C3D" />
      <ellipse cx="193" cy="126" rx="3.2" ry="4.2" fill="#262C3D" />
      <path
        d="M170 142 q10 8 20 0"
        stroke="#262C3D"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />

      {/* --- Casco --- */}
      <path d="M176 66 h8 v26 h-8 Z" fill="#C87C12" opacity="0.45" />
      <path d="M141 106 a39 39 0 0 1 78 0 Z" fill="url(#miner-helmet-fill)" />
      <path
        d="M131 104 h98 a7 7 0 0 1 7 7 v3 a7 7 0 0 1 -7 7 h-98 a7 7 0 0 1 -7 -7 v-3 a7 7 0 0 1 7 -7 Z"
        fill="#E08E17"
      />
      <circle cx="180" cy="86" r="11" fill="#C87C12" />
      <circle cx="180" cy="86" r="7.5" fill="url(#miner-lamp)" />

      {/* --- Tableta ---
          Va después de los brazos para quedar delante, y las manos encima
          de ella para que se lea que la sostiene. */}
      <g transform="rotate(-4 180 288)">
        <rect x="132" y="258" width="96" height="62" rx="8" fill="#FFFFFF" />
        <rect
          x="132"
          y="258"
          width="96"
          height="62"
          rx="8"
          stroke="#262C3D"
          strokeOpacity="0.1"
          strokeWidth="1.5"
        />
        {/* Encabezado y barras: la producción del turno */}
        <rect x="143" y="268" width="38" height="5" rx="2.5" fill="#262C3D" opacity="0.16" />
        <rect x="143" y="296" width="9" height="12" rx="2.5" fill="#BCCBFF" />
        <rect x="158" y="288" width="9" height="20" rx="2.5" fill="#92A9FC" />
        <rect x="173" y="280" width="9" height="28" rx="2.5" fill="#3B62F0" />
        <rect x="188" y="292" width="9" height="16" rx="2.5" fill="#BCCBFF" />
        <rect x="203" y="284" width="9" height="24" rx="2.5" fill="#6484F7" />
      </g>

      {/* Manos, encima de la tableta */}
      <circle cx="132" cy="278" r="12.5" fill="#E8B48D" />
      <circle cx="228" cy="278" r="12.5" fill="#E8B48D" />
    </svg>
  )
}
