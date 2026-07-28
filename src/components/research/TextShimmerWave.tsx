type Props = {
  readonly label: string;
};

export function TextShimmerWave({ label }: Props) {
  return (
    <span className="text-shimmer-wave" aria-hidden="true">
      {[...label].map((character, index) => (
        <span
          className="text-shimmer-wave__character"
          key={label.slice(0, index + 1)}
          style={{ animationDelay: `${index * 90}ms` }}
        >
          {character}
        </span>
      ))}
    </span>
  );
}
