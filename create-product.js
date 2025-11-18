document.getElementById('product-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const messageElement = document.getElementById('form-message');
    const form = event.target;
    const formData = new FormData(form);

    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            // Do NOT set Content-Type header. The browser will do it for you
            // with the correct boundary when sending FormData.
            body: formData,
        });

        const result = await response.json();
        messageElement.textContent = result.message;

        if (response.ok) {
            messageElement.style.color = 'green';
            // Redirect to home page on success
            window.location.href = '/';
        } else {
            messageElement.style.color = 'red';
        }
    } catch (error) {
        messageElement.textContent = 'An error occurred. Please try again.';
        messageElement.style.color = 'red';
    }
});