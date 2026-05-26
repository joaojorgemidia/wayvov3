/** Variantes oficiais do brandbook WAYVO:
 *  light   — fundo branco · símbolo verde · texto #0A1810  (sidebar, topbar claro)
 *  dark    — fundo preto  · símbolo verde · texto branco   (app dark)
 *  verde   — fundo verde  · símbolo branco · texto branco  (fundo de marca)
 *  noturno — fundo navy   · símbolo verde · texto branco   (UI noturna)
 */
export type WayvoLogoVariant = 'light' | 'dark' | 'verde' | 'noturno';

interface WayvoLogoProps {
  variant?: WayvoLogoVariant;
  collapsed?: boolean;
}

const BRAND   = '#00C86A';
const WHITE   = '#FFFFFF';
const DARK    = '#0A1810';

function symbolColor(variant: WayvoLogoVariant) {
  return variant === 'verde' ? WHITE : BRAND;
}

function textColor(variant: WayvoLogoVariant) {
  return variant === 'light' ? DARK : WHITE;
}

function WayvoSymbol({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 42 48"
      width={size}
      height={Math.round(size * (48 / 42))}
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Ghost trail — visível acima de 22 px */}
      <polyline
        points="4,16 12,23 4,30"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.2"
      />
      {/* Braço superior afunilado */}
      <polygon points="17.6,3.4 32.1,18.9 29.9,21.1 14.4,6.6" fill={color} />
      {/* Braço inferior afunilado */}
      <polygon points="14.4,39.4 29.9,24.9 32.1,27.1 17.6,42.6" fill={color} />
      {/* Waypoint circle */}
      <circle cx="34" cy="23" r="4.5" fill={color} />
    </svg>
  );
}

export function WayvoLogo({ variant = 'light', collapsed = false }: WayvoLogoProps) {
  const symColor  = symbolColor(variant);
  const wordColor = textColor(variant);

  if (collapsed) {
    return <WayvoSymbol color={symColor} size={26} />;
  }

  return (
    <div className="flex items-center gap-2.5" aria-label="wayvo">
      <WayvoSymbol color={symColor} size={26} />
      <span
        style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 700,
          letterSpacing: '0.06em',
          fontSize: '18px',
          color: wordColor,
          lineHeight: 1,
        }}
      >
        wayvo
      </span>
    </div>
  );
}
