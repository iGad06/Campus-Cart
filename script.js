document.addEventListener('DOMContentLoaded', async () => {
    const nav = document.querySelector('nav');

    try {
        const response = await fetch('/api/user/status');
        // Storing user data in a variable accessible within the scope
        const userData = await response.json();

        if (userData.loggedIn) {
            // User is logged in, show their email and a logout button
            document.getElementById('login-link').remove();
            document.getElementById('register-link').remove();

            const emailDisplay = document.createElement('span');
            emailDisplay.textContent = userData.user.email;
            emailDisplay.style.color = 'white';
            emailDisplay.style.marginRight = '1rem';

            const sellLink = document.createElement('a');
            sellLink.href = '/create-product.html';
            sellLink.textContent = 'Sell Product';
            sellLink.style.marginRight = '1rem';

            const locationLink = document.createElement('a');
            locationLink.href = '/set-location.html';
            locationLink.textContent = 'Set Location';
            locationLink.style.marginRight = '1rem';

            const inboxLink = document.createElement('a');
            inboxLink.href = '/inbox.html';
            inboxLink.textContent = 'Inbox';
            inboxLink.style.marginRight = '1rem';

            const logoutButton = document.createElement('a');
            logoutButton.href = '#';
            logoutButton.textContent = 'Logout';
            logoutButton.onclick = async () => {
                await fetch('/api/logout', { method: 'POST' });
                window.location.reload(); // Reload the page to update state
            };

            nav.appendChild(inboxLink);
            nav.appendChild(locationLink);
            nav.appendChild(sellLink);
            nav.appendChild(emailDisplay);
            nav.appendChild(logoutButton);

            // Load products and pass user data to show owner-specific controls
            loadProducts(userData.user, '');
        } else {
            // If not logged in, load products without user data
            loadProducts(null, '');
        }

        // Set up search form listener after user status is known
        const searchForm = document.getElementById('search-form');
        searchForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const searchInput = document.getElementById('search-input');
            loadProducts(userData.loggedIn ? userData.user : null, searchInput.value);
        });

    } catch (error) {
        console.error('Error checking login status:', error);
        loadProducts(null, ''); // Still load products even if status check fails
    }
});

async function loadProducts(currentUser, searchTerm) {
    const productListings = document.getElementById('product-listings');
    if (!productListings) return;

    // Clear previous listings
    productListings.innerHTML = '<p>Loading products...</p>';

    try {
        const response = await fetch(`/api/products?search=${encodeURIComponent(searchTerm)}`);
        const products = await response.json();

        if (products.length === 0) {
            productListings.innerHTML = '<p>No products have been listed yet. Be the first!</p>';
            return;
        }

        // Clear the loading message before adding products
        productListings.innerHTML = '';

        products.forEach(product => {
            const productCard = document.createElement('div');
            productCard.className = 'product-card';
            // Use a more structured HTML layout and classes instead of inline styles
            productCard.innerHTML = `
                <div class="product-card-img-container">
                    <img class="product-card-img" src="${product.imageUrl}" alt="${product.name}">
                </div>
                <div class="product-card-content">
                    <h3 class="product-card-title">${product.name}</h3>
                    <p class="product-card-description">${product.description}</p>
                    <div class="product-card-footer">
                        <p class="price">$${product.price.toFixed(2)}</p>
                        <p class="seller">By ${product.seller.email}</p>
                    </div>
                </div>
            `;

            if (product.seller.location && product.seller.location.coordinates) {
                const mapButton = document.createElement('button');
                mapButton.className = 'map-button'; // Add a class for styling
                mapButton.textContent = 'Show on Map';
                mapButton.onclick = () => {
                    showMapModal(product.seller.location.coordinates, product.seller.email);
                };
                productCard.querySelector('.product-card-content').appendChild(mapButton);
            }

            // Add "Contact Seller" button if the user is logged in and not the seller
            if (currentUser && product.seller._id !== currentUser._id) {
                const contactButton = document.createElement('button');
                contactButton.className = 'contact-button'; // Style this button
                contactButton.textContent = 'Contact Seller';
                contactButton.onclick = async () => {
                    const message = prompt(`Your message to the seller of "${product.name}":`);
                    if (message) {
                        const res = await fetch('/api/messages', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                productId: product._id,
                                messageBody: message
                            })
                        });
                        const result = await res.json();
                        alert(result.message);
                        if(res.ok) window.location.href = '/inbox.html';
                    }
                };
                productCard.querySelector('.product-card-content').appendChild(contactButton);
            }

            // Check if the current user is the seller of this product
            if (currentUser && product.seller._id === currentUser._id) {
                const deleteButton = document.createElement('button');
                deleteButton.className = 'delete-button';
                deleteButton.textContent = 'Delete My Product';
                deleteButton.onclick = async () => {
                    if (confirm('Are you sure you want to delete this product?')) {
                        const res = await fetch(`/api/products/${product._id}`, {
                            method: 'DELETE',
                        });
                        if (res.ok) {
                            // Remove the card from the view on successful deletion
                            productCard.remove();
                        } else {
                            const result = await res.json();
                            alert(`Error: ${result.message}`);
                        }
                    }
                };
                productCard.querySelector('.product-card-content').appendChild(deleteButton);
            }

            productListings.appendChild(productCard);
        });
    } catch (error) {
        console.error('Error loading products:', error);
        productListings.innerHTML = '<p>Could not load products at this time.</p>';
    }
}

function showMapModal(coordinates, sellerEmail) {
    // GeoJSON stores as [longitude, latitude], Leaflet expects [latitude, longitude]
    const [longitude, latitude] = coordinates;

    // Create modal elements
    const overlay = document.createElement('div');
    overlay.className = 'map-modal-overlay';

    const modalContent = document.createElement('div');
    modalContent.className = 'map-modal-content';
    modalContent.innerHTML = `
        <span class="map-modal-close">&times;</span>
        <div id="map"></div>
    `;

    overlay.appendChild(modalContent);
    document.body.appendChild(overlay);

    // Initialize map
    const map = L.map('map').setView([latitude, longitude], 15);

    // Add tile layer from OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Add a marker for the seller's location
    L.marker([latitude, longitude]).addTo(map)
        .bindPopup(`Location of seller: ${sellerEmail}`)
        .openPopup();

    // Add close functionality
    modalContent.querySelector('.map-modal-close').onclick = () => {
        document.body.removeChild(overlay);
    };
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    };
}