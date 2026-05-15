interface WayvoLogoProps {
  variant?: 'default' | 'dark' | 'mono';
  collapsed?: boolean;
}

export function WayvoLogo({ variant = 'default', collapsed = false }: WayvoLogoProps) {
  const coral = '#E11D48';
  const outer = variant === 'mono' ? (variant === 'dark' ? '#FAFAFA' : '#09090B') : coral;
  const inner = variant === 'dark' ? '#FAFAFA' : '#09090B';
  const text  = variant === 'dark' ? '#FAFAFA' : '#09090B';

  if (collapsed) {
    return (
      <svg
        viewBox="0 0 28 28"
        width="24"
        height="24"
        fill="none"
        aria-label="Wayvo"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polyline
          points="3,2 14,14 3,26"
          stroke={outer}
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="18,6 25,14 18,22"
          stroke={inner}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 148 40"
      width="148"
      height="40"
      fill="none"
      aria-label="Wayvo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polyline
        points="6,4 22,20 6,36"
        stroke={outer}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="28,9 38,20 28,31"
        stroke={inner}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="48"
        y="26"
        fontFamily="'Inter', system-ui, -apple-system, sans-serif"
        fontSize="22"
        fontWeight="700"
        letterSpacing="-0.5"
        fill={text}
      >
        wayvo
      </text>
    </svg>
  );
}
