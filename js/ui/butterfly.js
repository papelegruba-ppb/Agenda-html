export function butterflySvg() {
  return `
    <svg viewBox="0 0 48 48" class="butterfly-svg" aria-hidden="true">
      <defs>
        <filter id="butterfly-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="currentColor" flood-opacity="0.35"/>
        </filter>
      </defs>
      <g filter="url(#butterfly-shadow)" fill="none"
         stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">
        <!-- Ala superior izquierda -->
        <path d="M24 22 C18 8 6 6 4 12 C2 18 10 22 20 22"/>
        <!-- Ala superior derecha -->
        <path d="M24 22 C30 8 42 6 44 12 C46 18 38 22 28 22"/>
        <!-- Ala inferior izquierda -->
        <path d="M24 22 C18 30 8 32 6 38 C4 43 12 42 18 36 C22 32 24 26 24 22"/>
        <!-- Ala inferior derecha -->
        <path d="M24 22 C30 30 40 32 42 38 C44 43 36 42 30 36 C26 32 24 26 24 22"/>
        <!-- Cuerpo -->
        <line x1="24" y1="18" x2="24" y2="30"/>
        <circle cx="24" cy="17" r="1.5"/>
        <!-- Antenas -->
        <path d="M24 17 C22 13 19 11 18 10"/>
        <path d="M24 17 C26 13 29 11 30 10"/>
        <circle cx="18" cy="10" r="0.8" fill="currentColor"/>
        <circle cx="30" cy="10" r="0.8" fill="currentColor"/>
      </g>
    </svg>
  `;
}
