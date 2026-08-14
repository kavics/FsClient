# FS2024 Autopilot Remote Panel

## Projekt célja

Egy egyszerű, gyors és mobilbarát távoli autopilot vezérlőpanel készítése a **Microsoft Flight Simulator 2024** számára.

Az alkalmazás egy **Node.js** alapú webszerverként fut azon a Windows PC-n, amelyen az FS2024 is fut. A kezelőfelületet telefonról vagy tabletről, egy hagyományos böngésző segítségével lehet használni.

Az első verzió célja kizárólag az autopilot legfontosabb funkcióinak vezérlése.

---

# Célok

- Egyszerű telepítés
- Egyszerű architektúra
- Minimális függőségek
- Valós idejű működés
- Mobilbarát kezelőfelület
- Később könnyen bővíthető rendszer

---

# Architektúra

```
                    Wi-Fi

        +---------------------------+
        |                           |
        |                           |
+-------v--------+          +-------v--------+
|    Telefon     |          |   FS2024 PC    |
| Chrome/Safari  |          |                |
+----------------+          |  FS2024        |
                            |  Node.js       |
                            |  Express       |
                            |  Socket.IO     |
                            |  SimConnect    |
                            +----------------+
```

---

# Működés

A Node.js alkalmazás két feladatot lát el:

1. Webszerverként kiszolgálja a kezelőfelületet.
2. SimConnect segítségével kommunikál az FS2024-gyel.

A telefon böngészője HTTP-n letölti a weboldalt, majd egy állandó WebSocket kapcsolaton keresztül kommunikál a szerverrel.

---

# Hálózat

Minden eszköz ugyanarra a helyi hálózatra csatlakozik.

```
             Router

          /           \
         /             \
        /               \

  FS2024 PC          Telefon

192.168.1.52      192.168.1.88
```

A telefon a következő címen éri el az alkalmazást:

```
http://192.168.1.52:3000
```

Internetkapcsolat nem szükséges.

---

# Kommunikáció

## Telefon → FS2024

```
Felhasználó megnyomja:

HDG +

↓

WebSocket

↓

Node.js

↓

SimConnect Event

↓

FS2024
```

---

## FS2024 → Telefon

```
Heading Bug megváltozik

↓

SimConnect

↓

Node.js

↓

WebSocket

↓

GUI frissül
```

A GUI mindig a szimulátor aktuális állapotát mutatja.

---

# Technológiák

## Backend

- Node.js
- Express
- Socket.IO
- SimConnect Library

## Frontend

- HTML5
- CSS3
- JavaScript

Az első verzióban nincs szükség React, Angular vagy Vue használatára.

---

# Projekt struktúra

```
project/

│
├── server/
│     app.js
│
├── simconnect/
│     autopilot.js
│     events.js
│
├── web/
│     index.html
│     style.css
│     app.js
│
└── package.json
```

---

# GUI (V1)

```
+------------------------------------------------+

 HDG         NAV          APR

 (-) 123 (+)

 ALT         Flight Director

 (-)12000(+)

 VS          IAS / Speed

 (-) 700 (+)     (-)250(+)

               AP MASTER

+------------------------------------------------+
```

---

# Funkciók

## Heading

- Heading Bug kijelzése
- +1°
- -1°
- közvetlen értékbevitel

---

## Altitude

- Selected Altitude kijelzése
- +100 ft
- -100 ft
- közvetlen értékbevitel

---

## Vertical Speed

- Vertical Speed kijelzése
- +100 ft/min
- -100 ft/min
- közvetlen értékbevitel

---

## Selected Speed (IAS)

- Selected Speed kijelzése
- +1 kt
- -1 kt
- közvetlen értékbevitel

A GUI-ban egyelőre **IAS** felirat jelenik meg.

---

## Autopilot módok

- HDG Hold
- NAV Hold
- APR Hold
- Flight Director
- IAS Hold / FLC (repülőgéptől függően)
- AP MASTER

---

# IAS és FLC

A különböző repülőgépek eltérően kezelik a sebességvezérlést.

### Egyes típusok

- IAS Hold
- Speed Hold

### Más típusok

- FLC (Flight Level Change)

Az FLC módban a pilóta a kívánt sebességet állítja be, az autopilot pedig automatikusan módosítja a függőleges sebességet annak érdekében, hogy ezt a sebességet tartsa emelkedés vagy süllyedés közben.

A backend ezért nem "IAS"-ként, hanem általánosan **Selected Speed** paraméterként kezeli ezt az értéket.

Így később könnyen támogathatók lesznek:

- Garmin G1000
- TBM 930
- Boeing 737
- Airbus A320
- egyéb repülőgépek

anélkül, hogy a GUI vagy a backend szerkezetét át kellene alakítani.

---

# Állapotmodell

```javascript
state = {

    ap: true,
    fd: true,

    heading: 123,
    altitude: 12000,
    vs: 700,
    selectedSpeed: 250,

    hdg: true,
    nav: false,
    apr: false,

    speedMode: "IAS"
}
```

A `speedMode` később lehet például:

```
IAS
FLC
SPD
Managed
```

repülőgéptől függően.

---

# Frissítési folyamat

```
FS2024

↓

SimConnect

↓

State frissítése

↓

WebSocket Broadcast

↓

Telefon GUI frissítése
```

A kliens nem kérdezgeti folyamatosan a szervert.

Minden változást a szerver automatikusan továbbít.

---

# GUI működése

A kijelzett értékek mindig az aktuális szimulátorállapotot tükrözik.

Ha a felhasználó:

- egérrel állít valamit a cockpitben
- billentyűparancsot használ
- joystick gombot nyom
- hardver MCP panelt használ

akkor a telefon kijelzője automatikusan frissül.

---

# Első verzió céljai

- Stabil működés
- Egyszerű kezelőfelület
- Gyors válaszidő
- Mobiltelefonon is kényelmes használat
- Egyszerű kódbázis
- Könnyű bővíthetőség

---

# Lehetséges későbbi fejlesztések (V2)

## Rádió

- COM1
- COM2
- NAV1
- NAV2
- ADF

---

## Navigáció

- OBS
- CRS
- CDI
- DME

---

## Autopilot

- Autothrottle
- Speed Mode
- VNAV
- LNAV
- Vertical Mode kijelzés
- Lateral Mode kijelzés

---

## Egyéb

- BARO
- Squawk
- Transponder Mode
- Landing Lights
- Beacon
- Strobe
- Taxi Lights

---

## Komplex panelek

- Garmin G1000
- Garmin G3000
- Boeing MCP
- Airbus FCU
- Saját Glass Cockpit

---

# Összegzés

Az első verzió célja egy stabil, egyszerű és gyors távoli autopilot panel elkészítése, amely a helyi hálózaton keresztül, böngészőből vezérelhető.

A Node.js alkalmazás biztosítja a kapcsolatot a SimConnect és a böngésző között, míg a WebSocket kommunikáció gondoskodik arról, hogy a telefon kijelzője mindig valós időben kövesse a szimulátor állapotát.

A rendszer alapjai úgy kerülnek kialakításra, hogy a későbbiekben minimális módosítással teljes rádiópanel, Garmin kijelző vagy akár egy komplett MCP is építhető legyen ugyanarra az architektúrára.