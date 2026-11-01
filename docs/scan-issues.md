# scan.mjs: problems found on Figma, with cause, fix and test

Evidence: the Figma runs of 2026-11-01 (logs in figmu `figma-research/scan/*.log`), counted by type.

| # | Problem | Cause | Fix | Status |
| --- | --- | --- | --- | --- |
| 1 | Figma stuck on its loading bar after a reload | the tab process grows with every reload and click (2.4 GB, 100% CPU) | fresh tab when a load stalls, every 6 reloads and when the tab is 8 min old | fixed 0.9.3/0.9.5 |
| 2 | Loading bar after `goto` to the same file | heavy apps stall on a goto; a reload works | reload when already on the start page | fixed 0.8.1 |
| 3 | Lock taken by a worker while the scan ran | lock counted as stale after 15 min | `--lock` refreshes every 5 min, waits 2 h for a worker's lock | fixed 0.8.1 |
| 4 | Crash when the scan tab closed | going back pressed keys on a closed page | recover in a new tab, never throw | fixed 0.9.2 |
| 5 | Lock kept after a crash | no crash handler | release on uncaught errors | fixed 0.9.2 |
| 6 | File became read-only (Dev Mode) | a replayed click at an old position hit the Dev Mode switch | replays check the control and click where it is now | fixed 0.9.7 |
| 7 | Setup failed right after a load | Figma is read-only for a moment while it connects | setup waits until editing works; retries | fixed 0.9.6 |
| 8 | Parallel windows followed each other | two sessions of one user in one Figma file | no parallel runs in one shared document (docs) | documented |
| 9 | "looks different after going back" (25×), screens skipped (14×) | names with numbers change between loads: zoom "100%" vs "2%", hex colors, result counts | normalize numbers, hex colors, case and spacing in every control key (Crawljax-style comparators) | fixed 0.10.0 |
| 10 | Start screen differs after a reload | Figma remembers the current page, zoom, open left panel, selection, Find bar | setups reset page, zoom, panel and selection (Figma plan); the start screen matches at 80% | fixed 0.10.0 |
| 11 | Lists with live content differ (libraries, community, variables) | content loads late or changes | near-duplicate match (Yandrapally et al., ICSE 2020): 80% of the state's own controls and 70% of everything | fixed 0.10.0 |
| 12 | Same menus explored again in every run | each run starts from scratch | per-run skip lists (plans) | fixed 0.8.x |
| 14 | Many reloads to go back | Escape cannot undo a tab switch, an opened side panel or a document change | select the state's tab/panel again, then undo (--undo) before reloading; fresh tabs come to the front at once | fixed 0.10.1 |
| 13 | Slow on heavy pages | fixed waits, full style reads for every check | quick checks, adaptive waits, direct screenshots | fixed 0.9.0 |

Test after the open fixes: the fixture page (all states, under 40 s) with volatile names and a remembered panel added to
it, then one Figma run of the rectangle-popovers and start plan: no crash, no read-only error, no "could not return to
000", and "could not return" at most 3 times.
