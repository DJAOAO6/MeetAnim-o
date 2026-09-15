import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-[var(--theme-card-radius,18px)] border border-animeo-border bg-white shadow-[0_8px_30px_rgb(var(--theme-shadow-rgb)/0.05)] ${className}`}
      {...props}
    />
  );
}
