# Username migracio es validacio

## Cel
Ez a dokumentum osszefoglalja, hogyan mukodik a meglevo userek username foglalasanak migracioja es a post-migration ellenorzes.

A projektben ket script van:
- `migrate:usernames`: username foglalasok letrehozasa/frissitese (`usernames/{usernameKey}`).
- `validate:usernames`: duplikaciok es hianyzo/hibas foglalasok riportja, opcionais Auth orphan scan/torles.

## Elokeszulet
Szukseges:
- Firebase projekt azonosito (`--project=bemyteammate` vagy `FIREBASE_PROJECT_ID`)
- Admin hitelesites (`--service-account=...` vagy `FIREBASE_SERVICE_ACCOUNT_PATH`)

Pelda PowerShell:
```powershell
$env:FIREBASE_PROJECT_ID="bemyteammate"
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\secrets\bemyteammate-sa.json"
```

## 1) Username migracio
Dry run:
```powershell
npm run migrate:usernames -- --dry-run --source=username-or-displayName --project=bemyteammate --service-account="C:\secrets\bemyteammate-sa.json"
```

Eles futtatas:
```powershell
npm run migrate:usernames -- --source=username-or-displayName --project=bemyteammate --service-account="C:\secrets\bemyteammate-sa.json"
```

Mit csinal:
- Beolvassa a `users` kollekciot.
- Username jeloltet valaszt (`username`, `displayName`, vagy fallback mod).
- Normalizal (`trim + lowercase + diakritika eltavolitas`).
- Tranzakcioban ir:
  - `usernames/{encodeURIComponent(usernameNormalized)}`
  - szukseg eseten `users/{uid}.username` es `users/{uid}.usernameNormalized`
- Konfliktusnal (mas UID foglalta mar) kihagyja es riportolja.

## 2) Post-migration validacio
Riport futtatasa:
```powershell
npm run validate:usernames -- --project=bemyteammate --with-auth-scan --service-account="C:\secrets\bemyteammate-sa.json"
```

A riport ellenorzi:
- duplikalt `usernameNormalized` ertekek a `users` alatt
- user, akinek nincs megfelelo `usernames/{key}` foglalasa
- user, akinek a foglalasat mas UID birtokolja
- `usernames` bejegyzes, ami nem letezo userre mutat
- elteres a user es foglalas normalizalt ertekei kozott

## 3) "Ures"/arva Auth accountok kezelese
Igen, a validacios script kepes Auth orphan usereket torolni, de csak explicit megerositessel.

Torles (veszelyes muvelet):
```powershell
npm run validate:usernames -- --project=bemyteammate --with-auth-scan --delete-auth-orphans --confirm-delete=DELETE --orphan-min-age-hours=24 --service-account="C:\secrets\bemyteammate-sa.json"
```

Megjegyzes:
- Az alkalmazas regisztracios logikaja mar rollbackel username utkozesnel, igy uj "arva" account normal esetben nem marad.
- A torlest mindig riport utan futtasd.

## Javasolt biztonsagos sorrend
1. `migrate:usernames` dry-run
2. `migrate:usernames` write
3. `validate:usernames` riport (`--with-auth-scan`)
4. Csak ha indokolt: `--delete-auth-orphans --confirm-delete=DELETE`

## Gyakori hiba
`Missing Firebase project ID`:
- add meg `--project=...` flaggel, vagy allitsd be `FIREBASE_PROJECT_ID` env valtozokent.

`Could not load the default credentials`:
- adj meg service account JSON-t (`--service-account=...`), vagy allits be ADC-t (`gcloud auth application-default login`).
