document.getElementById('share-location-btn').addEventListener('click', () => {
    const messageElement = document.getElementById('form-message');

    if (!navigator.geolocation) {
        messageElement.textContent = 'Geolocation is not supported by your browser.';
        messageElement.style.color = 'red';
        return;
    }

    messageElement.textContent = 'Getting your location...';
    messageElement.style.color = 'black';

    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;

        try {
            const response = await fetch('/api/user/location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude, longitude })
            });

            const result = await response.json();
            messageElement.textContent = result.message;
            messageElement.style.color = response.ok ? 'green' : 'red';

        } catch (error) {
            messageElement.textContent = 'An error occurred while sending location to the server.';
            messageElement.style.color = 'red';
        }
    }, () => {
        messageElement.textContent = 'Unable to retrieve your location. Please enable location services in your browser.';
        messageElement.style.color = 'red';
    });
});