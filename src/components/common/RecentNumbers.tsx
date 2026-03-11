import { X, Clock } from "lucide-react";
import { RecentNumber } from "@/hooks/useRecentNumbers";
import { cn } from "@/lib/utils";

interface RecentNumbersProps {
  numbers: RecentNumber[];
  onSelect: (number: string) => void;
  onClear: () => void;
  className?: string;
}

const RecentNumbers = ({ numbers, onSelect, onClear, className }: RecentNumbersProps) => {
  if (numbers.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Recent</span>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-destructive hover:underline flex items-center gap-1"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {numbers.map((item) => (
          <button
            key={item.number}
            onClick={() => onSelect(item.number)}
            className="flex-shrink-0 px-3 py-2 rounded-xl border border-border bg-background/50 hover:border-primary/50 hover:bg-primary/5 transition-all text-left min-w-0"
          >
            {item.name && (
              <p className="text-xs font-medium text-foreground truncate max-w-[120px]">
                {item.name}
              </p>
            )}
            <p className="text-xs text-muted-foreground tabular-nums">{item.number}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RecentNumbers;
