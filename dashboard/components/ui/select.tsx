import { forwardRef, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => {
    return (
      <select
        className={cn(
          "rounded-md border border-gray-300 px-3 py-2 text-sm",
          "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Select.displayName = "Select";

export { Select };
export type { SelectProps };
