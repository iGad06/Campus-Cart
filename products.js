document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.getElementById('nav-links');
    const productListings = document.getElementById('product-listings');
    const searchForm = document.getElementById('search-form');
    let currentUser = null;

    /**
     * Checks user status and updates the navigation bar.
     */
    const checkUserStatus = async () => {
        try {
            const response = await fetch('/api/user/status');
            const data = await response.json();

            if (data.loggedIn) {
                currentUser = data.user;
                navLinks.innerHTML = `
                    <a href="/">Home</a>
                    <a href="/products.html">Products</a>
                    <a href="/create-product.html">Sell</a>
                    <a href="/inbox.html">Inbox</a>
                    <a href="/set-location.html">Location</a>
                    <a href="#" id="logout-btn">Logout</a>`;
                document.getElementById('logout-btn').addEventListener('click', handleLogout);
            } else {
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

    /**
     * Fetches and displays products.
     */
    const loadProducts = async (searchTerm = '') => {
        productListings.innerHTML = '<p>Loading products...</p>';
        try {
            const url = searchTerm ? `/api/products?search=${encodeURIComponent(searchTerm)}` : '/api/products';
            const response = await fetch(url);
            const products = await response.json();

            if (products.length === 0) {
                productListings.innerHTML = '<p>No products found. Try a different search or check back later!</p>';
                return;
            }

            productListings.innerHTML = ''; // Clear loading message
            products.forEach(product => {
                const productCard = document.createElement('div');
                productCard.className = 'product-card';

                let buttonsHtml = '';
                if (currentUser) {
                    if (currentUser._id === product.seller._id) {
                        buttonsHtml += `<button class="delete-button" data-product-id="${product._id}">Delete</button>`;
                    } else {
                        buttonsHtml += `<button class="contact-button" data-product-id="${product._id}" data-product-name="${product.name}">Contact Seller</button>`;
                    }
                }
                if (product.seller.location && product.seller.location.coordinates) {
                    const [longitude, latitude] = product.seller.location.coordinates;
                    buttonsHtml += `<button class="map-button" data-lat="${latitude}" data-lon="${longitude}" data-seller-email="${product.seller.email}">Show Map</button>`;
                }

                productCard.innerHTML = `
                    <div class="product-card-img-container"><img class="product-card-img" src="/${product.imageUrl}" alt="${product.name}"></div>
                    <div class="product-card-content">
                        <h3 class="product-card-title">${product.name}</h3>
                        <div class="product-card-footer">
                            <p class="price">$${product.price.toFixed(2)}</p>
                            <p class="seller">By ${product.seller.email}</p>
                        </div>
                        <div class="product-card-buttons">${buttonsHtml}</div>
                    </div>`;
                productListings.appendChild(productCard);
            });
        } catch (error) {
            console.error('Error loading products:', error);
            productListings.innerHTML = '<p>Could not load products. Please try again later.</p>';
        }
    };

    const handleLogout = async (event) => {
        event.preventDefault();
        await fetch('/api/logout', { method: 'POST' });
        window.location.reload();
    };

    const handleDeleteProduct = async (productId, buttonElement) => {
        if (!confirm('Are you sure you want to delete this product?')) return;
        const response = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
        if (response.ok) {
            buttonElement.closest('.product-card').remove();
        } else {
            const result = await response.json();
            alert(`Error: ${result.message}`);
        }
    };

    const handleContactSeller = async (productId, productName) => {
        const messageBody = prompt(`Enter your message to the seller of "${productName}":`);
        if (!messageBody) return;
        const response = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, messageBody }),
        });
        const result = await response.json();
        alert(result.message);
        if (response.ok) window.location.href = '/inbox.html';
    };

    const showMapModal = (latitude, longitude, sellerEmail) => {
        const overlay = document.createElement('div');
        overlay.className = 'map-modal-overlay';
        overlay.innerHTML = `
            <div class="map-modal-content">
                <span class="map-modal-close">&times;</span>
                <h3>Seller Location</h3>
                <div id="map-container"></div>
            </div>`;
        document.body.appendChild(overlay);

        const map = L.map('map-container').setView([latitude, longitude], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        L.marker([latitude, longitude]).addTo(map).bindPopup(`Approximate location of ${sellerEmail}`).openPopup();

        const closeModal = () => document.body.removeChild(overlay);
        overlay.querySelector('.map-modal-close').onclick = closeModal;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    };

    // --- Event Listeners ---
    searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        loadProducts(document.getElementById('search-input').value);
    });

    productListings.addEventListener('click', (event) => {
        const target = event.target;
        if (target.classList.contains('delete-button')) {
            handleDeleteProduct(target.dataset.productId, target);
        } else if (target.classList.contains('contact-button')) {
            handleContactSeller(target.dataset.productId, target.dataset.productName);
        } else if (target.classList.contains('map-button')) {
            const { lat, lon, sellerEmail } = target.dataset;
            showMapModal(parseFloat(lat), parseFloat(lon), sellerEmail);
        }
    });

    /**
     * Initialize the page.
     */
    const initializePage = async () => {
        await checkUserStatus();
        await loadProducts();
    };

    initializePage();
});