Yep — **Cloudflare Workers can do the whole “router” job**, and **Cloudflare Pages** can host the PWA website nicely (same ecosystem, same domain, easy TLS/HTTPS). Web Push on iPhone works for **Home Screen web apps** on iOS 16.4+ (so: PWA + manifest + service worker). ([Apple Developer][1])


claude code hoks: https://code.claude.com/docs/en/hooks
best practice: https://github.com/anthropics/claude-code/tree/main/plugins/hookify
### Where to host the website?

Two good options:

1. **Cloudflare Pages (recommended for MVP)**

* Hosts your static PWA (HTML/JS/manifest/service worker).
* You can put the API on a Worker under the same domain (e.g. `app.yourdomain.com/api/*`).
* Simplifies service-worker scope + push permission UX. ([The Cloudflare Blog][2])

2. **Your existing website server**

* Still fine, but you’ll likely still want the API on Cloudflare (rate limits/WAF/edge).
* Just ensure HTTPS and correct service worker + manifest setup (PWA basics). ([Medium][3])

### What’s a VPS?

A **VPS (Virtual Private Server)** is basically “a rented virtual machine on the internet” — your own OS instance with root/admin access, running on shared hardware. ([Google Cloud][4])

---

# PRD: “Claude Code Approval Push” (PWA + Cloudflare Worker)

## Product summary

