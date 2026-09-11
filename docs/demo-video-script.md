# AIRLOCK demo video script

Target length: 90 seconds. Record the live dashboard and browser tabs for the
Sepolia and Creditcoin transaction links in [`evidence.md`](evidence.md). Do
not use fixture mode or describe an unverified event as proven.

[`demo-video.mp4`](demo-video.mp4) is a ready-to-host 42-second evidence
walkthrough generated from the verified deployment manifest. For a stronger
submission, use the script below to replace it with a screen recording of the
live dashboard; either version must retain the honest-boundary statement.

1. **0:00–0:10 — Claim.** Show the AIRLOCK overview and say: “AIRLOCK gives an
   agent authority only after one release digest is backed by artifact,
   evaluation, approval, and active-status evidence.”
2. **0:10–0:25 — Proof graph.** Show the four `PROVEN` nodes and the shared
   release digest. Open one Sepolia receipt and its Creditcoin import.
3. **0:25–0:40 — Capability.** Show the capability limits and the allowed
   vendor payment and bounded deposit transactions from the evidence page.
4. **0:40–0:55 — Containment.** Show the action preview, approved recipient,
   validator ceiling, and the router/vault boundary. Mention that the model
   proposes typed intent; it does not hold a wallet or raw transaction path.
5. **0:55–1:10 — Revocation.** Open the Sepolia revocation receipt and the
   Creditcoin revocation import. Refresh the dashboard so the capability and
   release read `REVOKED`.
6. **1:10–1:25 — Negative path.** Run “Test blocked call” or show the API
   response: `allowed: false`, reason `release is revoked`.
7. **1:25–1:30 — Honest boundary.** Say: “Base mode binds the release digest
   to a runtime key; proving that runtime loaded those weights is a separate
   TEE mode.”

The second clean-clone rehearsal and its transaction links are in
[`rehearsal.md`](rehearsal.md). Add the final hosted video URL to the README
and submission form after upload.
