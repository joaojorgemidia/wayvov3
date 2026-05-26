/**
 * WAYVO Logo — vetor oficial conforme Brandbook 2025 (página 6 e 8).
 * Símbolo: viewBox 0 0 44 50, chevron + waypoint + linha fina (rastro).
 * Wordmark: Syne 700 lowercase, tracking 0.06em.
 * Cores oficiais: brand #00C86A.
 *
 * Abaixo de 22px o rastro (linha fina) desaparece automaticamente — simplifica
 * para chevron + waypoint, conforme regra do manual.
 */

/** Variantes oficiais do brandbook WAYVO */
export type WayvoLogoVariant = 'light' | 'dark' | 'verde' | 'noturno';

interface WayvoLogoProps {
  variant?: WayvoLogoVariant;
  /** Modo símbolo-só (sem wordmark) — para sidebar colapsada, favicons */
  collapsed?: boolean;
  /** Altura em px do logo inteiro (símbolo + wordmark). Default 26 */
  size?: number;
  className?: string;
}

const BRAND = '#00C86A';

function colorsFor(variant: WayvoLogoVariant) {
  switch (variant) {
    case 'verde':
      // sobre fundo verde brand → tudo branco
      return { symbol: '#FFFFFF', text: '#FFFFFF' };
    case 'dark':
      // fundo preto/escuro: símbolo verde, texto claro
      return { symbol: BRAND, text: '#E8FBF1' };
    case 'noturno':
      // fundo navy: símbolo verde, texto claro
      return { symbol: BRAND, text: '#E8FBF1' };
    case 'light':
    default:
      // fundo claro: símbolo verde, texto tinta
      return { symbol: BRAND, text: '#0A1810' };
  }
}

/** Apenas o símbolo (chevron + waypoint + rastro). Transparente. */
export function WayvoSymbol({
  size = 32,
  variant = 'light',
  className,
}: {
  size?: number;
  variant?: WayvoLogoVariant;
  className?: string;
}) {
  const { symbol } = colorsFor(variant);
  const showTrail = size >= 22; // regra do manual: abaixo de 22px, sem rastro

  return (
    <svg
      viewBox="0 0 44 50"
      width={(size * 44) / 50}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {/* Linha fina · rastro de velocidade */}
      {showTrail && (
        <polyline
          points="4,19 11,25 4,31"
          stroke={symbol}
          strokeWidth="2.2"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      )}
      {/* Braço superior do chevron */}
      <polygon points="15,3 32,18 30,21 12,7" fill={symbol} />
      {/* Braço inferior do chevron */}
      <polygon points="12,43 30,29 32,32 15,47" fill={symbol} />
      {/* Waypoint */}
      <circle cx="35" cy="25" r="5.5" fill={symbol} />
    </svg>
  );
}

/** Logo horizontal completa (símbolo + wordmark "wayvo"). */
export function WayvoLogo({
  variant = 'light',
  collapsed = false,
  size = 26,
  className,
}: WayvoLogoProps) {
  if (collapsed) {
    return <WayvoSymbol size={size + 2} variant={variant} className={className} />;
  }

  const { text } = colorsFor(variant);
  const wordmarkSize = size * 1.05; // wordmark um pouco maior que altura do símbolo

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.32,
        lineHeight: 1,
      }}
    >
      <WayvoSymbol size={size} variant={variant} />
      <span
        style={{
          fontFamily: "'Syne', system-ui, sans-serif",
          fontWeight: 700,
          fontSize: wordmarkSize,
          letterSpacing: '0.06em',
          color: text,
          lineHeight: 1,
          // garante baseline alinhada ao símbolo
          marginTop: -size * 0.05,
        }}
      >
        wayvo
      </span>
    </div>
  );
}
