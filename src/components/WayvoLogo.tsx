import wayvoLogoLight from "@/assets/wayvo-logo-light.png";
import wayvoLogoDark from "@/assets/wayvo-logo-dark.png";
import wayvoLogoGreen from "@/assets/wayvo-logo-green.png";
import wayvoIcon from "@/assets/wayvo-icon.png";

/** Variantes oficiais do brandbook WAYVO */
export type WayvoLogoVariant = 'light' | 'dark' | 'verde' | 'noturno';

interface WayvoLogoProps {
  variant?: WayvoLogoVariant;
  collapsed?: boolean;
}

function logoSrc(variant: WayvoLogoVariant) {
  switch (variant) {
    case 'verde': return wayvoLogoGreen;
    case 'dark':
    case 'noturno': return wayvoLogoDark;
    case 'light':
    default: return wayvoLogoLight;
  }
}

export function WayvoLogo({ variant = 'light', collapsed = false }: WayvoLogoProps) {
  if (collapsed) {
    return (
      <img
        src={wayvoIcon}
        alt="wayvo"
        style={{ height: 28, width: 28, display: 'block' }}
      />
    );
  }

  return (
    <img
      src={logoSrc(variant)}
      alt="wayvo"
      style={{ height: 26, width: 'auto', display: 'block' }}
    />
  );
}
