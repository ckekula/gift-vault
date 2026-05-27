# GiftVault

A zero-knowledge encrypted gift registry. Your gift names and prices are encrypted in the browser before ever reaching the server. Only people you share a link with can read your list.

## How to run

### Backend (Go)
```bash
cd backend
go build -o giftvault .
./giftvault
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```

## Architecture

```
URL:  https://giftvault.app/manage/<LIST_ID>#<MASTER_KEY>
                                    ^           ^
                              sent to server   never sent to server
                              (looks up blob)  (stays in browser tab)
```

**Key hierarchy:**
- Master key → 256-bit AES-GCM, lives only in the URL fragment
- Per-tier keys → HKDF-derived from master, one per access group
- Blobs stored on server → `{ family: "..encrypted..", friends: "..encrypted.." }`

**Editing:**
Owner re-encrypts with same tier keys → pushes new blobs → same list ID → viewer links still work.

**Access tiers:**
| Tier | Who gets it | Sees |
|---|---|---|
| `all` | everyone | gifts tagged "everyone" |
| `family` | family members | family-tagged gifts |
| `friends` | friends | friends-tagged gifts |
| `santa` | secret santa group | santa-tagged gifts |

## Security properties

✅ Server stores only ciphertext. Gift names/prices never sent in plaintext  
✅ URL fragment is never sent in HTTP requests (browser spec)  
✅ AES-GCM 256 with random 96-bit nonces per encryption  
✅ HKDF key derivation separates tier access  
✅ `Referrer-Policy: no-referrer` on all responses  
⚠️ No write protection yet (any knowing list ID can overwrite)  
⚠️ Claim state stored as plaintext on server (gift count visible)  
⚠️ JS served from server (SRI not yet enforced)  

See threat model for full details and planned mitigations.

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/lists` | Create new list |
| GET | `/lists/:id` | Fetch blobs |
| PUT | `/lists/:id` | Update blobs (owner edit) |
| POST | `/lists/:id/claim` | Toggle gift claimed state |
| GET | `/health` | Health check |