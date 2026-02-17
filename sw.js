const CACHE = 'lunarya-v1';
const FILES = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './game.js',
  './nipplejs.js',
  './player.png',
  './enemy_shadow.png',
  './enemy_mage.png',
  './enemy_beast.png',
  './boss_castle.png',
  './tileset.png',
  './bg_forest.png',
  './bg_ruins.png',
  './bg_castle.png',
  './particle.png',
  './music_theme.mp3',
  './sfx_attack.mp3',
  './sfx_magic.mp3',
  './sfx_dash.mp3',
  './icon-192.png',
  './icon-512.png',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
