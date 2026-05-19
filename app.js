const SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
const CHAR_UUID = 'abcdefab-cdef-abcd-efab-cdefabcdefab';

let characteristic = null;
let isConnected = false;
let isArmed = false;
let device = null;
let scheduleStartTimer = null;
let scheduleEndTimer = null;
let notificationPermission = false;
let swRegistration = null;

const connectBtn = document.getElementById('connectBtn');
const armBtn = document.getElementById('armBtn');
const statusText = document.getElementById('statusText');
const statusBadge = document.getElementById('statusBadge');
const statusDot = document.getElementById('statusDot');
const mainTitle = document.getElementById('mainTitle');
const mainDescription = document.getElementById('mainDescription');
const connectionStat = document.getElementById('connectionStat');
const signalStat = document.getElementById('signalStat');
const statusStat = document.getElementById('statusStat');

console.log('Smart-Guard App gestartet');

// ===== SERVICE WORKER + NOTIFICATION =====
async function setupNotifications() {
    // Service Worker registrieren
    if ('serviceWorker' in navigator) {
        try {
            swRegistration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registriert!');
        } catch (e) {
            console.log('Service Worker Fehler:', e);
        }
    }

    // Berechtigung abfragen
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        notificationPermission = permission === 'granted';
        console.log('Notification Berechtigung:', permission);
    }
}
setupNotifications();

// ===== NOTIFICATION ANZEIGEN =====
async function showNotification(titel, body) {
    if (!notificationPermission) return;

    // Service Worker Notification (funktioniert auch im Hintergrund)
    if (swRegistration) {
        try {
            await swRegistration.showNotification(titel, {
                body: body,
                vibrate: [500, 200, 500, 200, 500],
                requireInteraction: true,
                tag: 'smart-guard-alarm'
            });
            console.log('Service Worker Notification gesendet!');
            return;
        } catch (e) {
            console.log('SW Notification fehlgeschlagen, fallback:', e);
        }
    }

    // Fallback: normale Notification
    new Notification(titel, {
        body: body,
        requireInteraction: true
    });
}

// ===== BLUETOOTH SUPPORT CHECK =====
function checkBluetoothSupport() {
    if (!navigator.bluetooth) {
        updateUI('error', {
            title: 'Bluetooth nicht verfügbar',
            description: 'Bitte öffne diese App in Chrome auf Android. iOS wird nicht unterstützt.',
            statusText: 'Nicht unterstützt',
            buttonText: 'Browser wechseln',
            buttonDisabled: true
        });
        return false;
    }
    return true;
}

// ===== UI UPDATE =====
function updateUI(state, data = {}) {
    statusBadge.classList.remove('connected', 'alarm', 'armed');
    statusDot.classList.remove('connected', 'alarm');
    connectBtn.classList.remove('connected', 'alarm');

    if (state === 'connected') {
        statusBadge.classList.add('connected');
        statusDot.classList.add('connected');
        connectBtn.classList.add('connected');
        armBtn.style.display = 'block';
    } else if (state === 'armed') {
        statusBadge.classList.add('armed');
        statusDot.classList.add('connected');
        connectBtn.classList.add('connected');
        armBtn.style.display = 'block';
    } else if (state === 'alarm') {
        statusBadge.classList.add('alarm');
        statusDot.classList.add('alarm');
        connectBtn.classList.add('alarm');
        armBtn.style.display = 'none';
    } else {
        armBtn.style.display = 'none';
    }

    if (data.statusText) statusText.textContent = data.statusText;
    if (data.title) mainTitle.textContent = data.title;
    if (data.description) mainDescription.textContent = data.description;
    if (data.buttonText) {
        connectBtn.querySelector('.button-content').innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M7 7L17 17L12 22V2L17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ${data.buttonText}
        `;
    }
    if (data.armText) {
        armBtn.querySelector('.button-content').innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L4 6V11C4 16.55 7.16 21.74 12 23C16.84 21.74 20 16.55 20 11V6L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ${data.armText}
        `;
    }
    if (typeof data.buttonDisabled !== 'undefined') connectBtn.disabled = data.buttonDisabled;
    if (data.connectionStat) connectionStat.textContent = data.connectionStat;
    if (data.signalStat) signalStat.textContent = data.signalStat;
    if (data.statusStat) statusStat.textContent = data.statusStat;
}

