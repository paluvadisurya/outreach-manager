import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-[-0.01em] ring-1 ring-inset ring-black/[0.03]",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        success:
          "bg-success text-success-foreground ring-transparent shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.18)]",
        destructive: "bg-destructive/10 text-destructive ring-destructive/10",
        outline: "border border-hairline text-foreground ring-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
