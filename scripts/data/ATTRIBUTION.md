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

## makemeahanzi-dictionary.txt

`dictionary.txt` from **Make Me a Hanzi** (<https://github.com/skishore/makemeahanzi>) by
Shaunak Kishore, itself derived from the **Unihan Database** and **CJKlib**.

Licensed under the **GNU Lesser General Public License v3**. Vendored **unmodified**.

### This one is different from everything else in this directory

Every other dataset here is a build-time input: the build reads it, grades vocabulary, and
emits only word lists. This one is the source of data that is **shipped to the browser** —
`lib/data/han-decomp.json`, read by the character-decomposition panel — so the LGPL travels
with the emitted file rather than stopping at the build.

What that obliges, in practice: keep this notice, state the license where the data is used,
and let a recipient obtain and substitute their own version of the LGPL'd portion. The
emitted JSON is a mechanical subset (see `scripts/build-radicals.mjs`) and is regenerable
from this file, which is what makes substitution possible. It does **not** place srsly's own
code under the LGPL.

### Why not the more obvious source

The canonical decomposition dataset is CHISE's `ids.txt`, redistributed as
<https://github.com/cjkvi/cjkvi-ids>, and it is **GPLv2** — a copyleft obligation on a file
we ship, which is materially heavier than the LGPL. Unicode's own Unihan is permissively
licensed but supplies only `kRSUnicode` (radical plus residual stroke count), not a full
decomposition, so it cannot answer "休 = 亻 + 木" at all.

Re-download with:

    curl -sL https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt \
      -o scripts/data/makemeahanzi-dictionary.txt
