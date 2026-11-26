# Fishing Life foundation
Independent branch from production main; R2 is not a dependency. No version bump or production deploy.
- 3 regions, 30 fish, 10 rarity tiers (integer weights sum 100000), 7 mutations, 5 rods, 3 baits. Fish species within region are fictional/game-balanced.
- Cast, wait, hook, timed pulls. The server owns the random result and time windows. No client-provided payout or score; scripted clients can still automate timing. No claim of strong bot prevention.
- Initial 150 gold, bag cap 200, single-fish sale, sequential rod purchases, free re-equip, per-cast bait purchase. Unique catch IDs, account row transaction, stale step replay safe. No real money.
- Account-scoped Neon/SQLite records and cascading deletion. Server state is shared by web and native Android, not live pushed. Refresh to reconcile multi-device changes.
- Native view uses standard React Native components; no webview. Lightweight illustrated landscape (not final art). No audio, multiplayer, weather, leaderboard or offline play yet.
- Timing and economy require physical-device and PostgreSQL integration testing; latency can reduce timing window. No production migration performed. 

## Adaptive layout
Desktop hides only the fishing workspace's redundant conversation list and uses two columns when available content width is at least 780 CSS pixels; compact web uses a single column and hides selectors during a cast. Five primary navigation items remain unchanged; Fishing Life is in More / Settings, and Android's account entertainment shortcut. Native uses a responsive width/font scale check, minimum 44dp targets and a larger primary control. Version remains batched with the pending coordinated release. Browser layout tests use a mocked API and real Chromium; device and whole-app visual testing still required.

## Art pass
Three original local vector environments (pond sunset, misty river, moonlit bay), 30 stylized species illustrations and five rod illustrations are mirrored in web/native assets. The server exposes only the active cast region, not the fish roll. Catch cards reflect newly received server inventory. Water reflections are baked into the illustrations; animated bobber/ripples are CSS/native-driver effects, native motion stops in background and respects OS reduced motion. Actual weather/day-night cycling, audio, sprite swimming and real-device rendering/FPS remain future QA/work. No new package or remote art provider; APK size change not yet measured.
