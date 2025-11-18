document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.getElementById('nav-links');

    /**
     * Checks the user's login status and updates the navigation bar.
     */
    const checkUserStatus = async () => {
        try {
            const response = await fetch('/api/user/status');
            const data = await response.json();

            if (data.loggedIn) {
                // User is logged in
                navLinks.innerHTML = `
                    <a href="/">Home</a>
                    <a href="/products.html">Products</a>
                    <a href="/create-product.html">Sell</a>
                    <a href="/inbox.html">Inbox</a>
                    <a href="/set-location.html">Location</a>
                    <a href="#" id="logout-btn">Logout</a>`;
                document.getElementById('logout-btn').addEventListener('click', handleLogout);
            } else {
                // User is not logged in
                navLinks.innerHTML = `
                    <a href="/">Home</a>
                    <a href="/products.html">Products</a>
                    <a href="/login.html">Login</a>
                    <a href="/register.html">Register</a>`;
            }
        } catch (error) {
            console.error('Error checking user status:', error);
        }
    };

    const handleLogout = async (event) => {
        event.preventDefault();
        try {
            await fetch('/api/logout', { method: 'POST' });
            window.location.reload(); // Reload the page to reflect logout state
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    // Initialize the navigation bar
    checkUserStatus();
});