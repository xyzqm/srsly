/**
 * The placeholder the three drills show while their first load is in flight.
 *
 * ── IT RESERVES HEIGHT, AND THAT IS THE WHOLE POINT ──
 * Each drill used to render a bare `py-10` line here, so the panel collapsed to almost
 * nothing and sprang back when the data landed. Measured on the Cards → Conjugate switch:
 * 1175px → 706px → 1175px in 12ms warm, and 788px of collapse held for 400ms on the first
 * mount, while the grammar table's chunk was fetched. `TabPanel` now keeps each drill alive
 * so this is seen ONCE per drill per session rather than on every switch — but once is still
 * the moment someone is watching.
 *
 * ── 420px, AND WHY IT IS DELIBERATELY TOO SMALL ──
 * The drills settle between 416px and 788px depending on which one, which state it lands in
 * (a Learn row is taller than a typed prompt) and how wide the window is, so no single number
 * matches. 420 is the FLOOR of that range rather than the middle: a reserve larger than the
 * content it stands in for causes its own shift — upward, on settle — which is the bug in a
 * mirror. Under-reserving shrinks the jump; over-reserving relocates it.
 *
 * The empty states ("Nothing due", "Nothing to write yet") deliberately do NOT use this.
 * They are answers, not placeholders, and padding a one-line answer to 420px would leave a
 * hollow box saying very little very loudly.
 */
export default function DrillLoading() {
  return (
    <div
      className="flex items-center justify-center text-center"
      style={{
        minHeight: 420,
        fontFamily: 'var(--f-mono)',
        fontSize: 12,
        color: 'var(--ink-faint)',
      }}
    >
      Loading…
    </div>
  );
}
