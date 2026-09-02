/**
 * Which columns of the review heatmap carry a month name.
 *
 * Pure, and in `lib/` rather than inside the component, for the reason this repo's suite
 * exists at all: the bug here was a date-arithmetic edge case that renders as *nothing* —
 * a missing label above real squares — which is exactly the class of thing nobody notices
 * by looking and a test pins in one line.
 */

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * How many columns a leading month needs before it earns a label.
 *
 * The window is a rolling 91 days, so the leftmost month is whatever 13 weeks ago landed in —
 * often one or two columns. Labelling that put "May" hard against "Jun" with a single column
 * between them, which reads as a squashed collision rather than two months. GitHub does the
 * same thing: a partial leading month gets no label and the space stays blank.
 */
export const MIN_COLS_FOR_LABEL = 3;

/** Month index from a `YYYY-MM-DD` key, without going back through a `Date`. */
function monthOf(date: string): number {
  return Number(date.slice(5, 7)) - 1;
}

/**
 * Label a month at the column where it BEGINS — not at the column whose Sunday falls in it.
 *
 * ── THE BUG THIS EXISTS FOR ──
 * The label used to be emitted only when a column's `dow === 0` day opened a new month. That
 * is the same thing only when the 1st happens to be a Sunday. September 2026 starts on a
 * Tuesday, and its first Sunday — the 6th — is past the end of a window that stops on the
 * 5th, so the month making up five of the last column's seven days got no label at all and
 * the rightmost column sat unheaded above today's own squares.
 *
 * Reading the date STRING rather than `Date.getMonth()` keeps this away from the timezone
 * question that `iso()` already settled when the grid was built.
 */
export function monthLabels(grid: { date: string }[][]): { col: number; label: string }[] {
  const labels: { col: number; label: string }[] = [];
  let last = -1;

  grid.forEach((col, w) => {
    if (col.length === 0) return;
    /**
     * A column is named for the month that OPENS in it. Only the leftmost falls back to the
     * month it merely starts in, because the window begins mid-month by construction and that
     * column would otherwise go unlabelled.
     *
     * The fallback has to be second, not first. A leading column can contain the next month's
     * 1st — the week of 31 May 2026 runs into 6 June — and naming it for its own first day
     * called it "May" and then never labelled June at all, because June had already opened in
     * a column that was spent.
     */
    const opens = col.find(c => c.date.endsWith('-01'));
    const month = opens ? monthOf(opens.date)
      : labels.length === 0 ? monthOf(col[0].date)
      : null;
    if (month === null || month === last) return;
    last = month;
    labels.push({ col: w, label: MONTHS[month] });
  });

  if (labels.length > 1 && labels[1].col - labels[0].col < MIN_COLS_FOR_LABEL) labels.shift();
  return labels;
}
