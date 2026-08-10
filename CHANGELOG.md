# Changelog

## [1.12.0](https://github.com/mfozmen/PRison/compare/v1.11.0...v1.12.0) (2026-08-10)

### Features

* preview each theme's own colours and typeface in Settings ([568935d](https://github.com/mfozmen/PRison/commit/568935d3d0cbe72ee687a6cd9f62e6015c947497))
* theme families with their own colours and typefaces ([6559574](https://github.com/mfozmen/PRison/commit/65595742e0c9bd4c15a33f1cae878fdcf503d0e4))

### Bug Fixes

* keep shell scripts LF so the Docker image builds on Windows ([69da30e](https://github.com/mfozmen/PRison/commit/69da30e678ee651c8d25c4ecb5ed178d86d268d1))
* make the fixture guard run on Windows ([9c7e0af](https://github.com/mfozmen/PRison/commit/9c7e0af29a925d13c300b783f6c619e54e5838c5))
* resolve script paths with fileURLToPath so builds work on Windows ([bb5a72a](https://github.com/mfozmen/PRison/commit/bb5a72afb0ddf9f4b16b656a75ea5d49d1f82e73))

## [1.11.0](https://github.com/mfozmen/PRison/compare/v1.10.0...v1.11.0) (2026-08-10)

### Features

* fold a group away by its header when grouping by repo or check ([#37](https://github.com/mfozmen/PRison/issues/37)) ([a5bef41](https://github.com/mfozmen/PRison/commit/a5bef41514f1033f864c13c98ee11ee7cd8f82f6))

## [1.10.0](https://github.com/mfozmen/PRison/compare/v1.9.1...v1.10.0) (2026-08-09)

### Features

* filter the board by draft state in three ways, not two ([#31](https://github.com/mfozmen/PRison/issues/31)) ([7d44083](https://github.com/mfozmen/PRison/commit/7d44083ad45c27d7fc7beffa298e1b484e863b84)), closes [#29](https://github.com/mfozmen/PRison/issues/29)
* surface questions left in a review body, not just inline threads ([#32](https://github.com/mfozmen/PRison/issues/32)) ([52d3f7a](https://github.com/mfozmen/PRison/commit/52d3f7ac04e17146b0bf1d4713fe55ed96f96165))

### Bug Fixes

* log the Retry-After GitHub actually sends on an upstream failure ([#36](https://github.com/mfozmen/PRison/issues/36)) ([5a336a2](https://github.com/mfozmen/PRison/commit/5a336a20eab126936903c315602f8bd99d164ff5)), refs [#20](https://github.com/mfozmen/PRison/issues/20) — which stays open until a real 403 is captured
* send three GraphQL queries at a time instead of seven at once ([#30](https://github.com/mfozmen/PRison/issues/30)) ([7966d6e](https://github.com/mfozmen/PRison/commit/7966d6e697787db97f5bd3521700f2da505cef94)), closes [#24](https://github.com/mfozmen/PRison/issues/24)

## [1.9.1](https://github.com/mfozmen/PRison/compare/v1.9.0...v1.9.1) (2026-08-07)

### Bug Fixes

* a check that was re-run to green no longer stays red ([#25](https://github.com/mfozmen/PRison/issues/25)) ([308e443](https://github.com/mfozmen/PRison/commit/308e4432bbdfdece0afd8d42e56a23cfe731895d))

## [1.9.0](https://github.com/mfozmen/PRison/compare/v1.8.0...v1.9.0) (2026-08-07)

### Bug Fixes

* survive GitHub's secondary rate limit, and say why when a query fails ([#19](https://github.com/mfozmen/PRison/issues/19)) ([d2d7752](https://github.com/mfozmen/PRison/commit/d2d7752fc595ff55652ed70b1f41ad637dabcebd))

## [1.8.0](https://github.com/mfozmen/PRison/compare/v1.7.1...v1.8.0) (2026-08-07)

### Features

* Recently reviewed, and the replies that never reached the board ([#18](https://github.com/mfozmen/PRison/issues/18)) ([6eec6f2](https://github.com/mfozmen/PRison/commit/6eec6f237dc750f6e26733d17fb36a3aa0e4634d))
* report what changed while PRison was closed ([#17](https://github.com/mfozmen/PRison/issues/17)) ([2ee712c](https://github.com/mfozmen/PRison/commit/2ee712cf96313e4a11e17d763e020636cea335e7))

## [1.7.1](https://github.com/mfozmen/PRison/compare/v1.7.0...v1.7.1) (2026-08-06)

### Bug Fixes

* keep an out-of-date PR out of Ready while its checks are running ([#16](https://github.com/mfozmen/PRison/issues/16)) ([9cdf2f0](https://github.com/mfozmen/PRison/commit/9cdf2f0d2c64deee882988b2acdf156a15816217))

## [1.7.0](https://github.com/mfozmen/PRison/compare/v1.6.0...v1.7.0) (2026-08-05)

### Features

* check for updates from Settings, and link the image from the release ([#13](https://github.com/mfozmen/PRison/issues/13)) ([980af92](https://github.com/mfozmen/PRison/commit/980af92c125e293d890cb1beae7f2d128ee44142))

### Bug Fixes

* offer a tracked-checks default for the personal account too ([#14](https://github.com/mfozmen/PRison/issues/14)) ([7441bc4](https://github.com/mfozmen/PRison/commit/7441bc40cdf6c87667506a34c791286e15f9a0ca))

## [1.6.0](https://github.com/mfozmen/PRison/compare/v1.5.0...v1.6.0) (2026-08-05)

### Features

* keep every detected change in an in-page activity feed ([#12](https://github.com/mfozmen/PRison/issues/12)) ([91718e2](https://github.com/mfozmen/PRison/commit/91718e25b83b08c1e3ad6556cbde7da0b391b0f4))

### Bug Fixes

* take the release token from gh, and make the test notification repeatable ([#11](https://github.com/mfozmen/PRison/issues/11)) ([8e1fcff](https://github.com/mfozmen/PRison/commit/8e1fcff0eec182f93c961703c6c3391e16146407))

## [1.5.0](https://github.com/mfozmen/PRison/compare/v1.4.0...v1.5.0) (2026-08-04)

### Features

* put Hide drafts back on the bar, give Settings a menu, notify on what changed ([#10](https://github.com/mfozmen/PRison/issues/10)) ([4ce5a27](https://github.com/mfozmen/PRison/commit/4ce5a272e2c22e59a24ad0aca4d7df626a4d9636))

## [1.4.0](https://github.com/mfozmen/PRison/compare/v1.3.0...v1.4.0) (2026-08-03)

### Features

* make the auto-refresh interval selectable and show when data last landed ([#9](https://github.com/mfozmen/PRison/issues/9)) ([11fc200](https://github.com/mfozmen/PRison/commit/11fc2006a03e42352684507ca733589b04f46493))

## [1.3.0](https://github.com/mfozmen/PRison/compare/v1.2.0...v1.3.0) (2026-08-03)

### Features

* auto refresh with desktop notifications and a Settings modal ([#8](https://github.com/mfozmen/PRison/issues/8)) ([d099f89](https://github.com/mfozmen/PRison/commit/d099f89cbb2cd37a2c3cad0debc228849a32a692))

## [1.2.0](https://github.com/mfozmen/PRison/compare/v1.1.1...v1.2.0) (2026-08-03)

### Features

* hide review threads I acknowledged with an emoji reaction ([#7](https://github.com/mfozmen/PRison/issues/7)) ([49bc08c](https://github.com/mfozmen/PRison/commit/49bc08c))

## [1.1.1](https://github.com/mfozmen/PRison/compare/v1.1.0...v1.1.1) (2026-07-30)

## [1.1.0](https://github.com/mfozmen/PRison/compare/v1.0.0...v1.1.0) (2026-07-27)

### Features

* add a Recently merged / closed PR history section ([#3](https://github.com/mfozmen/PRison/issues/3)) ([7c11311](https://github.com/mfozmen/PRison/commit/7c113116e6d5d92fe54da6613b7b8fb7ad980471))

## 1.0.0 (2026-07-10)

### Features

* add domain types, prioritization, and action suggestions ([5d60078](https://github.com/mfozmen/PRison/commit/5d6007809de843e2a2ebc878970947578cd12d26))
* add GitHub GraphQL client and PR data API routes ([#13](https://github.com/mfozmen/PRison/issues/13)) ([0d1c2c3](https://github.com/mfozmen/PRison/commit/0d1c2c38501ab0affec51a4f561a7401273f96b8))
* add GitHub GraphQL queries and response parsers ([#5](https://github.com/mfozmen/PRison/issues/5)) ([15e0918](https://github.com/mfozmen/PRison/commit/15e091845006eeeaa4eaf68f8fa9d86882e53a96))
* add GitHub OAuth login via NextAuth ([#12](https://github.com/mfozmen/PRison/issues/12)) ([98bd6e5](https://github.com/mfozmen/PRison/commit/98bd6e5bc71a9212d1bca59f561ce164f1975e5e))
* add personal account to the org switcher ([#36](https://github.com/mfozmen/PRison/issues/36)) ([34cb601](https://github.com/mfozmen/PRison/commit/34cb6013fc61bc2ba33a6b9694d289867a4ca1b7))
* add server-backed repo search with debounced combobox ([#43](https://github.com/mfozmen/PRison/issues/43)) ([e057e27](https://github.com/mfozmen/PRison/commit/e057e27e0ee81c4ba807fc4f595d4a7bed5f171a))
* authenticate with a personal access token instead of an OAuth App ([#21](https://github.com/mfozmen/PRison/issues/21)) ([a1580d1](https://github.com/mfozmen/PRison/commit/a1580d155d5e672152c6963a88fcdb1fae74b5e6))
* branded PRison favicon (jail-window mark) ([#62](https://github.com/mfozmen/PRison/issues/62)) ([43f6433](https://github.com/mfozmen/PRison/commit/43f64331c41f7e029559ab536feeb440a3e51336))
* color-code list accents + distinct settings icon ([#41](https://github.com/mfozmen/PRison/issues/41)) ([a63a3f4](https://github.com/mfozmen/PRison/commit/a63a3f4f04ebea963b1afd97c753d7d191f51812))
* **dashboard:** inline awaiting chips in stuck check row ([#52](https://github.com/mfozmen/PRison/issues/52)) ([93e545f](https://github.com/mfozmen/PRison/commit/93e545f3952a7ee6c83cb3a5c283d04331838298))
* Docker zero-config + GITHUB_TOKEN env sign-in ([#49](https://github.com/mfozmen/PRison/issues/49)) ([56a23de](https://github.com/mfozmen/PRison/commit/56a23decb4d30a5e25308cb0c984bfcc5ed164a5))
* redesign UI as a dark data-dense dashboard via ui-ux-pro-max ([#18](https://github.com/mfozmen/PRison/issues/18)) ([f2364e1](https://github.com/mfozmen/PRison/commit/f2364e108fcad693006ed4f45898363456e7e508))
* replace repo text input with dropdown in tracked-checks override rows ([#42](https://github.com/mfozmen/PRison/issues/42)) ([8a2f9a0](https://github.com/mfozmen/PRison/commit/8a2f9a0879a41dc36ec5acc46b9b567af725462e))
* responsive two-column layout and repo grouping ([#27](https://github.com/mfozmen/PRison/issues/27)) ([4f7490b](https://github.com/mfozmen/PRison/commit/4f7490b7b24cb153807986e49bce525e6bb89cc2))
* show draft status and which checks are failing ([#26](https://github.com/mfozmen/PRison/issues/26)) ([74c8b7c](https://github.com/mfozmen/PRison/commit/74c8b7c4d223f1a84d29de2f75f6dcf3c351c906))
* surface partial-data drops + fix org-switcher regression ([#53](https://github.com/mfozmen/PRison/issues/53)) ([2b1f20f](https://github.com/mfozmen/PRison/commit/2b1f20fa0931d97207f4df77c0f0b00bdb077775))
* track unanswered review comments on your own PRs ([#67](https://github.com/mfozmen/PRison/issues/67)) ([b9d00ba](https://github.com/mfozmen/PRison/commit/b9d00ba427c623f7cc06a344d4240b1f46e2eb90))
* **tracked-checks:** redesign awaiting chips with dashed outline + clock icon ([#59](https://github.com/mfozmen/PRison/issues/59)) ([0ba5192](https://github.com/mfozmen/PRison/commit/0ba5192f086aea3f14aaf1b71bc4c989507ac7ec))
* treat out-of-date (BEHIND) PRs as ready to merge ([#47](https://github.com/mfozmen/PRison/issues/47)) ([8201924](https://github.com/mfozmen/PRison/commit/820192444d439a796fa1a0eae5b59868df7c0801))
* version the app with release-it and show it in the header ([#2](https://github.com/mfozmen/PRison/issues/2)) ([622aaa7](https://github.com/mfozmen/PRison/commit/622aaa77b7b7523e80c0a5537983c4d4c29b134e))
* wire dashboard page with org switcher and data fetching ([#15](https://github.com/mfozmen/PRison/issues/15)) ([6240c26](https://github.com/mfozmen/PRison/commit/6240c265a4fa9fca02f9f707f64ef3320dd3b4ba))

### Bug Fixes

* age review requests from the latest re-request, not the first ([#63](https://github.com/mfozmen/PRison/issues/63)) ([7964a7e](https://github.com/mfozmen/PRison/commit/7964a7e03c245753480b133d6b635f343733f2db))
* group review-required and awaiting PRs by their blocker in By-check view ([#66](https://github.com/mfozmen/PRison/issues/66)) ([7b055df](https://github.com/mfozmen/PRison/commit/7b055dfa893967b6afa593d8b76ec745b8eaacd9))
* **guard:** scan commit messages, and catch the shapes that escaped ([#1](https://github.com/mfozmen/PRison/issues/1)) ([5c28c26](https://github.com/mfozmen/PRison/commit/5c28c2690cddf7214bb18ae15020dad87e87ab25))
* keep the dashboard working when an org restricts the token ([#23](https://github.com/mfozmen/PRison/issues/23)) ([4d28265](https://github.com/mfozmen/PRison/commit/4d28265a0df2f634138ed5d9f64b528e1f3d998e))
* route BLOCKED PRs to ready when rollup FAILURE is only a stale run ([#64](https://github.com/mfozmen/PRison/issues/64)) ([85b1ef7](https://github.com/mfozmen/PRison/commit/85b1ef763172b3a4deb8876ebb2bc6112555cbd6))
* route BLOCKED+approved+green PRs to ready-to-merge bucket ([#50](https://github.com/mfozmen/PRison/issues/50)) ([1c08d62](https://github.com/mfozmen/PRison/commit/1c08d62bef65aa4e6db07b140075b7da4b471033))
* stop auto sign-in from undoing Sign Out ([#1](https://github.com/mfozmen/PRison/issues/1)) ([3cbe7eb](https://github.com/mfozmen/PRison/commit/3cbe7ebea4eb59763e9755c3d65304724452dc6d))
* suggest "See required checks" for blocked-only PRs ([#38](https://github.com/mfozmen/PRison/issues/38)) ([0f0284c](https://github.com/mfozmen/PRison/commit/0f0284c9f691a4e077daeffd00038c2588c0a3ea)), closes [#37](https://github.com/mfozmen/PRison/issues/37)
* surface code-owner review requirement in the stuck list ([#65](https://github.com/mfozmen/PRison/issues/65)) ([de79987](https://github.com/mfozmen/PRison/commit/de79987cd31cdfc64b42cf8dfa0d25aeffad54bf))
* symmetric client-side arbitration for BLOCKED+approved+green PRs ([#54](https://github.com/mfozmen/PRison/issues/54)) ([ccc81ea](https://github.com/mfozmen/PRison/commit/ccc81ea6e17170bfbbfd1937d96ab74400cdc166))
* **tracked-checks:** merge checks for duplicate-repo override rows ([#56](https://github.com/mfozmen/PRison/issues/56)) ([c19e924](https://github.com/mfozmen/PRison/commit/c19e92421bdd9e27cf0890082a6e2b572a0eec97))
