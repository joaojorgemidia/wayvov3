export type VehicleFilter = "todos" | "moto" | "carro";

export function VehicleFilterChips({ value, onChange }: { value: VehicleFilter; onChange: (v: VehicleFilter) => void }) {
  const options: { value: VehicleFilter; label: string }[] = [
    { value: "todos", label: "Todos" },
    { value: "moto", label: "Motos" },
    { value: "carro", label: "Carros" },
  ];
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              active
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
