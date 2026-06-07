import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold tracking-[-0.01em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
  {
    variants: {
      variant: {
        // A subtle inset top-highlight (sheen) + a soft color-tinted glow give
        // the primary action a premium, tactile depth. The sheen uses an inset
        // shadow rather than a stacked gradient so the brand fill never gets
        // dropped by tailwind-merge's bg-* conflict resolution.
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.2),0_2px_8px_-2px_hsl(var(--primary)/0.45),0_10px_22px_-8px_hsl(var(--primary)/0.4)] hover:brightness-[1.05] hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.22),0_4px_12px_-2px_hsl(var(--primary)/0.5),0_14px_28px_-8px_hsl(var(--primary)/0.45)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        outline:
          "border border-hairline bg-card text-foreground shadow-soft hover:bg-secondary hover:border-border",
        ghost: "text-foreground hover:bg-secondary",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.2),0_2px_8px_-2px_hsl(var(--destructive)/0.45),0_10px_22px_-8px_hsl(var(--destructive)/0.4)] hover:brightness-[1.05]",
      },
      size: {
        // 48px minimum touch target per the mobile-first spec.
        default: "min-h-touch px-4 py-2",
        sm: "h-10 px-3.5 rounded-xl",
        lg: "min-h-[52px] px-6 text-base",
        icon: "min-h-touch min-w-touch rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
