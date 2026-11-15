# EscaPic

**Play it now: [escape-io-production-7b184c8d.up.railway.app](https://escape-io-production-7b184c8d.up.railway.app)**

Turn any room into a party game. Read the riddle, photograph what it describes, and the AI judge decides whether you found it. Faster answers score more; three misses ends your round.

Point your phone at a room. Photograph three things in it. Each one is holding a clue.

Mobile-first PWA, no install, no accounts, no database. One Vite/React frontend, one Hono
process that serves it *and* the API, two model calls per case.

```
apps/web        Vite + React 19 + Tailwind v4 + PWA      (camera, capture, HUD)
apps/api        Hono + Gemini Flash + repair pass         (case authoring, capture)
packages/shared schemas + projection + game engine         (the contract, import it everywhere)
scripts/smoke   invariants for the loop
scripts/shots   headless walkthrough, screenshots every phase
```

---

## Quickstart

```bash
npm install
cp .env.example .env          # paste GEMINI_API_KEY (optional — demo mode works without)
npm run dev                   # api :8787, web :5173 (proxies /api)
```

On a phone the camera needs **HTTPS**: use the Render URL, or
`npx cloudflared tunnel --url http://localhost:5173`.

No key = automatic demo mode with the canned case and canned captures.

### URL flags

| Flag | Effect |
|---|---|
| `?debug=1` | Skip button + raw state |
| `?demo=1` | Never calls the model (stage backup) |

### Verify

```bash
npm run smoke       # 40+ assertions: projection, capture loop, repair pass
npm run typecheck
npm run build
node scripts/shots.mjs   # drives every screen headlessly, fails on console errors
```

---

## How it works

```
/case      text only, no image  → 3 fragments + answers + culprit   (~600ms, on boot)
/capture   one image            → objects with boxes + prose        (~1.8s, per shot)
```

**The clues are not bound to objects in advance.** The case is authored as three
*fragments* — "something that keeps a record of the hour" — plus the evidence each
photograph must contain ("the last circled entry reads 23:42"). Any object can host any
fragment. That is what makes the loop unbreakable: there is no wrong photo.

The hologram only ever exists on a **frozen frame the player just took**, so it is always
exactly on the object. No tracking, no SLAM, nothing to drift.

### Fallback ladder

```
/case fails        → canned campaign (client never notices)
/capture fails     → fixture objects, evidence injected into the prose client-side
no camera at all   → bind a synthetic object, case still completes
object not found   → "Can't find it" reveals 3 escalating seek hints
puzzle stuck       → 3 puzzle hints, tier 3 gives the answer
```

Nothing in that ladder can dead-end the player.

---

## The 5-minute demo script

| Time | Beat |
|---|---|
| 0:00 | "Escape rooms need a venue. This one needs a room." Show the URL. No install. |
| 0:20 | Begin → camera → briefing with *their* three fragments. Pick difficulty. |
| 0:50 | Walk to an object. Frame it. **Shutter.** |
| 1:10 | Photo freezes, boxes fade in. "It found four things — this one." Tap it. |
| 1:30 | Wrong answer on purpose → soft denial → **I'm stuck** → hint. Proves no soft-lock. |
| 2:30 | Solve it. Second object: a different corner of the room. |
| 3:30 | **Airplane mode on.** Third capture still completes from the fixture. |
| 4:00 | Finale → solved → time on the case. |

Have `?demo=1` open in a second tab for the offline path.

---

## iOS checklist

- [ ] `<video playsinline muted autoplay>` — all three.
- [ ] `primeAudio()` + `DeviceOrientationEvent.requestPermission()` inside the same tap.
- [ ] Silent looping `<audio>` keeps SFX alive with the ringer switch on.
- [ ] Rotate mid-puzzle: sheet reflows, nothing jumps.
- [ ] Test in **Low Power Mode**.
- [ ] Test on venue wifi, on cellular, and with wifi off.
- [ ] Add to Home Screen once: icon, fullscreen, no URL bar.

---

## Where to work next

| File | Owner | Notes |
|---|---|---|
| `apps/api/src/prompt.ts` | B | The only lever on story quality. Iterate on 10 room photos. |
| `apps/api/src/repair.ts` | B | Add coercion for every malformed response you actually see. |
| `apps/web/src/components/CaptureScreen.tsx` | A | The money shot: frozen frame + boxes. |
| `packages/shared/src/game.ts` | both | Rules. No async, no randomness, no exceptions. |

Not built on purpose: accounts, persistence, multiplayer, leaderboards, 3D, SLAM,
analytics, live tracking.
