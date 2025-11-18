const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws'); // Import WebSocket library
const app = express();
const port = process.env.PORT || 3000; // Use port from environment variable or default to 3000

// Load environment variables from .env file
require('dotenv').config();

// Middleware to parse JSON and URL-encoded form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// This tells Express to serve files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));
// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// --- Multer Setup for File Uploads ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/')); // The folder where images will be saved
  },
  filename: function (req, file, cb) {
    // Create a unique filename to avoid overwrites
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });


// --- Session Middleware Setup ---
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // Cookie expires after 1 day
  }
}));

// --- Database Connection ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Successfully connected to MongoDB Atlas!'))
  .catch(error => console.error('Error connecting to MongoDB:', error));

// --- User Schema and Model ---
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  location: {
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
    }
  }
});

const User = mongoose.model('User', userSchema);

// --- Product Schema and Model ---
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    imageUrl: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

// --- Message and Conversation Schemas ---
const messageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const conversationSchema = new mongoose.Schema({
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    messages: [messageSchema],
    lastUpdated: { type: Date, default: Date.now }
});

const Conversation = mongoose.model('Conversation', conversationSchema);

// Middleware to find conversation or create a new one


// --- Auth Middleware ---
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        return next();
    }
    res.status(401).json({ message: 'You must be logged in to perform this action.' });
};

// API route for user registration
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;

  // --- Input and Student Email Validation ---
  if (!email || !password || !email.endsWith('.edu')) {
    return res.status(400).json({ message: 'Registration failed. Please use a valid .edu student email.' });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: email });
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create and save the new user
    const newUser = new User({
      email: email,
      password: hashedPassword,
    });

    await newUser.save();

    // Automatically log the user in by creating a session
    req.session.userId = newUser._id;

    console.log(`New user saved to database: ${email}`);

    res.status(201).json({ message: `Successfully registered ${email}! You are now logged in.` });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration. Please try again later.' });
  }
});

// API route for user login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Please enter both email and password.' });
  }

  try {
    // Find user by email
    const user = await User.findOne({ email: email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials. Please check your email and password.' });
    }

    // Compare submitted password with the stored hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials. Please check your email and password.' });
    }

    // Create a session for the user
    req.session.userId = user._id;
    req.session.userEmail = user.email; // Add email to session for WebSocket logic

    res.status(200).json({ message: `Welcome back, ${user.email}!` });

  } catch (error) {
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// API route to create a new product
app.post('/api/products', isAuthenticated, upload.single('image'), async (req, res) => {
    const { name, description, price } = req.body;
    const imageUrl = req.file ? req.file.path.replace(/\\/g, "/") : null; // Get file path and normalize for web

    if (!name || !description || !price || isNaN(price)) {
        return res.status(400).json({ message: 'Please provide a valid name, description, and price.' });
    }

    if (!imageUrl) {
        return res.status(400).json({ message: 'An image is required to create a product.' });
    }

    try {
        const newProduct = new Product({
            name,
            description,
            price: Number(price),
            seller: req.session.userId, // Link the product to the logged-in user
            imageUrl: imageUrl
        });

        await newProduct.save();
        res.status(201).json({ message: 'Product created successfully!', product: newProduct });

    } catch (error) {
        console.error('Product creation error:', error);
        res.status(500).json({ message: 'Server error while creating product.' });
    }
});

// API route to get all products
app.get('/api/products', async (req, res) => {
    const { search, sort } = req.query;
    try {
        let filter = {};
        if (search) {
            // Use a case-insensitive regex to find products by name
            filter.name = { $regex: search, $options: 'i' };
        }

        let sortOptions = { createdAt: -1 }; // Default sort: newest first
        if (sort) {
            switch (sort) {
                case 'price-asc':
                    sortOptions = { price: 1 };
                    break;
                case 'price-desc':
                    sortOptions = { price: -1 };
                    break;
            }
        }

        // Find all products and populate the 'seller' field with their email
        const products = await Product.find(filter).populate('seller', 'email location').sort(sortOptions);
        res.status(200).json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Server error while fetching products.' });
    }
});

// API route to delete a product
app.delete('/api/products/:productId', isAuthenticated, async (req, res) => {
    try {
        const { productId } = req.params;
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        // Security Check: Ensure the logged-in user is the seller
        if (product.seller.toString() !== req.session.userId) {
            return res.status(403).json({ message: 'You are not authorized to delete this product.' });
        }

        // Delete the image file from the server
        if (product.imageUrl) {
            fs.unlink(product.imageUrl, (err) => {
                if (err) {
                    // Log the error but don't block the response, as the DB entry is more critical
                    console.error('Failed to delete product image:', err);
                }
            });
        }

        await Product.findByIdAndDelete(productId);

        res.status(200).json({ message: 'Product deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting product.' });
    }
});

// API route to send a message (starts a new conversation or adds to existing)
app.post('/api/messages', isAuthenticated, async (req, res) => {
    const { productId, messageBody } = req.body;
    const senderId = req.session.userId;

    if (!productId || !messageBody) {
        return res.status(400).json({ message: 'Product ID and message body are required.' });
    }

    try {
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        const recipientId = product.seller;

        if (senderId === recipientId.toString()) {
            return res.status(400).json({ message: 'You cannot send a message to yourself.' });
        }

        // Find existing conversation or create a new one
        let conversation = await Conversation.findOneAndUpdate(
            { product: productId, participants: { $all: [senderId, recipientId] } },
            { $set: { lastUpdated: Date.now() } }, // Update timestamp if found
            { new: true }
        );

        if (!conversation) {
            conversation = new Conversation({
                product: productId,
                participants: [senderId, recipientId],
                messages: []
            });
        }

        const message = { sender: senderId, body: messageBody };
        conversation.messages.push(message);
        await conversation.save();

        // --- WebSocket Real-time Logic ---
        // Find the recipient to send the live message
        const recipientUser = conversation.participants.find(p => !p.equals(senderId));
        const recipientSocket = clients.get(recipientUser.toString());

        if (recipientSocket && recipientSocket.readyState === WebSocket.OPEN) {
            // We need to populate the sender's email for the frontend
            const populatedMessage = {
                ...message.toObject(),
                sender: { _id: senderId, email: req.session.userEmail }
            };

            recipientSocket.send(JSON.stringify({
                type: 'newMessage',
                data: { conversationId: conversation._id, message: populatedMessage }
            }));
        }
        // --- End WebSocket Logic ---

        res.status(201).json({ message: 'Message sent successfully!', conversation });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ message: 'Server error while sending message.' });
    }
});

