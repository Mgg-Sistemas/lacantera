const stack = [
  { nombre: 'React', version: '19' },
  { nombre: 'Vite', version: '8' },
  { nombre: 'TypeScript', version: '6' },
  { nombre: 'Tailwind CSS', version: '4' },
  { nombre: 'Supabase JS', version: '2' },
]

/**
 * Pantalla de verificacion del entorno.
 * Se reemplaza por la landing page y el shell de la aplicacion una vez
 * aprobado el diseno.
 */
function App() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 px-6 py-16">
      <header className="text-center">
        <p className="text-sm font-medium tracking-widest text-amber-600 uppercase">
          Sistema de control interno
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
          La Cantera
        </h1>
        <p className="mt-4 max-w-md text-balance text-slate-600 dark:text-slate-400">
          Entorno de desarrollo funcionando. Edita{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm dark:bg-slate-800">
            src/App.tsx
          </code>{' '}
          y guarda para ver el refresco en caliente.
        </p>
      </header>

      <ul className="grid w-full max-w-md grid-cols-2 gap-2 sm:grid-cols-3">
        {stack.map((item) => (
          <li
            key={item.nombre}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center dark:border-slate-800 dark:bg-slate-900"
          >
            <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
              {item.nombre}
            </span>
            <span className="block text-xs text-slate-500">v{item.version}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}

export default App
