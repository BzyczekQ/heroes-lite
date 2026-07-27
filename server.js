// Heroes Lite — serwer multiplayer po WiFi (zero zależności, sam Node).
// Uruchom:  node server.js   →   telefony w tej samej WiFi wchodzą na http://<IP-PC>:8080
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 8080;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
const FILES = { '/': 'index.html', '/index.html': 'index.html', '/data.js': 'data.js', '/engine.js': 'engine.js', '/render.js': 'render.js' };

let seatCounter = 0;
const clients = new Map();
function broadcast(obj, except) {
  const data = 'data: ' + JSON.stringify(obj) + '\n\n';
  for (const res of clients.keys()) if (res !== except) res.write(data);
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (FILES[url]) { return serve(res, FILES[url]); }
  if (url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.write('retry: 2000\n\n');
    const id = seatCounter++; clients.set(res, { id, name: '' });
    res.write('data: ' + JSON.stringify({ t: 'seat', i: id }) + '\n\n');
    broadcastRoster();
    req.on('close', () => { clients.delete(res); broadcastRoster(); });
    return;
  }
  if (url === '/send' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        if (msg && msg.t === 'join' && typeof msg.name === 'string' && typeof msg.i === 'number') {
          for (const c of clients.values()) if (c.id === msg.i) { c.name = msg.name.slice(0, 14); break; }
          broadcastRoster();
        } else broadcast(msg, res);
      } catch (e) { }
      res.writeHead(204); res.end();
    });
    return;
  }
  res.writeHead(404); res.end('404');
});
function serve(res, file) {
  fs.readFile(path.join(__dirname, file), (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(data);
  });
}
function broadcastRoster() {
  const roster = [...clients.values()].map(c => ({ i: c.id, name: c.name }));
  broadcast({ t: 'roster', roster });
}
function localIPs() {
  const out = [];
  for (const k in os.networkInterfaces()) for (const a of os.networkInterfaces()[k])
    if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  ⚔️  Heroes Lite — serwer działa!\n');
  console.log('  Ten komputer:    http://localhost:' + PORT);
  localIPs().forEach(ip => console.log('  Telefony (WiFi): http://' + ip + ':' + PORT));
  console.log('\n  (Ctrl+C = stop)\n');
});
