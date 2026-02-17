import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        className={cn(
          "block w-full rounded-md border border-gray-300 px-3 py-2 text-sm",
          "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
export type { InputProps };
