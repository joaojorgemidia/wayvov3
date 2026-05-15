import { Card } from "@/components/ui/card";
import { UserSearch } from "lucide-react";

export default function AntecedentesPage() {
  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Antecedentes</h2>
      <Card className="flex flex-col items-center justify-center p-12 text-center">
        <UserSearch className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-lg font-medium text-muted-foreground">Em breve</p>
      </Card>
    </div>
  );
}
