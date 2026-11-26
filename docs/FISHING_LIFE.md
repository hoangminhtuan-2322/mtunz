# Fishing Life foundation
Independent branch from production main; R2 is not a dependency. No version bump or production deploy.
- 3 regions, 30 fish, 10 rarity tiers (integer weights sum 100000), 7 mutations, 5 rods, 3 baits. Fish species within region are fictional/game-balanced.
- Cast, wait, hook, timed pulls. The server owns the random result and time windows. No client-provided payout or score; scripted clients can still automate timing. No claim of strong bot prevention.
- Initial 150 gold, bag cap 200, single-fish sale, sequential rod purchases, free re-equip, per-cast bait purchase. Unique catch IDs, account row transaction, stale step replay safe. No real money.
- Account-scoped Neon/SQLite records and cascading deletion. Server state is shared by web and native Android, not live pushed. Refresh to reconcile multi-device changes.
- Native view uses standard React Native components; no webview. Lightweight illustrated landscape (not final art). No audio, multiplayer, weather, leaderboard or offline play yet.
- Timing and economy require physical-device and PostgreSQL integration testing; latency can reduce timing window. No production migration performed. 
