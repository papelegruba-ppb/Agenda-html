
export function butterflySvg() {
  return `
    <svg
      class="butterfly-svg"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <!-- Silueta simétrica de las cuatro alas -->
      <path d="
        M48 39
        C39 24, 20 9, 8 5
        C4 4, 4 15, 5 25
        C6 37, 9 46, 13 51
        C18 55, 25 56, 34 57
        C26 58, 17 59, 14 62
        C13 64, 17 70, 19 76
        C21 83, 19 92, 27 94
        C36 96, 44 82, 49 66
        C50 72, 50 77, 50 78
        C50 77, 50 72, 51 66
        C56 82, 64 96, 73 94
        C81 92, 79 83, 81 76
        C83 70, 87 64, 86 62
        C83 59, 74 58, 66 57
        C75 56, 82 55, 87 51
        C91 46, 94 37, 95 25
        C96 15, 96 4, 92 5
        C80 9, 61 24, 52 39
      "/>

      <!-- Cuerpo central fino -->
      <path d="
        M50 42
        C48 49, 48 57, 50 65
        C52 57, 52 49, 50 42
      "/>

      <!-- Cabeza -->
      <circle cx="50" cy="40" r="3.2"/>

      <!-- Antenas -->
      <path d="M48 37 C46 29, 43 22, 37 17"/>
      <path d="M52 37 C54 29, 57 22, 63 17"/>

      <!-- Extremos de las antenas -->
      <circle cx="37" cy="17" r="1.1"/>
      <circle cx="63" cy="17" r="1.1"/>
    </svg>
  `;
}
