// ═══════════════════════════════════════════════════════
// Service Worker - Ma Pointeuse PWA
// Gère le cache et le fonctionnement hors-ligne
// ═══════════════════════════════════════════════════════

// Nom du cache - changer la version force un rechargement complet
var CACHE_NAME = 'pointeuse-v3';

// Fichiers essentiels à mettre en cache pour le fonctionnement offline
var URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// URLs externes (CDN) à mettre en cache au premier chargement
var CDN_URLS = [
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];

// ── INSTALL : mise en cache des fichiers essentiels ──
self.addEventListener('install', function(event) {
  console.log('[SW] Installation en cours...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Mise en cache des fichiers essentiels');
      // Cache les fichiers locaux (critique)
      return cache.addAll(URLS_TO_CACHE).then(function() {
        // Cache les CDN en best-effort (non bloquant si offline)
        return Promise.allSettled(
          CDN_URLS.map(function(url) {
            return fetch(url, { mode: 'cors' }).then(function(response) {
              if (response.ok) {
                return cache.put(url, response);
              }
            }).catch(function() {
              console.log('[SW] CDN non accessible (sera caché plus tard) :', url);
            });
          })
        );
      });
    }).then(function() {
      // Force l'activation immédiate du nouveau SW
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE : nettoyage des anciens caches ──
self.addEventListener('activate', function(event) {
  console.log('[SW] Activation...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          // Supprime tout cache qui n'est pas la version actuelle
          if (name !== CACHE_NAME) {
            console.log('[SW] Suppression ancien cache :', name);
            return caches.delete(name);
          }
        })
      );
    }).then(function() {
      // Prend le contrôle immédiat de toutes les pages
      return self.clients.claim();
    })
  );
});

// ── FETCH : stratégie Network-First avec fallback cache ──
// Pour les fichiers locaux : essaie le réseau d'abord, sinon le cache
// Pour les CDN : utilise le cache d'abord (plus rapide), réseau en backup
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Ignore les requêtes non-GET (POST, etc.)
  if (event.request.method !== 'GET') return;

  // Pour les polices Google Fonts (cache-first, elles changent rarement)
  if (url.indexOf('fonts.googleapis.com') !== -1 || url.indexOf('fonts.gstatic.com') !== -1) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(function() {
          // Offline et pas en cache — rien à faire
          return new Response('', { status: 503 });
        });
      })
    );
    return;
  }

  // Pour Chart.js CDN (cache-first)
  if (url.indexOf('cdnjs.cloudflare.com') !== -1) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Pour les fichiers locaux (network-first : pour récupérer les mises à jour)
  event.respondWith(
    fetch(event.request).then(function(response) {
      // Met à jour le cache avec la nouvelle version
      if (response.ok) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
      }
      return response;
    }).catch(function() {
      // Pas de réseau → sert depuis le cache
      return caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        // Fallback : si c'est une navigation, renvoie index.html
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
