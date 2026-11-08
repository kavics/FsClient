# Törölhető tesztmaradványok

Átnézve: 2026-11-08

## Törlésre jelölt fájlok

Ezek a fájlok néhány bájtos, általános jelölők vagy egy próba-feladathoz tartozó konfiguráció. A projekt kódjában és a VS Code taskok között nincs rájuk hivatkozás.

- `src/__done.txt`
- `src/__last.txt`
- `src/__noop_probe.txt`
- `src/__please_stop.txt`
- `src/__remove_me.txt`
- `src/__zz.txt`
- `src/__task_probe_ap_state.json`

## Megőrzendő fájlok

- A `src/server/**/*.test.js` fájlok tesztforrások, nem korábbi tesztfuttatások eredményei.
- A `src/probe-*.js`, `src/probe.js` és `src/tmp-simprobe.js` fájlok diagnosztikai szkriptek; többjük szerepel a `src/.vscode/tasks.json` taskjaiban.
- A `src/server/data/saved-positions.sqlite` adatbázis futásidejű adatot tartalmaz. A hozzá tartozó `-shm` és `-wal` fájlok SQLite mellékfájlok; aktív adatbázis mellett nem biztonságos önállóan törölni őket.

## Összegzés

Nem találtam különálló, tesztfuttatás által készített eredményfájlokat. A fenti hét jelölt törölhetőnek tűnik, de ez a fájl csak listázza őket; nem töröltem semmit.