// API route to get all conversations for the logged-in user
app.get('/api/conversations', isAuthenticated, async (req, res) => {
    const conversations = await Conversation.find({ participants: req.session.userId })
        .populate('participants', 'email')
        .populate('product', 'name imageUrl')
        .sort({ lastUpdated: -1 });
    res.json(conversations);
});

// API route to get a single conversation by ID
app.get('/api/conversations/:conversationId', isAuthenticated, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const conversation = await Conversation.findById(conversationId)
            .populate('participants', 'email')
            .populate('product', 'name imageUrl')
            .populate('messages.sender', 'email');

        // Security check: ensure user is part of the conversation
        if (!conversation || !conversation.participants.some(p => p._id.equals(req.session.userId))) {
            return res.status(404).json({ message: 'Conversation not found or you are not a participant.' });
        }

        res.json(conversation);
    } catch (error) {
        res.status(500).json({ message: 'Server error while fetching conversation.' });
    }
});

// API route to reply to a conversation
app.post('/api/conversations/:conversationId/messages', isAuthenticated, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { messageBody } = req.body;
        const senderId = req.session.userId;

        const conversation = await Conversation.findById(conversationId);

        if (!conversation || !conversation.participants.some(p => p.equals(senderId))) {
            return res.status(404).json({ message: 'Conversation not found or you are not a participant.' });
        }

        conversation.messages.push({ sender: senderId, body: messageBody });
        conversation.lastUpdated = Date.now();
        await conversation.save();

        // --- WebSocket Real-time Logic ---
        const recipientId = conversation.participants.find(p => !p.equals(senderId));
        const recipientSocket = clients.get(recipientId.toString());

        if (recipientSocket && recipientSocket.readyState === WebSocket.OPEN) {
            const populatedMessage = {
                sender: { _id: senderId, email: req.session.userEmail },
                body: messageBody,
                timestamp: new Date()
            };

            recipientSocket.send(JSON.stringify({
                type: 'newMessage',
                data: { conversationId: conversation._id, message: populatedMessage }
            }));
        }
        // --- End WebSocket Logic ---

        res.status(201).json({ message: 'Reply sent successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while sending reply.' });
    }
});

// API route for user to update their location
app.post('/api/user/location', isAuthenticated, async (req, res) => {
    const { latitude, longitude } = req.body;

    if (latitude == null || longitude == null) {
        return res.status(400).json({ message: 'Invalid location data provided.' });
    }

    try {
        await User.findByIdAndUpdate(req.session.userId, {
            location: {
                type: 'Point',
                coordinates: [longitude, latitude] // GeoJSON format is [longitude, latitude]
            }
        });
        res.status(200).json({ message: 'Your location has been updated successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while updating location.' });
    }
});

// API route to check user's login status
app.get('/api/user/status', async (req, res) => {
  if (req.session.userId) {
    // Find user in DB to make sure they still exist
    const user = await User.findById(req.session.userId).select('-password');
    if (user) {
      return res.status(200).json({ loggedIn: true, user: user });
    }
  }
  res.status(200).json({ loggedIn: false });
});

// API route for user logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ message: 'Could not log out, please try again.' });
    }
    res.status(200).json({ message: 'You have been logged out.' });
  });
});

const server = app.listen(port, () => {
  console.log(`Campus Cart server listening at http://localhost:${port}`);
});

// --- WebSocket Server Setup for Real-time Chat ---
const wss = new WebSocketServer({ server });

// Store connections to map userId to their WebSocket connection
const clients = new Map();

wss.on('connection', (ws, req) => {
    // When a message is received from the client, we expect it to be an auth message
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'auth' && data.userId) {
                clients.set(data.userId, ws); // Map the userId to their WebSocket connection
                console.log(`Client authenticated and mapped for userId: ${data.userId}`);
            }
        } catch (e) { console.error("Failed to parse auth message from client"); }
    });

    ws.on('close', () => {
        // Remove user from clients map on disconnect
        for (let [userId, clientWs] of clients.entries()) {
            if (clientWs === ws) {
                clients.delete(userId);
                break;
            }
        }
    });

    ws.on('error', console.error);
});

console.log('WebSocket server is running.');