# Repülőgép-helyzetek mentése és visszatöltése

## Cél és hatókör

A felhasználó elmentheti az FS-ben álló, leállított repülőgép aktuális helyzetét, megnézheti a mentett helyzeteket, kiválaszthat egyet, és visszatöltheti az FS-be.

A mentett helyzet egy parkolt repülőgép térbeli állapotát jelenti: földrajzi pozíciót, magasságot és orientációt. Nem autopilot-preset, nem flight plan és nem teljes szimulátorállapot. A REM-AP panel meglévő UI-ja, klienskódja, állapotmodellje és vezérlési logikája nem része ennek a feature-nek, és nem kell belőle kódot átvenni. A funkció külön aloldalon érhető el, amelyre a főoldalról lehet navigálni.

## Önálló felépítés

- **Aloldali UI:** külön pozíciómentő oldal (például `src/web/saved-positions.html`) dedikált kliensoldali modullal; a főoldal (`src/web/index.html`) csak navigációs hivatkozást adjon hozzá. A REM-AP panel HTML-je és `src/web/app.js` kódja ne változzon.
- **Szerveroldali feature-modul:** új, elkülönített szolgáltatás kezelje a mentések CRUD-műveleteit, validálását és az FS-helyzet műveleteit. Ne olvasson vagy módosítson REM-AP/autopilot state-et.
- **Socket.IO interfész:** dedikált események vagy namespace tartozzon a helyzetmentéshez; ne használja a meglévő autopilot `control` eseményt.
- **SimConnect adapter:** saját adatkérésekkel olvassa a helyzetet, saját eljárással hajtsa végre a visszaállítást. A megvalósítás során a SimConnect-kapcsolat megosztásának vagy külön kezelésének technikai lehetőségét ellenőrizni kell. A domain- és UI-logika ettől független marad.
- **Tárolás:** SQLite-adatbázis a szerver adatkönyvtárában; az adatbázis ne a statikus webkönyvtárban legyen.

## Mentési szabályok

Mentés kizárólag akkor engedélyezett, ha az FS friss adatai alapján mind teljesül:

1. A repülőgép a földön van.
2. A repülőgép nem mozog.
3. A parking brake be van kapcsolva.
4. Minden motor ki van kapcsolva.

A szerver ezeket autoritatívan, mentési kérésenként ellenőrizze. Az aloldal jelezze a feltételek állapotát, és tiltsa le a mentés gombot, ha bármelyik nem teljesült vagy ismeretlen; a kliensoldali tiltás nem helyettesíti a szerveroldali ellenőrzést. Ismeretlen, hiányzó vagy elavult SimConnect-adat soha ne számítson teljesült feltételnek. A mozdulatlansághoz ground speed adatot és rövid stabilitási ablakot használjunk; a küszöböt és az ablak hosszát FS2024-es mintavételezéssel kell megerősíteni.

A mentés kizárólag az FS-ből mintavételezett adatot használja, a böngészőből érkező koordinátát vagy orientációt ne fogadjon el.

## Mentett adatok

Az első verzióban a mentett helyzet tartalmazza:

- `id`: szerver által generált egyedi azonosító
- `aircraftKey`, `aircraftTitle`: a repülőgép típusának/stabil szimulátorbeli azonosítójának kulcsa
- `createdAt`: mentés időpontja
- `position`: latitude/longitude in degrees; altitude above mean sea level (MSL) in meters
- `orientation`: true heading, pitch and bank/roll in degrees
- opcionális `groundElevationMslMeters`: mentéskori talajmagasság, csak diagnosztikai összehasonlításhoz
- opcionális `place`: felismert/szerkesztett repülőtér ICAO-kódja, neve, városa és országa
- `label`: szabadon szerkeszthető mentésnév; ha nincs használható repülőtér-találat, a felhasználó tetszőleges nevet adhat (például „A tavalyi legkedvesebb repülésem”)
- opcionális `note`: felhasználói megjegyzés

A koordináták és orientáció rögzített mértékegységeit a SimConnect-adapter kezelje: a tárolási séma egységesen fokot és MSL-métert használjon, a SimConnect által igényelt egységekre pedig az adapter konvertáljon. A heading true (valódi észak) szerinti legyen. A mentés előfeltételeként használt állapotok (on-ground, ground speed, parking brake, motorok) a mentés engedélyezéséhez kellenek; nem részei a visszatöltött snapshotnak. Az első verzióban nem cél a teljes motor-, üzemanyag-, időjárás-, avionika- vagy szimulátorállapot visszaállítása.

Repülőgépenként külön lista tartozzon a SimConnect `TITLE`-ből képzett stabil kulcshoz. A callsign/ATC ID ne legyen gépazonosító. Gépváltáskor a kliens azonnal törölje az előző gép kijelölését és listáját.