When Claude Code hits a permission prompt, it sends a request to your edge router. The router pushes a notification to the user’s iPhone. The user taps it, reviews the request in a tiny PWA, hits **Approve**/**Deny**, and Claude Code unblocks.

## Goals

* Approve/Deny from iPhone with minimal friction
* No native iOS app (PWA only)
* Pending requests expire quickly (TTL 10 minutes)
* Safe-by-default: rate limits + replay protection
* Simple onboarding (QR pairing)

## Non-goals (MVP)

* Multi-device per user
* Team approvals / shared queues
* Full “zero-knowledge” encryption (add as V2)
* Fancy policy engine (“auto-allow ls, deny rm -rf”)

## Target users

* Solo developers running Claude Code locally who are annoyed by terminal prompts

## Key constraints

* iOS Web Push works for **Home Screen web apps** (PWA), not regular Safari tabs. ([Apple Developer][1])
* PWA must have HTTPS, manifest, and service worker. ([Medium][3])

---

## User stories

1. As a user, I pair my machine and my phone by scanning a QR code once.
2. When Claude Code asks for permission, I get a push notification instantly.
3. I tap the notification, see the command/tool request, approve or deny.
4. Claude Code continues or cancels accordingly.
5. Requests disappear automatically after 10 minutes.

---

## UX flows

### Pairing (one-time)

1. User runs `claude-approve init`
2. CLI generates:

   * `pairing_id` (random)
   * `pairing_secret` (random 32 bytes)
3. CLI prints QR containing `pairing_id` + a one-time `pairing_secret` (or a short pairing code that fetches secret).
4. User opens PWA on iPhone → “Pair device” → scans QR.
5. PWA registers for push and sends push subscription to router.

### Approval
hooks referenc

1. Claude hook sends request `{pairing_id, request_id, payload, ts, nonce, signature}`
2. Router stores pending request (TTL 10 min)
3. Router sends Web Push: “Claude needs approval” + deep link to `/approve/<request_id>`
4. User taps → PWA loads request → Approve/Deny
5. Router stores decision
6. Claude hook polls `/decision/<request_id>` until decided or expired

---

## Architecture

### Hosting

* **Cloudflare Pages**: PWA website (static)
* **Cloudflare Worker**: API router
* Storage:

  * **Durable Object (recommended)** for consistency of “pending → decided” state
  * KV is possible, but KV reads are cached/eventually consistent across locations, which can add weird polling delays. ([Cloudflare Docs][5])

### Data model (per request)

* `request_id` (uuid)
* `pairing_id`
* `status`: pending | allowed | denied | expired
* `payload`: (MVP plaintext) { tool, details, cwd, repo }
* `created_at`
* TTL: 600 seconds (10 min)

KV TTL is supported via `expiration_ttl` (seconds); Cloudflare notes TTL can be set like 600 seconds for 10 minutes. ([Cloudflare Docs][6])

---

## Security model (MVP “secure enough to ship”)

### Auth & integrity

Treat the pairing token as identity, **but require signatures**:

* `pairing_secret` used for **HMAC-SHA256** signature over a canonical string:

  * method + path + body_hash + ts + nonce
* Router rejects:

  * bad signature
  * timestamp drift > 60s
  * reused nonce (store nonce set per pairing for 10 min)
  * too many pending requests

### Abuse controls

* Rate limit per `pairing_id` (e.g., 30 requests / 10 min)
* Rate limit per IP (edge/WAF)
* Max payload size (e.g., 8 KB)
* Max pending per pairing (e.g., 3)
* Hard TTL expiry (10 min)

### Privacy posture

MVP stores request payload plaintext for 10 minutes (you can still avoid logging it).
**V2 (recommended for “router-only” claim):** client-side encrypt payload so server only stores ciphertext.

---

## API (Worker)

* `POST /api/pair/register-push`
  body: `{pairing_id, push_subscription, ts, nonce, signature}`
* `POST /api/request`
  body: `{pairing_id, request_id, payload, ts, nonce, signature}`
* `GET /api/request/<request_id>`
  returns payload (or ciphertext)
* `POST /api/decision/<request_id>`
  body: `{decision: allow|deny, ts, nonce, signature}`
* `GET /api/decision/<request_id>`
  returns decision/pending/expired

---

## PWA requirements

* `manifest.webmanifest` (so it can be added to Home Screen)
* service worker:

  * handles `push` event, shows notification
  * handles notification click → open `/approve/<id>`
* UI pages:

  * `/pair` (scan QR / enter code)
  * `/approve/<id>` (show details + buttons)

Apple’s Web Push documentation covers web push for Home Screen web apps and browsers. ([Apple Developer][1])

---

## Claude Code integration (hook side)

* A hook script that triggers on permission prompts and:

  * posts request to router
  * polls for decision
  * returns allow/deny to Claude Code

(Exact hook JSON varies by Claude Code version/config; this is an open question below.)

---

## Shipping checklist (tight MVP scope)

* Worker + Durable Object routes
* Pages PWA (pair + approve)
* QR pairing in CLI (tiny node/python script)
* Push subscription + send push
* HMAC signing + nonce replay cache
* TTL expiry + rate limit
* Minimal privacy note + logging disabled for request bodies

---

## Open questions / risks

1. **Claude Code hook behavior**: Can your current Claude Code setup reliably *block* on a permission hook long enough for phone approval, or do we need a fallback (notify + user approves later + replay)?
2. **What must be shown to the user to make approvals safe?** (full command vs. redacted vs. “diff summary”)
3. **Encryption V2**: Do you want “server can’t read commands” as a hard requirement for launch, or a follow-up?
4. **Storage choice**: Durable Object (strongly consistent) vs KV (eventual consistency caching) for decision polling. ([Cloudflare Docs][5])
5. **Multi-device**: One phone per pairing or multiple?

---

If you tell me **what OS you’re running Claude Code on (macOS/Linux)** and whether it’s **CLI vs VS Code**, I can tailor the hook-side plan (and the fallback plan if the permission hook can’t wait cleanly).

[1]: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers?utm_source=chatgpt.com "Sending web push notifications in web apps and browsers"
[2]: https://blog.cloudflare.com/serverless-pwa-react-cloudflare-workers/?utm_source=chatgpt.com "Serverless Progressive Web Apps using React with ..."
[3]: https://medium.com/%40vedantsaraswat_44942/configuring-push-notifications-in-a-pwa-part-1-1b8e9fe2954?utm_source=chatgpt.com "Configuring Push Notifications in a PWA ( Part — 1 )"
[4]: https://cloud.google.com/learn/what-is-a-virtual-private-server?utm_source=chatgpt.com "What is a virtual private server (VPS)?"
[5]: https://developers.cloudflare.com/kv/concepts/how-kv-works/?utm_source=chatgpt.com "How KV works · Cloudflare Workers KV docs"
[6]: https://developers.cloudflare.com/kv/api/write-key-value-pairs/?utm_source=chatgpt.com "Write key-value pairs - KV"
