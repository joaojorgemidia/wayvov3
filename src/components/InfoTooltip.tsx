import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

interface InfoTooltipProps {
  text: string;
  className?: string;
}

export function InfoTooltip({ text, className }: InfoTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className={`inline h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help ml-1 ${className || ""}`} />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          <p>{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
