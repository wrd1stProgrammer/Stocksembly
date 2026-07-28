type PrismRevealTextProps = {
  readonly text: string;
  readonly className?: string;
};

export function PrismRevealText({ text, className }: PrismRevealTextProps) {
  const classes = ["prism-reveal-text", className].filter(Boolean).join(" ");

  return <span className={classes}>{text}</span>;
}
