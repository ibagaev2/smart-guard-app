const SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
const CHAR_UUID = 'abcdefab-cdef-abcd-efab-cdefabcdefab';

let characteristic = null;
let isConnected = false;
let device = null;

const connectBtn = document.getElementById('connectBtn');
const statusText = document.getElementById('statusText');
const statusBadge = document.getElementById('statusBadge');
const statusDot = document.getElementById('statusDot');
const mainTitle = document.getElementById('mainTitle');
const mainDescription = document.getElementById('mainDescription');
const connectionStat = document.getElementById('connectionStat');
const signalStat = document.getElementById('signalStat');
const statusStat = document.getElementById('statusStat');

console.log('Smart-Guard App gestartet');

function checkBluetoothSupport() {
    if (!navigator.bluetooth) {
        updateUI('error', {
            title: 'Bluetooth nicht verfügbar',
            description: 'Bitte öffne diese App in Chrome oder Edge auf Android. iOS und Firefox werden leider nicht unterstützt.',
            statusText: 'Nicht unterstützt',
            buttonText: 'Browser wechseln',
            buttonDisabled: true
        });
        return false;
    }
    return true;
}

function updateUI(state, data = {}) {
    statusBadge.classList.remove('connected', 'alarm');
    statusDot.classList.remove('connected', 'alarm');
    connectBtn.classList.remove('connected', 'alarm');

    if (state === 'connected') {
        statusBadge.classList.add('connected');
        statusDot.classList.add('connected');
        connectBtn.classList.add('connected');
    } else if (state === 'alarm') {
        statusBadge.classList.add('alarm');
        statusDot.classList.add('alarm');
        connectBtn.classList.add('alarm');
    }

    if (data.statusText) statusText.textContent = data.statusText;
    if (data.title) mainTitle.textContent = data.title;
    if (data.description) mainDescription.textContent = data.description;
    if (data.buttonText) {
        connectBtn.querySelector('.button-content').innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 7L17 17L12 22V2L17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ${data.buttonText}
        `;
    }
    if (typeof data.buttonDisabled !== 'undefined') {
        connectBtn.disabled = data.buttonDisabled;
    }
    if (data.connectionStat) connectionStat.textContent = data.connectionStat;
    if (data.signalStat) signalStat.textContent = data.signalStat;
    if (data.statusStat) statusStat.textContent = data.statusStat;
}

connectBtn.addEventListener('click', async () => {
    if (!checkBluetoothSupport()) return;

    if (isConnected) {
        await disconnect();
        return;
    }

    try {
        updateUI('connecting', {
            statusText: 'Suche Gerät...',
            title: 'Verbinde...',
            description: 'Bitte wähle "SMART_GUARD" aus der Liste aus.'
        });

        console.log('Suche nach SMART_GUARD...');

        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [SERVICE_UUID]
        });

        console.log('Gerät gefunden:', device.name);

        device.addEventListener('gattserverdisconnected', onDisconnected);

        updateUI('connecting', {
            statusText: 'Verbinde...',
            title: 'Stelle Verbindung her...'
        });

        const server = await device.gatt.connect();
        console.log('GATT-Server verbunden');

        const service = await server.getPrimaryService(SERVICE_UUID);
        console.log('Service gefunden');

        characteristic = await service.getCharacteristic(CHAR_UUID);
        console.log('Characteristic gefunden');

        isConnected = true;

        updateUI('connected', {
            statusText: 'Verbunden',
            title: 'Schutz bereit',
            description: 'Dein Smart-Guard ist verbunden. Aktiviere den Diebstahlschutz wann immer du möchtest.',
            buttonText: 'Trennen',
            connectionStat: 'Aktiv',
            signalStat: 'Stark',
            statusStat: 'Bereit'
        });

    } catch (error) {
        console.error('Verbindungsfehler:', error);

        let errorMsg = 'Verbindung fehlgeschlagen';
        if (error.name === 'NotFoundError') {
            errorMsg = 'Kein Gerät gewählt';
        } else if (error.name === 'SecurityError') {
            errorMsg = 'HTTPS oder localhost erforderlich';
        }

        updateUI('error', {
            statusText: 'Fehler',
            title: errorMsg,
            description: 'Stelle sicher dass dein Smart-Guard eingeschaltet und in Reichweite ist.',
            buttonText: 'Erneut versuchen'
        });
    }
});

async function disconnect() {
    if (device && device.gatt.connected) {
        device.gatt.disconnect();
    }
    onDisconnected();
}

function onDisconnected() {
    console.log('Verbindung getrennt');
    isConnected = false;
    characteristic = null;

    updateUI('disconnected', {
        statusText: 'Getrennt',
        title: 'Bereit zum Verbinden',
        description: 'Verbinde dich mit deinem Smart-Guard Gerät um den Diebstahlschutz zu aktivieren.',
        buttonText: 'Gerät verbinden',
        connectionStat: '—',
        signalStat: '—',
        statusStat: 'Inaktiv'
    });
}

checkBluetoothSupport();
