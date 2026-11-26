# Private video storage (phase 1)

Status: transport foundation only; not exposed through HTTP and not enabled on Render.
Existing attachment flow and database are unchanged.

Target: original MP4/WebM up to 500 MiB, chunks of 8 MiB, 1 GB per user and
9 GB across the dedicated R2 bucket. These are application targets, not provider
billing guarantees. Existing Neon media stays readable through the existing path.

Setup before enabling:
- Create a dedicated Standard R2 bucket, keep public access disabled.
- Use a bucket-scoped Object Read & Write credential. Configure MTUNZ_R2_ACCOUNT_ID,
  MTUNZ_R2_BUCKET, MTUNZ_R2_ACCESS_KEY_ID and MTUNZ_R2_SECRET_ACCESS_KEY as private
  environment variables, never in Git or chat. The production requirements are
  intentionally unchanged until integration is ready.
- Allow only actual mtunz web origins in bucket CORS; PUT/GET/HEAD as required.
  Configure lifecycle to abort incomplete multipart uploads. Do not expire sent videos.
- Verify real R2 signed Content-Length enforcement, browser CORS, Android bounded
  file reads and range playback against a private test bucket first.

Release blockers:
1. Persistent ownership and upload lifecycle registry, atomically reserved quota
   including unfinished uploads, expiry and recovery after ambiguous R2 responses.
   Quota check helper alone is not a concurrency-safe ledger.
2. Authenticated start/status/part/complete/cancel endpoints, rate limiting,
   emergency lockdown integration, and server-side final verification before
   creating a normal attachment. No public bucket or raw credentials on clients.
3. Reliable durable cleanup for account deletion, expiring messages, cancelled
   uploads and orphaned objects. Keep reservations until cleanup is confirmed;
   reconcile bucket size. Backup R2 objects separately from database metadata.
4. Web and Android client integration: progress, retry/resume, original video,
   authenticated playback and download. Signed GET links expire after five minutes
   and are bearer capabilities until then; use refreshed authorization or an
   authenticated stream proxy if immediate revocation is required.
5. Device and integration tests, production cost monitoring and billing safeguards.
   No automatic adaptive transcoding in this phase. HD compression and adaptive
   playback require a separate tested pipeline; source quality and codec matter.

Unit tests use simulated storage and offline SDK signing; they do not create an
R2 bucket, upload user data, or prove actual provider-side behavior.

## Phase 2 integration
Owner-scoped API, database quota lock, durable cleanup, web/Android multipart clients and authenticated ranged playback proxy are implemented in source. Set MTUNZ_R2_ENABLED=1 only after private-bucket integration and physical device tests. Until then, the existing 16 MiB path remains in use. Retry resumes a live upload attempt; persistence across app termination/browser reload and HD transcoding are not implemented. R2 playback currently streams through Render using bounded chunks, not direct signed GET. Existing account erasure queues remote cleanup; storage must remain configured until pending deletions finish. Keep a dedicated private bucket, abort incomplete uploads via lifecycle, and reconcile costs. Browser CORS must allow PUT from the exact mtunz origin. No production credentials or real bucket are configured by this commit.
