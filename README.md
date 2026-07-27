# ⚔️ Heroes Lite — Might & Magic

Lekka gra strategiczna w stylu **Heroes of Might & Magic III**, napisana w czystym HTML5 + JavaScript. Działa w przeglądarce telefonu, nic nie trzeba instalować. Idealna do pogrania „na kibla". 😎

---

## 📜 Historia Wersji i Ewolucja Projektu

* **📦 Wersja v0.1 – Prototyp Alfa:** Pierwsza próba przeniesienia mechanik gry na silnik przeglądarkowy. Zawierała podstawowy interfejs tekstowo-graficzny oraz system wyboru mapy. Walka w tej wersji nie działała ani pod względem wizualnym, ani logiki kodu – służyła jako fundament pod dalszy rozwój.

* **📦 Wersja v0.2 – 2D Emoji Engine:** Przełomowa, grywalna wersja. Zamiast skomplikowanych grafik zastosowano minimalistyczną i humorystyczną oprawę opartą o ikony i emotikony (Emoji). Zamiast osobnego widoku zamku wprowadzono czytelny panel tekstowy z opcjami rekrutacji i ulepszania. Naprawiono logikę walki.

* **📦 Wersja v0.3 – Rzut Izometryczny (Pseudo-3D):** Najnowsza odsłona wprowadzająca perspektywę izometryczną na mapie przygody, co znacznie poprawia czytelność i wygląd planszy, zachowując przy tym lekkość i szybkość działania.

---

## Co ma (wierniejsze HoMM3 niż v1)

- 🏰 **3 frakcje** (Zamek / Loch / Nekropolia), każda z **7 poziomami jednostek**.
- 🧙 **Wielu bohaterów** — zatrudniaj ich w **karczmie** w mieście (do 8), przełączaj przyciskiem 🧙⏭.
- 🗺️ **Mapa przygody** w 3 rozmiarach (Mała/Średnia/Duża) z **mgłą wojny**.
- 🪙 **7 surowców** + **targ** (⚖️) do wymiany surowców.
- 🏗️ **Budowle w mieście** — ratusz, forteca, siedliska. **1 budowla dziennie**.
- 🏚️ **Nowe obiekty mapy**: obserwatoria (🗼 odkrywają teren), świątynie (⛩️ dają XP), flagowane siedliska (dają tygodniowe jednostki), artefakty, kopalnie, skarby.
- ⚔️ **Walka na heksach** (15×11) — ruch wg szybkości, strzelcy, latające, odwzajemnienie, obrona, czekanie, **czary bojowe**. **Pinch-zoom + przesuwanie**.
- 🤖 **Przeciwnicy komputerowi** (AI na mapie i w walce).
- 💾 **Zapis/wczytanie** gry (przycisk 💾 + „Wczytaj" w menu).
- 📱 **Hot-seat** (2 graczy na 1 telefonie) i **🌐 Multiplayer po WiFi**.
- 🎯 Cel: odebrać przeciwnikom miasta i bohaterów.

---

## ▶️ Jak uruchomić

**Najszybciej — Hot-seat / gra z komputerem na 1 telefonie:**
1. Skopiuj folder na telefon i otwórz `index.html` w przeglądarce.  
   *(jeśli przeglądarka blokuje skrypty z pliku — użyj sposobu multiplayer poniżej)*

**Multiplayer / przez serwer (polecane):**
1. Na komputerze w tym samym WiFi: `node server.js`
2. Konsola pokaże adres, np. `http://192.168.1.20:8080`
3. Na telefonach wejdź na ten adres w przeglądarce.

---

## 🎮 Sterowanie

* **Mapa:** stuknij bohatera → stuknij cel (droga szukana automatycznie). Przeciągnij = przesuń widok.
* **Walka:** stuknij jednostkę (żółty pierścień) → stuknij cel/pole. Szczypnij = zoom, przeciągnij = przesuń.
* **Menu:** Nowa Gra → wybierz frakcję, rozmiar mapy i liczbę przeciwników.

---

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
