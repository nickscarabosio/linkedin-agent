import { forwardRef, ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-blue-600 text-white hover:bg-blue-700",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        success: "bg-green-600 text-white hover:bg-green-700",
        outline: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
        ghost: "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
        link: "text-blue-600 hover:underline",
      },
      size: {
        default: "px-4 py-2",
        sm: "px-3 py-1.5",
        lg: "px-6 py-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
export type { ButtonProps };
