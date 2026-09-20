import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

const sizeMap = {
  sm: { icon: 16, text: "text-base" },
  md: { icon: 20, text: "text-lg" },
  lg: { icon: 28, text: "text-2xl" },
};

/**
 * ClauseWise logo — icon + wordmark.
 * Use showText={false} for icon-only variants (e.g. collapsed sidebar).
 */
export function Logo({ className, size = "md", showText = true }: LogoProps) {
  const { icon, text } = sizeMap[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center justify-center rounded-md bg-primary p-1.5">
        <Scale
          size={icon}
          className="text-primary-foreground"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>
      {showText && (
        <span
          className={cn(
            "font-semibold tracking-tight text-foreground",
            text
          )}
        >
          ClauseWise
        </span>
      )}
    </div>
  );
}

