-- Adds a `generating` flag to `passages` so an in-flight "Generate passage" / "+ New passage"
-- request survives a tab switch or full reload — see src/lib/server/data.ts (markGenerating /
-- clearGenerating) and ReadTab.svelte's poll effect. Run in the Supabase SQL editor.

-- `passage` is relaxed to nullable: the very first generation for a user+lang (no existing row
-- yet) needs to mark a pending row before any passage content exists.
alter table passages alter column passage drop not null;

alter table passages add column if not exists generating boolean not null default false;