### Automatikus helyfelismerés

Az automatikus repülőtér-felismerés a feature elsődleges része. A mentés aktuális FS-koordinátái alapján keressünk megfelelő repülőteret megbízható airport-adatforrásból vagy igazolt SimConnect-facility lekérdezéssel. A felismerés eredménye javaslat legyen, ne kötelező vagy megváltoztathatatlan adat. Ha van megfelelő találat, a felhasználó szerkeszthető mezőként kapja meg az ICAO-kódot, a repülőtér nevét, a várost és az országot; a mezők elfogadhatók, kiegészíthetők vagy törölhetők.

Ha a felismerés sikertelen vagy nem megbízható, a mentés akkor is folytatható legyen. A felhasználó adjon saját címkét és opcionális megjegyzést. A már felajánlott repülőtér-adat teljes törlése csak ezt a leíró metaadatot törölje, a visszatöltéshez szükséges pontos FS-koordinátákat és orientációt ne. Közeli repülőtereknél több jelöltet lehessen kiválasztani; bizonytalan jelöltet ne rögzítsünk automatikusan megerősítettként.

## Betöltési viselkedés

- A kliens egy mentés kiválasztásakor mutassa meg a nevet, repülőgépet, mentés dátumát, pozíciót és orientációt.
- Betöltés előtt legyen egyértelmű megerősítés, mert a művelet a repülőgépet a mentett koordinátára helyezi át.
- A kérés csak mentésazonosítót küldjön. A szerver az adatból töltse be a pozíciót; kliens által küldött pozíciót ne írjon az FS-be.
- A szerver ellenőrizze az FS-kapcsolatot, az aktív repülőgépet és a mentés gépazonosságát, valamint az összes mentett érték tartományát. Visszatöltéskor is követelje meg a friss FS-adatok alapján a földön állást és a mozdulatlanságot; ismeretlen vagy elavult adat esetén utasítsa el a műveletet. A szerver a betöltési kéréskor ezt ismét ellenőrizze.
- A betöltő adapter a mentett MSL-méteres magasságot és fokban tárolt orientációt a SimConnect API egységeire konvertálja. A parkolt visszaállítás műveleti paraméterei legyenek `OnGround = true` és `Airspeed = 0`; ezeket ne a felhasználó szerkessze.
- A SimConnect pozíció-visszaállítási API-ját és annak FS2024-es viselkedését előzetesen igazolni kell. A végrehajtást tekintsük atomi műveletnek, vagy ha a pozíció és orientáció csak több lépésben írható be, a részleges hiba legyen felismerhető és a UI jelezze egyértelműen.
- Sikeres művelet után olvassuk vissza az FS-ből az aktuális pozíciót és orientációt, és csak egyező/elfogadható eredmény után jelezzünk sikert.
- A mentéshez továbbra is mind a négy feltétel szükséges (földön, mozdulatlan, parking brake bekapcsolva, motorok kikapcsolva). Betöltéshez kötelező a földön állás és mozdulatlanság; a parking brake és a motorok állapota nem további betöltési előfeltétel az első verzióban. Betöltés előtt a felhasználó erősítse meg a helyváltoztatást.

## Tárolás

Használjunk SQLite-adatbázist a szerver adatkönyvtárában, a webes statikus fájloktól külön. Az adatbázisfájl ne kerüljön verziókezelésbe. A `saved_positions` tábla tartalmazza az azonosítót, repülőgép-kulcsot és címet, felhasználói címkét, opcionális megjegyzést, létrehozási időt, szélességet/hosszúságot (fok), MSL-magasságot (méter), true headinget/pitch-et/banket (fok), valamint opcionálisan a mentéskori talajmagasságot (MSL-méter). Az opcionális repülőtér-metaadatok (ICAO, név, város, ország) külön mezők legyenek, és maradhassanak üresek vagy NULL értékűek, ha nincs felismerés vagy a felhasználó törli őket. Legyen index a repülőgép-kulcson és a létrehozási időn, hogy az adott gép listája hatékonyan lekérdezhető legyen.

A SQLite-hozzáférés külön, a REM-AP state-től független modult kapjon. Minden adatbázis-módosítás paraméterezett lekérdezésekkel és tranzakcióval történjen; a séma változásait verziózott migráció kezelje (`PRAGMA user_version`). Validáljuk a neveket, koordinátákat, magasságot és orientációt íráskor és olvasáskor is. A megvalósításkor válasszuk a projekt Node.js-verziójával és Windowsszal kompatibilis legfrissebb stabil SQLite-drivert, valamint az ezekhez szükséges legfrissebb stabil runtime/dependency verziókat. A pontos verziókat rögzítsük a package manifestben és lockfile-ban; prerelease verziót és lebegő `latest` függőséget ne használjunk.