// ===== AKKUSTAND =====
function updateBattery(prozent) {
    const battEl = document.getElementById('batteryStat');
    if (!battEl) return;
    let emoji = prozent < 20 ? '🪫' : '🔋';
    battEl.textContent = emoji + ' ' + prozent + '%';
    battEl.style.color = prozent < 20 ? 'var(--danger)' : prozent < 50 ? 'var(--warning)' : 'var(--success)';
}

// ===== NACHRICHTEN VOM ESP32 =====
function handleEspNachricht(wert) {
    console.log('ESP32 sagt:', wert);
    if (wert === 'ALARM') {
        triggerAlarm();
    } else if (wert.startsWith('BAT:')) {
        const prozent = parseInt(wert.split(':')[1]);
        if (!isNaN(prozent)) updateBattery(prozent);
    }
}

// ===== VERBINDEN =====
connectBtn.addEventListener('click', async () => {
    if (!checkBluetoothSupport()) return;
    if (isConnected) {
        await disconnect();
        return;
    }
    await connectToDevice();
});

async function connectToDevice() {
    try {
        updateUI('connecting', {
            statusText: 'Suche Gerät...',
            title: 'Verbinde...',
            description: 'Bitte wähle "SMART_GUARD" aus der Liste aus.'
        });

        device = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'SMART_GUARD' }],
            optionalServices: [SERVICE_UUID]
        });

        device.addEventListener('gattserverdisconnected', onDisconnected);

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);
        characteristic = await service.getCharacteristic(CHAR_UUID);

        characteristic.addEventListener('characteristicvaluechanged', (e) => {
            const wert = new TextDecoder().decode(e.target.value);
            handleEspNachricht(wert);
        });
        await characteristic.startNotifications();

        isConnected = true;
        isArmed = false;

        updateUI('connected', {
            statusText: 'Verbunden',
            title: 'Schutz bereit',
            description: 'Verbunden! Drücke "Schutz aktivieren" um zu starten.',
            buttonText: 'Trennen',
            armText: 'Schutz aktivieren',
            connectionStat: 'BLE',
            signalStat: 'Stark',
            statusStat: 'Bereit'
        });

    } catch (error) {
        console.error('Fehler:', error);
        let errorMsg = 'Verbindung fehlgeschlagen';
        if (error.name === 'NotFoundError') errorMsg = 'Kein Gerät gewählt';
        else if (error.name === 'SecurityError') errorMsg = 'HTTPS erforderlich';
        updateUI('error', {
            statusText: 'Fehler',
            title: errorMsg,
            description: 'Stelle sicher dass Smart-Guard eingeschaltet ist.',
            buttonText: 'Erneut versuchen'
        });
    }
}

// ===== ARM BUTTON =====
armBtn.addEventListener('click', async () => {
    if (!characteristic) return;
    if (!isArmed) {
        await sendCommand('ARM');
        isArmed = true;
        updateUI('armed', {
            statusText: 'Aktiv',
            title: '🔒 Schutz aktiv',
            description: 'Rucksack wird überwacht. Alarm bei Bewegung.',
            armText: 'Schutz deaktivieren',
            statusStat: 'Aktiv'
        });
    } else {
        await sendCommand('STOP');
        isArmed = false;
        updateUI('connected', {
            statusText: 'Verbunden',
            title: 'Schutz bereit',
            description: 'Schutz deaktiviert.',
            armText: 'Schutz aktivieren',
            statusStat: 'Bereit'
        });
    }
});

// ===== BEFEHL SENDEN =====
async function sendCommand(cmd) {
    if (!characteristic) return;
    try {
        await characteristic.writeValue(new TextEncoder().encode(cmd));
        console.log('Gesendet:', cmd);
    } catch (e) {
        console.error('Senden fehlgeschlagen:', e);
    }
}

