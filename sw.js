// Service Worker für Smart-Guard Push Notifications
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ALARM') {
        self.registration.showNotification('🚨 Smart-Guard ALARM!', {
            body: 'Dein Rucksack wurde bewegt!',
            icon: '/icon.png',
            badge: '/icon.png',
            vibrate: [500, 200, 500, 200, 500],
            requireInteraction: true,
            tag: 'smart-guard-alarm'
        });
    }
});