### Export és import

Az első verzió tartalmazzon kézi exportot és importot, de automatikus adatbázis-backupot ne. Az export legyen verziózott, hordozható JSON-fájl, amely a mentett pozíciókat, gépazonosítókat, címkéket, megjegyzéseket és felhasználó által jóváhagyott repülőtér-metaadatokat tartalmazza. Az import előnézetben mutassa meg a rekordok számát, a hibás bejegyzéseket és az azonosítóütközéseket; csak megerősítés után írjon adatot SQLite-ba, tranzakcióban. Meglévő mentést ne írjon felül csendben; ütközéskor jelezzen, és hagyja a felhasználót kihagyni vagy új rekordként importálni.

Az import adatbázisba ment, nem indít FS-visszatöltést. Importált pozíció visszatöltésekor ugyanúgy ellenőrizni kell a gépazonosságot, az FS-kapcsolatot, a földön állást és a mozdulatlanságot. Az automatikus backup/retention nem része ennek a kiadásnak; később külön GFS (Grandfather-Father-Son) retention policy alapján tervezendő.

## Aloldali működés

Az önálló mentés-visszatöltés oldal a főoldalról legyen elérhető. A kezdőoldalon csak a hozzá vezető navigációs hivatkozás jelenjen meg; a feature vezérlői és listája az aloldalon legyenek. A REM-AP panel és a meglévő főoldali működés maradjon változatlan.

- Aktív FS-kapcsolat és repülőgép megjelenítése.
- A négy mentési feltétel külön, jól érthető állapotjelzése: földön, álló helyzet, parking brake, motorok.
- Mentéskor automatikus repülőtér-felismerés és szerkeszthető javaslatmezők az ICAO-kódhoz, repülőtérnévhez, városhoz és országhoz. A felhasználó elfogadhatja, átírhatja vagy teljesen törölheti a javasolt adatokat.
- Ha nincs felismerhető repülőtér, vagy a felhasználó törli a javaslatot, szabad címke és opcionális megjegyzés adható; például „A tavalyi legkedvesebb repülésem”. A saját címkéhez ne legyen kötelező repülőtér-adat.
- „Helyzet mentése” művelet; a gomb csak az összes mentési feltétel teljesülésekor aktív.
- Aktív repülőgép mentett helyzeteinek listája, a felhasználó által véglegesített címkével, opcionális repülőtér-adattal és mentési idővel.
- Kiválasztáskor pozíció/orientáció részletei és külön „Betöltés az FS-be” művelet megerősítéssel.
- Kapcsolatvesztés, ismeretlen feltétel, üres lista, mentési hiba, betöltési folyamat és visszaolvasási eltérés külön állapot legyen.

## Szerveres események

Használjunk dedikált `savedPositions:*` eseményeket vagy külön Socket.IO namespace-et.

- `savedPositions:status`: aktív gép, FS-kapcsolat és az aktuális művelethez szükséges feltételek legfrissebb állapota (mentés: mind a négy feltétel; betöltés: földön és mozdulatlan).
- `savedPositions:list`: az aktív géphez tartozó mentések listázása.
- `savedPositions:save`: a felhasználó által elfogadott/szerkesztett opcionális hely-metaadatot, címkét és megjegyzést fogadja; a szerver ellenőrizze a mentési feltételeket, olvassa ki a helyzetet, validálja a metaadatot, majd tartósítsa.
- Helyfelismerési művelet vagy válasz a mentés előnézetéhez: az FS-ből olvasott koordináta alapján adjon nulla, egy vagy több jelöltet, és a találat bizonytalanságát is közölje. A kliens által küldött koordinátát a felismeréshez se tekintsük hiteles FS-pozíciónak.
- `savedPositions:load`: csak mentésazonosítót fogadjon; a szerver betöltse és validálja a mentést, majd hajtsa végre a SimConnect-visszaállítást.
- `savedPositions:export`: a kért mentéseket verziózott JSON-adatként adja vissza letöltéshez.
- `savedPositions:import`: validált importfájlt fogadjon; előnézet/ütközésfeloldás után tranzakcióban rögzítse az új rekordokat, FS-visszatöltés nélkül.
- Válaszok/eredményesemények tartalmazzanak stabil hibakódot és rövid, felhasználónak szóló üzenetet.

Ellenőrizzük a kéréseket és a tárolóból beolvasott adatot is. A kliens ne adhasson meg más géphez tartozó azonosítót vagy tetszőleges FS-adatot.

