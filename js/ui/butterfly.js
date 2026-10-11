/**
 * js/ui/butterfly.js
 * Mariposa lineal para Papelegruba.
 *
 * - Silueta continua de las cuatro alas (dos grandes arriba, dos más pequeñas abajo).
 * - Cuerpo fino vertical, cabeza pequeña y dos antenas con extremos redondeados.
 * - Solo trazo (`fill="none"`), color heredado con `stroke="currentColor"`.
 * - Escala limpia a cualquier tamaño (mes, semana, día).
 */
export function butterflySvg() {
  return `
    <svg
      class="butterfly-svg"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      stroke-width="2.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <!-- Alas: silueta continua (superior izquierda → inferior izquierda → superior derecha → inferior derecha) -->
      <path d="
        M50 42
        C42 26, 22 12, 10 8
        C5 6, 3 16, 4 27
        C5 39, 9 48, 14 52
        C20 56, 28 57, 38 58
        C28 60, 20 62, 17 66
        C16 69, 22 74, 24 80
        C26 86, 24 93, 32 94
        C41 95, 47 83, 50 68
        C53 83, 59 95, 68 94
        C76 93, 74 86, 76 80
        C78 74, 84 69, 83 66
        C80 62, 72 60, 62 58
        C72 57, 80 56, 86 52
        C91 48, 95 39, 96 27
        C97 16, 95 6, 90 8
        C78 12, 58 26, 50 42
      "/>

      <!-- Cuerpo fino -->
      <line x1="50" y1="44" x2="50" y2="70"/>

      <!-- Cabeza -->
      <circle cx="50" cy="42" r="2.4"/>

      <!-- Antenas -->
      <path d="M47 38 C44 31, 40 25, 35 21"/>
      <path d="M53 38 C56 31, 60 25, 65 21"/>

      <!-- Extremos redondeados de las antenas -->
      <circle cx="35" cy="21" r="1.4"/>
      <circle cx="65" cy="21" r="1.4"/>
    </svg>
  `;
}