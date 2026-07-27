-- Adds a `finished` flag to `passages`, set once the user presses "Finish" and the cloze blanks
-- are graded (see src/lib/data.remote.ts's gradeCloze / src/lib/server/data.ts's markFinished).
-- Previously "all blanks answered" and "graded" were the same moment (grading auto-fired the
-- instant the last blank was filled), so that could be inferred from `progress` alone. Now that
-- grading is a separate manual step, a passage can have every blank filled but not yet graded, so
-- ReadTab needs its own persisted signal to tell the two states apart across a reload. Run in the
-- Supabase SQL editor.

alter table passages add column if not exists finished boolean not null default false;
