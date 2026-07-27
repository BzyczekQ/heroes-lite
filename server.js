// Heroes Lite — prosty serwer multiplayer po WiFi.
// Zero zależności (sam wbudowany Node). Uruchom:  node server.js
// Potem na telefonie (w tej samej sieci WiFi) wejdź na: http://<IP-KOMPUTERA>:8080
//
// Serwer:
//  - udostępnia index.html i game.js,
//  - rozsyła komunikaty graczy do wszystkich (relay) przez Server-Sent Events + POST.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// --- SSE clients ---
let seatCounter = 0;
const clients = new Map(); // res -> { id, name }

function broadcast(obj, exceptRes) {
  const data = 'data: ' + JSON.stringify(obj) + '\n\n';
  for (const res of clients.keys()) {
    if (res === exceptRes) continue;
    res.write(data);
  }
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // --- static files ---
  if (url === '/' || url === '/index.html') return serve(res, 'index.html', 'text/html; charset=utf-8');
  if (url === '/game.js') return serve(res, 'game.js', 'application/javascript; charset=utf-8');

  // --- SSE stream (każde połączenie = jeden gracz) ---
  if (url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 2000\n\n');
    const id = seatCounter++;
    clients.set(res, { id, name: '' });
    // przydziel miejsce (indeks = kolejność wejścia)
    res.write('data: ' + JSON.stringify({ t: 'seat', i: id }) + '\n\n');
    broadcastRoster();
    req.on('close', () => { clients.delete(res); broadcastRoster(); });
    return;
  }

  // --- wysyłka wiadomości od klienta do wszystkich ---
  if (url === '/send' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        if (msg && msg.t === 'join' && typeof msg.name === 'string' && typeof msg.i === 'number') {
          // powiąż imię z miejscem (połączenie POST to inny strumień niż SSE — szukamy po id miejsca)
          for (const c of clients.values()) if (c.id === msg.i) { c.name = msg.name.slice(0, 14); break; }
          broadcastRoster();
        } else {
          // relay pełnego stanu / akcji do wszystkich (poza nadawcą)
          broadcast(msg, res);
        }
      } catch (e) { /* ignoruj błędne JSON-y */ }
      res.writeHead(204); res.end();
    });
    return;
  }

  res.writeHead(404); res.end('404');
});

function serve(res, file, type) {
  const p = path.join(__dirname, file);
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

function broadcastRoster() {
  const roster = [...clients.values()].map(c => ({ i: c.id, name: c.name }));
  broadcast({ t: 'roster', roster });
}

function localIPs() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const k in ifs) for (const a of ifs[k]) {
    if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  ⚔️  Heroes Lite — serwer działa!\n');
  console.log('  Graj na tym komputerze:   http://localhost:' + PORT);
  for (const ip of localIPs()) {
    console.log('  Telefony w tej samej WiFi: http://' + ip + ':' + PORT);
  }
  console.log('\n  (Ctrl+C aby zatrzymać)\n');
});
