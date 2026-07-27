# ⚔️ Heroes Lite — Might & Magic

Lekka gra strategiczna w stylu **Heroes of Might & Magic III**, napisana w czystym
HTML5 + JavaScript. Działa w przeglądarce telefonu, nic nie trzeba instalować.
Idealna do pogrania „na kibla". 😎

## Co ma (wierniejsze HoMM3 niż v1)

- 🏰 **3 frakcje** (Zamek / Loch / Nekropolia), każda z **7 poziomami jednostek**.
- 🗺️ **Mapa przygody** w 3 rozmiarach (Mała/Średnia/Duża) z **mgłą wojny**
  (nieodkryte / odkryte / widoczne).
- 🪙 **7 surowców** jak w oryginale (złoto, drewno, ruda, rtęć, siarka, kryształ, klejnoty).
- 🏗️ **Budowle w mieście** — ratusz (dochód), forteca, siedliska jednostek. **1 budowla dziennie**.
- ⚔️ **Walka taktyczna na HEKSACH** (15×11) — ruch wg szybkości, strzelcy, latające,
  odwzajemnienie ciosu, obrona, czekanie, **czary bojowe**. **Pinch-zoom + przesuwanie**.
- 🤖 **Przeciwnicy komputerowi** (AI na mapie i w walce).
- 📱 **Hot-seat** (2 graczy na 1 telefonie) i **🌐 Multiplayer po WiFi** (serwer na PC).
- 🎯 Cel: odebrać przeciwnikom miasta i bohaterów.

## ▶️ Jak uruchomić

**Najszybciej — Hot-seat / gra z komputerem na 1 telefonie:**
1. Skopiuj folder na telefon i otwórz `index.html` w przeglądarce.
   *(jeśli przeglądarka blokuje skrypty z pliku — użyj sposobu multiplayer poniżej)*

**Multiplayer / przez serwer (polecane):**
1. Na komputerze w tym samym WiFi: `node server.js`
2. Konsola pokaże adres, np. `http://192.168.1.20:8080`
3. Na telefonach wejdź na ten adres w przeglądarce.

## 🎮 Sterowanie

**Mapa:** stuknij bohatera → stuknij cel (droga szukana automatycznie). Przeciągnij = przesuń widok.
**Walka:** stuknij jednostkę (żółty pierścień) → stuknij cel/pole. Szczypnij = zoom, przeciągnij = przesuń.
**Menu:** Nowa Gra → wybierz frakcję, rozmiar mapy i liczbę przeciwników.

## 📁 Pliki

| Plik | Co zawiera |
|------|-----------|
| `index.html` | interfejs + menu (styl HoMM3) |
| `data.js` | frakcje, jednostki, surowce, czary |
| `engine.js` | logika gry (mapa, heksy, walka, ekonomia) — testowalna w Node |
| `render.js` | render Canvas + sterowanie + sieć |
| `server.js` | serwer multiplayer (sam Node, zero zależności) |
| `test.js`, `test_combat.js` | testy logiki (`node test.js`) |

Miłej gry! 🏰
