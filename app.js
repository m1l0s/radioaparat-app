// app.js — sve funkcije premestene u js/ module
// Ovaj fajl je prazan nakon aktivacije split arhitekture.
```

`app.js` ostaje na GitHubu (i dalje se referenciše nigde), ali ne treba ga brisati odmah — sigurnosna mreža.

---

## Zašto ring nije radio (bonus)

`updateRing`, `clearRing`, `startRingForCurrentShow` su **SAMO u `ring.js`** — nikad nisu ni bile u `app.js`. Jer `ring.js` se nije učitavao, ring je bio potpuno mrtav. Aktivacijom splita to se automatski rešava.

---

## Redosled skripti — zašto taj redosled
```
config → utils → nav → ring → miniPlayer → metadata → player
→ superMeni → replay → favoriti → emisije → raspored → airplay → sleepTimer → boot
```

`boot.js` mora biti **poslednji** — poziva `renderFavs()` i `loadShowsFromExcel()` koje zavise od svih ostalih.

---

Kada pushuješ ove dve promene na GitHub, aplikacija automatski prelazi na modularnu arhitekturu. Posle toga krećemo na bugove.

**Predlog commit poruke:**
```
feat: activate js module split, empty app.js
