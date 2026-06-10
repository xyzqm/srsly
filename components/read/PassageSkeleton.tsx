export default function PassageSkeleton() {
  const titleWidth = '45%';
  // Vary line widths to mimic a natural paragraph
  const lines = [1, 0.97, 1, 0.94, 0.61];

  return (
    <div>
      {/* Title shimmer */}
      <div
        className="shimmer"
        style={{ height: 28, width: titleWidth, borderRadius: 6, marginBottom: 20 }}
      />

      {/* Passage line shimmers */}
      <div style={{ padding: '8px 4px 4px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {lines.map((w, i) => (
          <div
            key={i}
            className="shimmer"
            style={{
              height: 26,
              borderRadius: 5,
              width: `${w * 100}%`,
              animationDelay: `${i * 0.08}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
