# Vendored build-time datasets

These files are inputs to the dictionary build scripts. Nothing here is shipped to the
client — the build reads them to grade vocabulary and emits only word lists.

## cefrj-vocabulary-profile-1.5.csv

The CEFR-J Wordlist Version 1.5, compiled by Yukio Tono, Tokyo University of Foreign
Studies. Retrieved from <http://www.cefr-j.org/download.html>

Copyright © Tono Laboratory, Tokyo University of Foreign Studies (TUFS).

Usable for research **and commercial** purposes with no charge, provided the dataset is
cited properly — hence this file and the citation reproduced in
`scripts/lib/cefrjAnchor.mjs`, which is the only code that reads it.

Neither CEFR-J nor Open Language Profiles assumes responsibility for inaccuracies in the
dataset or for damages resulting from its use.

Obtained via the Open Language Profiles redistribution at
<https://github.com/openlanguageprofiles/olp-en-cefrj>. Vendored **unmodified**.

## octanove-vocabulary-profile-c1c2-1.0.csv

Octanove Vocabulary Profile C1/C2 (ver 1.0) by Octanove Labs, licensed under a
Creative Commons Attribution-ShareAlike 4.0 International License
(<https://creativecommons.org/licenses/by-sa/4.0/>).

Vendored **unmodified**. srsly reads it to look up the CEFR level of an English word and
does not redistribute it in any altered form; the graded word lists the build emits are
not derived from its text, only from level lookups against it.

Also obtained via <https://github.com/openlanguageprofiles/olp-en-cefrj>.

## Why these two together

CEFR-J covers A1–B2 only. Octanove extends the same scheme to C1/C2, and the two are
designed to be used as one six-level scale — which is what `cefrjAnchor.mjs` builds.

## core-overrides.json

Not a vendored dataset — srsly's own hand-maintained list of headwords pinned to level 1.
No third-party licence applies. See `scripts/lib/coreOverrides.mjs` for why it exists.
