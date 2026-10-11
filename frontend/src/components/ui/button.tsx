import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// 动森胶囊按钮：实体按钮带底部实色厚边，按下时下沉、厚边消失
const pressable = "active:translate-y-[3px] active:shadow-none";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-bold ring-offset-background transition-[transform,box-shadow,background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: cn("bg-primary text-primary-foreground shadow-edge-primary hover:brightness-105", pressable),
        destructive: cn(
          "bg-destructive text-destructive-foreground shadow-edge-destructive hover:brightness-105",
          pressable
        ),
        outline: cn(
          "border-2 border-border bg-card text-foreground shadow-edge hover:border-primary/50 hover:text-primary",
          pressable
        ),
        secondary: cn("bg-secondary text-secondary-foreground shadow-edge hover:bg-secondary/80", pressable),
        ghost: "font-semibold hover:bg-accent hover:text-accent-foreground",
        link: "font-semibold text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 px-4",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
