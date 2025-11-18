document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault(); // Prevent the default form submission

    const form = event.target;
    const email = form.email.value;
    const password = form.password.value;
    const messageElement = document.getElementById('form-message');

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        const result = await response.json();

        if (response.ok) {
            // On successful login, redirect to the homepage
            window.location.href = '/';
        } else {
            messageElement.textContent = result.message;
        }

    } catch (error) {
        messageElement.textContent = 'An error occurred. Please try again.';
    }
});