// ===== TRENNEN =====
async function disconnect() {
    try { await sendCommand('STOP'); } catch (e) { }
    if (device && device.gatt.connected) device.gatt.disconnect();
    onDisconnected();
}

function onDisconnected() {
    isConnected = false;
    isArmed = false;
    characteristic = null;
    updateUI('disconnected', {
        statusText: 'Getrennt',
        title: 'Bereit zum Verbinden',
        description: 'Verbinde dich mit deinem Smart-Guard Gerät.',
        buttonText: 'Gerät verbinden',
        connectionStat: '—',
        signalStat: '—',
        statusStat: 'Inaktiv'
    });
    const battEl = document.getElementById('batteryStat');
    if (battEl) { battEl.textContent = '—'; battEl.style.color = ''; }
}

// ===== ALARM =====
async function triggerAlarm() {
    console.log('ALARM AUSGELÖST!');

    // Handy vibrieren
    if (navigator.vibrate) {
        navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
    }

    // Notification über Service Worker
    await showNotification('🚨 Smart-Guard ALARM!', 'Dein Rucksack wurde bewegt!');

    updateUI('alarm', {
        statusText: 'ALARM!',
        title: '🚨 Alarm ausgelöst!',
        description: 'Dein Rucksack wurde bewegt! Drücke Ausschalten um den Alarm zu stoppen.',
        buttonText: 'Ausschalten',
        statusStat: '⚠️ ALARM'
    });

    connectBtn.onclick = async () => {
        await sendCommand('STOP');
        isArmed = false;
        connectBtn.onclick = null;
        if (navigator.vibrate) navigator.vibrate(0);
        updateUI('connected', {
            statusText: 'Verbunden',
            title: 'Schutz bereit',
            description: 'Alarm gestoppt.',
            buttonText: 'Trennen',
            armText: 'Schutz aktivieren',
            statusStat: 'Bereit'
        });
    };
}

// ===== ZEITPLAN =====
document.getElementById('showScheduleBtn').addEventListener('click', () => {
    document.getElementById('scheduleSection').classList.toggle('open');
});

document.getElementById('cancelScheduleBtn').addEventListener('click', () => {
    document.getElementById('scheduleSection').classList.remove('open');
    if (scheduleStartTimer) clearTimeout(scheduleStartTimer);
    if (scheduleEndTimer) clearTimeout(scheduleEndTimer);
    document.getElementById('scheduleStatus').textContent = '';
});

document.getElementById('scheduleBtn').addEventListener('click', () => {
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const scheduleStatus = document.getElementById('scheduleStatus');

    if (!startTime || !endTime) {
        scheduleStatus.textContent = 'Bitte beide Zeiten eingeben!';
        scheduleStatus.style.color = 'var(--danger)';
        return;
    }

    if (scheduleStartTimer) clearTimeout(scheduleStartTimer);
    if (scheduleEndTimer) clearTimeout(scheduleEndTimer);

    const now = new Date();
    const [startH, startM] = startTime.split(':');
    const start = new Date();
    start.setHours(parseInt(startH), parseInt(startM), 0, 0);
    const [endH, endM] = endTime.split(':');
    const end = new Date();
    end.setHours(parseInt(endH), parseInt(endM), 0, 0);

    if (start <= now) start.setDate(start.getDate() + 1);
    if (end <= now) end.setDate(end.getDate() + 1);

    scheduleStartTimer = setTimeout(async () => {
        await connectToDevice();
        setTimeout(async () => {
            if (isConnected) {
                await sendCommand('ARM');
                isArmed = true;
            }
        }, 3000);
    }, start - now);

    scheduleEndTimer = setTimeout(async () => {
        if (isConnected) await disconnect();
    }, end - now);

    const startStr = start.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
    const endStr = end.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
    scheduleStatus.style.color = 'var(--success)';
    scheduleStatus.textContent = `Geplant: ${startStr} bis ${endStr}`;
});

// ===== START =====
checkBluetoothSupport();
