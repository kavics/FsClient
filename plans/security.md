# FS2024 Client Security

**Cél**: Egyetlen távoli kliens engedélyezése az is csak úgy, hogy ha rálát a szerverre. Nincs is másnak értelme, mert végülis egy szimulátort fog vezérelni.

## Authentication
Kétfajta kliens van
- LOCAL: azon a gépen futó böngésző, amelyen az FS2024 fut.
- REMOTE: telefon vagy hálózat más részén lévő böngésző

## Authotization
A LOCAL-nak mindenhez van hozzáférése.

A REMOTE-nak csak akkor van hozzáférése, ha sikeresen párosítva lett.
Ha a kliensnek nincs hozzáféeése, akkor minden oldalon (kivéve a pairing oldalt) csak a "Need to pairing..." felirat jelenjen meg.
A párosított REMOTE kap egy api kulcsot, amit minden request-ben beküld a szervernek header-ben

## Pairing oldal
A párosításkor az authentication-nak megfelelően eltérő viselkedés lesz.

### LOCAL
Ha még nincs párosítás, akkor a LOCAL generáljon egy random kódot (hat számjegy), és jó nagyban rajzolja ki a Back link fölé. Ha a párosítás sikeres, akkor az oldal frissítse le magát.

Ha van párosítás akkor írja ki: "Paired", és generáljon egy "Unpair" gombot.

### REMOTE
A REMOTE adjon egy textbox-ot, amibe az user be tudja írni a látott kódot. Ezenkívül generáljon magának egy clientId-t, jegyezze meg és a beírt kóddal együtt küldje vissza a szervernek. A szerver validálja a küldött kódot és jegyezze meg a clientId-t.

## Server-side State

Minden adat csak memóriában él. Szerver restart esetén a párosítás elvész — ez elfogadható viselkedés.

```javascript
{
  pairingCode: "123456",       // null, ha nincs aktív kód
  pairingCodeExpiry: timestamp, // 5 percig érvényes
  paired: {
    clientId: "uuid",          // egyetlen párosított kliens
    apiKey: "random-hex"       // egyszerű, statikus kulcs
  } | null
}
```

Párosítás egyszerre csak egy REMOTE klienstől létezhet. Unpair törli a `paired` objektumot.

### Pairing Code
- Érvényesség: 5 perc
- Újra-generálás: bármikor kérhető LOCAL-tól (régi azonnal invalidálódik)
- Egy kód csak egyszer használható

## API Endpoints

### Pairing
```
POST /api/pairing/generate
  (LOCAL only)
  Response: { code: "123456" }

POST /api/pairing/validate
  Body: { code: "123456", clientId: "uuid" }
  Response: { apiKey: "abc123def456" }

POST /api/pairing/unpair
  (LOCAL only)
  Response: { success: true }

GET /api/pairing/status
  (LOCAL only)
  Response: { paired: boolean }
```

### Protected (Socket.IO + HTTP)
```
Authorization: Bearer {apiKey}
```

## Client-side State

### LOCAL
IP-alapú azonosítás — nem kell semmit tárolni.

### REMOTE
```javascript
localStorage: {
  clientId: "uuid-v4",   // generált azonosító, nem változik
  apiKey: "abc123..."    // párosítás után kapott kulcs
}
```

Az apiKey localStorage-ban tárolt → XSS esetén kiolvasható. Ez elfogadható kockázat, hiszen az alkalmazás zárt lokális hálózaton fut, nem publikus interneten.

## Authorization Flow

```
Request érkezik
  ├─ IP = 127.0.0.1 / ::1  →  LOCAL  →  engedélyez
  └─ egyéb IP               →  REMOTE →  Authorization header olvasása
                                           ├─ hiányzik / érvénytelen apiKey  →  "Need pairing"
                                           └─ érvényes apiKey               →  engedélyez
```

### Error Responses
```javascript
{ error: "NOT_PAIRED" }   // nincs érvényes apiKey
{ error: "INVALID_KEY" }  // helytelen apiKey
```

## Unpair Flow

LOCAL megnyomja az "Unpair" gombot:
1. `POST /api/pairing/unpair`
2. Szerver törli a `paired` objektumot
3. LOCAL oldal refrissül → megjelenik az új párosítási kód
4. REMOTE a következő requestnél `INVALID_KEY` hibát kap, és átirányít a pairing oldalra

## CORS

**Mi az a CORS?**  
A böngészők biztonsági szabálya: JavaScript csak akkor küldhet kérést egy URL-re, ha az **ugyanarról a szerverről** (origin: host + port) származik, mint maga az oldal — kivéve, ha a szerver explicit engedélyt ad (`Access-Control-Allow-Origin` header).

**Vonatkozik-e ránk?**  
Nem igazán. A kliens (HTML/JS) és a szerver **ugyanazon a hoston és porton** fut (`http://192.168.0.x:3000`). Nincs cross-origin kérés, tehát CORS-t nem fog a böngésző tiltani.

CORS csak akkor válna releváns, ha pl. a frontend egy másik porton futna (pl. Vite dev server: `:5173`), vagy egy teljesen más domainen lenne kiszolgálva.

**Jelenlegi beállítás:**
```javascript
io.cors = { origin: '*' }  // OK lokális hálón, nem szükséges szűkíteni
```

## Security Considerations

### HTTPS
Lokális hálózaton HTTP elfogadható. Az apiKey ugyan plaintext-ben utazik, de:
- A hálózat fizikailag zárt (otthoni/irodai LAN)
- HTTPS self-signed cert böngészőben warningot adna, ami zavaró

Ha valaha publikus hálózatra kerül → HTTPS kötelező.

### Rate Limiting
Egyelőre nem szükséges. Később bevezethető az `express-rate-limit` csomaggal.

### Audit Logging
Konzolra logolunk eseményeket (pairing, unpair, invalid key). Fájlba mentés egyelőre nem szükséges.

---

## Implementációs Sorrendiség

1. ✅ Authentication (LOCAL/REMOTE detektálás)
2. → Pairing logic (kód generálás, validálás, unpair)
3. → Authorization middleware (Socket.IO + HTTP)
4. → REMOTE redirect ha nincs párosítás
5. → Audit logging (console)