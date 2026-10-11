export function butterflySvg() {
  return `
    <svg viewBox="0 0 100 100" class="butterfly-svg" aria-hidden="true"
         fill="none" stroke="currentColor"
         stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <!-- Ala superior izquierda -->
      <path d="M50 42
               C40 22 12 12 6 26
               C0 40 18 46 40 46"/>
      <!-- Ala superior derecha -->
      <path d="M50 42
               C60 22 88 12 94 26
               C100 40 82 46 60 46"/>
      <!-- Ala inferior izquierda -->
      <path d="M50 46
               C38 56 20 62 14 76
               C10 88 26 92 40 80
               C46 74 50 60 50 46"/>
      <!-- Ala inferior derecha -->
      <path d="M50 46
               C62 56 80 62 86 76
               C90 88 74 92 60 80
               C54 74 50 60 50 46"/>
      <!-- Cuerpo -->
      <line x1="50" y1="38" x2="50" y2="62"/>
      <circle cx="50" cy="36" r="3"/>
      <!-- Antenas -->
      <path d="M50 36 C45 28 40 24 36 22"/>
      <path d="M50 36 C55 28 60 24 64 22"/>
      <circle cx="36" cy="22" r="1.5" fill="currentColor"/>
      <circle cx="64" cy="22" r="1.5" fill="currentColor"/>
    </svg>
  `;
}