## Megvalósítási lépések

1. **FS-adatok és helyfelismerés:** igazolni a helyzethez szükséges olvasási változókat és mértékegységeket, a mentési feltételeket, a koordináta-referenciát és a helyzet-visszaállítási API-t. Kiválasztani és ellenőrizni az airport-adatforrást/facility-lekérdezést, a jelölt rangsorolását és azt, hogyan jelezzük a bizonytalan vagy sikertelen felismerést. Próbáljuk ki a SimConnect-kapcsolat biztonságos megosztását vagy külön adapter használatát.
2. **Önálló SQLite-adattár és domain modul:** latest stable kompatibilis SQLite-driver és Node.js runtime kiválasztása, pontos verzióik rögzítése, gépkulcs, séma/migráció, validálás, tranzakciós mentés/listázás/export/import és célzott egységtesztek.
3. **SimConnect olvasás/írás:** külön adapter az FS-helyzet lekérésére, előfeltételek követésére és a kiválasztott mentés visszaállítására; autopilot-panel kód nélkül.
4. **Socket.IO szerződés:** külön események a státuszhoz, mentéshez, listázáshoz és betöltéshez; tesztelni kapcsolathiányt, gépváltást, tiltott mentést, érvénytelen kérést és részleges visszaállítási hibát.
5. **UI:** a főoldalon csak navigációt adni az új aloldalhoz; az aloldali dedikált kliensmodulban implementálni a feltételjelzéseket, listát, kiválasztást, megerősítést, export/import előnézetet és hibakezelést. A REM-AP fájlokat nem módosítani.
6. **FS2024-es integrációs ellenőrzés:** álló gépnél menteni, újraindítás után listázni, ugyanahhoz a géphez visszatölteni, majd FS-ből visszaolvasni a helyzetet. Próbáljuk végig külön-külön a négy mentési feltétel megszegését és gépváltást.

## Elfogadási feltételek

- A mentés-visszatöltés vezérlői és listája a főoldalról elérhető külön aloldalon találhatók; a főoldal csak navigációs hivatkozást ad hozzá.
- A REM-AP panelből semmi nem szükséges, és a panel működését a feature nem módosítja.
- Mentés csak akkor lehetséges, ha az FS szerint a repülőgép a földön van, mozdulatlan, parking brake-je be van kapcsolva és minden motorja le van állítva.
- Ismeretlen vagy elavult feltételadat esetén a szerver elutasítja a mentést akkor is, ha a kliens gombja engedélyezettnek látszana.
- Betöltéskor is kötelező a friss FS-adatok szerint földön állás és mozdulatlanság; bármelyik ismeretlen vagy nem teljesült állapota esetén a szerver elutasítja a műveletet.
- Mentés az FS-ből olvasott szélességet/hosszúságot, MSL-magasságot, true headinget, pitch-et és banket tartalmazza; nem tartalmaz autopilot-presetet vagy teljes szimulátorállapotot.
- A mentések gépenként elkülönülnek és újraindítás után is megmaradnak.
- Az aloldal automatikusan megkísérli a repülőtér felismerését, és az elérhető adatokat szerkeszthető javaslatként mutatja.
- A felhasználó a javasolt adatokat elfogadhatja, átírhatja vagy törölheti; felismerési találat nélkül is menthet tetszőleges címkével és opcionális megjegyzéssel.
- A repülőtér-metaadat törlése vagy módosítása nem változtatja meg a mentett pozíciót/orientációt.
- A felhasználó listázhatja, kiválaszthatja és megerősítés után az FS-be visszatöltheti az adott gép mentett helyzetét.
- A szerver nem fogad el a klienstől tetszőleges koordinátát visszaállításra, és gépeltérés vagy hibás mentés esetén nem indít SimConnect-műveletet.
- A UI sikeres betöltést csak az FS-ből visszaolvasott állapot ellenőrzése után jelez.
- A mentések exportálhatók verziózott JSON-ba, importálhatók validálással és ütközéskezeléssel; az import nem írja felül csendben a meglévő rekordokat, és nem tölti vissza automatikusan az FS-be.
- A megvalósítás a legfrissebb kompatibilis stabil SQLite-driver/runtime verziókat használja, pontos verziókkal rögzítve; automatikus backup/GFS retention nincs az első verzióban.

## Nyitott döntések

- A konkrét SQLite-driver/runtime verziókat a feature implementálásakor kell kiválasztani a legfrissebb kompatibilis stabil kiadások közül, majd rögzíteni a lockfile-ban.
- A GFS retention policy szerinti automatikus adatbázis-backup későbbi fejlesztés; az első verzióban kézi export/import van, automatikus backup nincs.