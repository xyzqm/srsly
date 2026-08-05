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

## Lexique383.tsv

Lexique 3.83 — the French lexical database by Boris New and Christophe Pallier, distributed
by the OpenLexicon project under a **Creative Commons Attribution-ShareAlike 4.0
International** licence (<https://creativecommons.org/licenses/by-sa/4.0/>). Commercial use
and redistribution are permitted with attribution and share-alike.

Required citation:

> New, B., Pallier, C., Brysbaert, M., & Ferrand, L. (2004). Lexique 2: A New French
> Lexical Database. *Behavior Research Methods, Instruments, & Computers*, 36(3), 516–524.

Download (~25 MB, 142,695 rows):

```
curl -L -o scripts/data/Lexique383.tsv http://www.lexique.org/databases/Lexique383/Lexique383.tsv
```

Home page: <http://www.lexique.org/> · project: <https://openlexicon.fr/>

Vendored **unmodified**. Only four of its 35 columns are read — `ortho`, `cgram`,
`freqlemfilms2`, `freqlemlivres` — see `scripts/lib/lexique.mjs`. A newer **Lexique 4**
(New et al., 2026) exists and would be a drop-in candidate if its column names match.

## core-overrides.json

Not a vendored dataset — srsly's own hand-maintained list of headwords pinned to level 1.
No third-party licence applies. See `scripts/lib/coreOverrides.mjs` for why it exists.
