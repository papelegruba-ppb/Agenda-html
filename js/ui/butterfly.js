export function butterflySvg() {
  return `
    <svg viewBox="0 0 64 64" class="butterfly-svg" aria-hidden="true"
         fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <!-- Ala superior izquierda -->
      <path d="M32 30
               C 24 12, 8 4, 4 12
               C 0 20, 10 28, 26 30"/>
      <path d="M26 30
               C 14 32, 6 38, 10 44
               C 14 50, 26 46, 32 34"/>

      <!-- Ala superior derecha -->
      <path d="M32 30
               C 40 12, 56 4, 60 12
               C 64 20, 54 28, 38 30"/>
      <path d="M38 30
               C 50 32, 58 38, 54 44
               C 50 50, 38 46, 32 34"/>

      <!-- Ala inferior izquierda -->
      <path d="M32 34
               C 26 42, 16 48, 14 54
               C 12 60, 22 60, 28 54
               C 31 50, 32 44, 32 38"/>

      <!-- Ala inferior derecha -->
      <path d="M32 34
               C 38 42, 48 48, 50 54
               C 52 60, 42 60, 36 54
               C 33 50, 32 44, 32 38"/>

      <!-- Cuerpo (fino, vertical) -->
      <line x1="32" y1="26" x2="32" y2="42"/>

      <!-- Cabeza -->
      <circle cx="32" cy="24" r="1.5" fill="currentColor"/>

      <!-- Antenas -->
      <path d="M32 24 C 28 18, 24 14, 22 12"/>
      <path d="M32 24 C 36 18, 40 14, 42 12"/>
      <circle cx="22" cy="12" r="1" fill="currentColor"/>
      <circle cx="42" cy="12" r="1" fill="currentColor"/>
    </svg>
  `;
}
