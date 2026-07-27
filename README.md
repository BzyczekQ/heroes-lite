# ⚔️ Heroes Lite

Lekka gra strategiczna w stylu **Heroes of Might and Magic 3**, napisana w czystym
HTML5 + JavaScript. Działa w przeglądarce telefonu (Android/iPhone), nic nie trzeba
instalować na telefonie. Idealna do pogrania np. „na kibla”. 😎

## Co potrafi

- 🗺️ **Mapa** z terenem (las, woda, góry, drogi), którą przesuwasz palcem.
- 🧙 **Bohater** z punktami ruchu — stukasz kafelek, bohater idzie (znajduje ścieżkę).
- 🏰 **Miasta** — rekrutujesz wojsko (5 typów jednostek), przerzucasz je między garnizonem a bohaterem.
- ⛏️ **Kopalnie** (złoto, drewno, ruda, klejnoty), 💰 skarby, 👹 potwory do pokonania.
- ⚔️ **Walka taktyczna** na planszy — jednostki ruszają się wg szybkości, strzelcy biją z dystansu, latające przelatują, po ataku wróg **odwzajemnia** cios.
- 📱 **Hot-seat** — gracze podają sobie jeden telefon na zmianę (ekran „podaj telefon”).
- 🌐 **Multiplayer po WiFi** — serwer na komputerze, telefony łączą się przez przeglądarkę (2–4 graczy).
- 🏆 Cel: pokonać bohatera przeciwnika LUB zdobyć jego miasto.

## Wymagania

- **Hot-seat:** tylko przeglądarka w telefonie.
- **Multiplayer:** komputer z **Node.js** (do uruchomienia serwera) + telefony w tej samej sieci WiFi.

---

## ▶️ Jak grać — HOT-SEAT (na 1 telefonie, najprościej)

1. Skopiuj cały folder `heroes-lite` na telefon (przez kabel / Dysk Google / cokolwiek).
2. Otwórz plik **`index.html`** w przeglądarce telefonu.
3. Wybierz **„📱 Hot-seat (2 graczy)"**.
4. Gracze podają sobie telefon na zmianę. Koniec tury → ekran „podaj telefon".

> Jeśli telefon blokuje otwieranie skryptów z pliku, użyj zamiast tego sposobu „multiplayer" poniżej (uruchom serwer na PC i wejdź na niego z telefonu — działa też dla hot-seata na jednym telefonie).

---

## ▶️ Jak grać — MULTIPLAYER po WiFi

1. Na **komputerze** (w tym samym WiFi co telefony) wejdź do folderu `heroes-lite` i uruchom:
   ```
   node server.js
   ```
2. W konsoli pojawi się adres, np.:
   ```
   Telefony w tej samej WiFi: http://192.168.1.20:8080
   ```
3. Na **każdym telefonie** otwórz w przeglądarce ten adres.
4. Każdy gracz wpisuje imię i klika **„🌐 Połącz i graj"**.
5. Gdy wszyscy (min. 2) będą w lobby, pierwszy gracz klika **„▶️ Start"**.
6. Gramy! Tura przechodzi między telefonami — gdy nie Twoja kolej, widzisz ekran czekania.

---

## 🎮 Sterowanie

**Mapa**
- **Stuknij kafelek** obok bohatera → bohater tam pójdzie.
- Stuknij **skarb / surowce / kopalnię / potwora** → zbierzesz / zdobędziesz / stoczysz walkę.
- Wejdź na **swoje miasto** (lub w nie stuknij) → ekran miasta i rekrutacja.
- **Przeciągnij palcem** → przesuwasz widok.
- **⏭️ Koniec tury** → przekazujesz kolejkę.

**Walka**
- Stuknij swoją jednostkę (podświetloną), potem stuknij **cel** (wróg) lub **pole** (ruch).
- Strzelcy 🏹 biją z dystansu. Latające 🦅 omijają jednostki.
- **🏃 Ucieczka** — wycofujesz się z ocalałymi (bohater zostaje żywy).

## 🧱 Co dalej (możliwe rozszerzenia)

Gra jest celowo „lekka", ale łatwo ją rozbudować:
- więcej frakcji / jednostek (edytuj tabelę `UNITS` w `game.js`),
- magia i zaklęcia,
- więcej bohaterów u jednego gracza,
- zapis/load stanu (stan to zwykły obiekt JSON — wystarczy zapisać do pliku).

## 📂 Pliki

- `index.html` — interfejs (HTML + CSS).
- `game.js` — cała logika gry, render i sieć.
- `server.js` — serwer multiplayer (zero zależności, sam Node).
- `test.js` / `test2.js` — testy logiki (`node test.js`).

Miłej gry! 🏰
