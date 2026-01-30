const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const bodyParser = require("body-parser");
const netsQr= require("./services/nets");
const axios = require('axios');

//variables in the .env file will be available in process.env
require('dotenv').config();

// Initialize Stripe only if secret key is available
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    const stripeModule = require('stripe');
    stripe = stripeModule(process.env.STRIPE_SECRET_KEY);
}

// Initialize PayPal SDK if credentials are available
const paypal = require('@paypal/checkout-server-sdk');
let paypalClient = null;
if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    const Environment = process.env.NODE_ENV === 'production'
        ? paypal.core.LiveEnvironment
        : paypal.core.SandboxEnvironment;
    const paypalEnv = new Environment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET);
    paypalClient = new paypal.core.PayPalHttpClient(paypalEnv);
}

const app = express();

// Import controllers
const productController = require('./controllers/productController');
const userController = require('./controllers/userController');
const wishlistController = require('./controllers/wishlistController');

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        // Generate shorter filename using timestamp + sanitized original name
        const timestamp = Date.now();
        const ext = file.originalname.split('.').pop();
        // Get base name without extension and limit to 50 characters
        const baseName = file.originalname.replace(/\.[^/.]+$/, '').substring(0, 50);
        // Create filename: timestamp-basename.ext (max ~65 chars)
        const filename = `${timestamp}-${baseName}.${ext}`;
        cb(null, filename);
    }
});

const upload = multer({ storage: storage });

// Set up view engine
app.set('view engine', 'ejs');
//  enable static files
app.use(express.static('public'));
// enable form processing
app.use(express.urlencoded({
    extended: false
}));
app.use(bodyParser.json());

//TO DO: Insert code for Session Middleware below 
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    // Session expires after 1 week of inactivity
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } 
}));

app.use(flash());

// expose flash messages and current user to all views
app.use((req, res, next) => {
    // Provide flash messages as arrays expected by views
    res.locals.messages = req.flash('success') || [];
    res.locals.errors = req.flash('error') || [];
    res.locals.info = req.flash('info') || [];
    res.locals.user = req.session ? req.session.user : null;
    next();
});

// Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/shopping');
    }
};

// Middleware for form validation
const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;

    if (!username || !email || !password || !address || !contact || !role) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// Define routes
app.post('/generateNETSQR', netsQr.generateQrCode);
app.get("/nets-qr/success", (req, res) => {
    res.render('netsTxnSuccessStatus', { message: 'Transaction Successful!' });
});
app.get("/nets-payment-success", checkAuthenticated, (req, res, next) => {
    // Place the order after successful payment
    return productController.checkout(req, res, next);
});
app.get("/nets-qr/fail", (req, res) => {
    res.render('netsTxnFailStatus', { message: 'Transaction Failed. Please try again.' });
});

//errors
app.get('/401', (req, res) => {
    res.render('401', { errors: req.flash('error') });
});

//Endpoint in your backend which is a Server-Sent Events (SSE) endpoint that allows your frontend (browser) 
//to receive real-time updates about the payment status of a NETS QR transaction.
app.get('/sse/payment-status/:txnRetrievalRef', async (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const txnRetrievalRef = req.params.txnRetrievalRef;
    let pollCount = 0;
    const maxPolls = 60; // 5 minutes if polling every 5s
    let frontendTimeoutStatus = 0;

    const interval = setInterval(async () => {
        pollCount++;

        try {
            // Call the NETS query API
            const response = await axios.post(
                'https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/query',
                { txn_retrieval_ref: txnRetrievalRef, frontend_timeout_status: frontendTimeoutStatus },
                {
                    headers: {
                        'api-key': process.env.API_KEY,
                        'project-id': process.env.PROJECT_ID,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log("Polling response:", response.data);
            // Send the full response to the frontend
            res.write(`data: ${JSON.stringify(response.data)}\n\n`);
        
          const resData = response.data.result.data;

            // Decide when to end polling and close the connection
            //Check if payment is successful
            if (resData.response_code == "00" && resData.txn_status === 1) {
                // Payment success: send a success message
                res.write(`data: ${JSON.stringify({ success: true })}\n\n`);
                clearInterval(interval);
                res.end();
            } else if (frontendTimeoutStatus == 1 && resData && (resData.response_code !== "00" || resData.txn_status === 2)) {
                // Payment failure: send a fail message
                res.write(`data: ${JSON.stringify({ fail: true, ...resData })}\n\n`);
                clearInterval(interval);
                res.end();
            }

        } catch (err) {
            clearInterval(interval);
            res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            res.end();
        }


        // Timeout
        if (pollCount >= maxPolls) {
            clearInterval(interval);
            frontendTimeoutStatus = 1;
            res.write(`data: ${JSON.stringify({ fail: true, error: "Timeout" })}\n\n`);
            res.end();
        }
    }, 5000);

    req.on('close', () => {
        clearInterval(interval);
    });
});

app.get('/',  (req, res) => {
    res.render('index', {user: req.session.user} );
});

// Demo page for new features (BNPL & Currency)
app.get('/demo-features', (req, res) => {
    res.render('demo-features', { user: req.session.user });
});

// Products routes (use controller)
app.get('/products', (req, res, next) => {
    return productController.getAllProducts(req, res, next);
});

app.get('/products/:id', checkAuthenticated, (req, res, next) => {
    return productController.getProductById(req, res, next);
});

app.post('/products/add', checkAuthenticated, checkAdmin, upload.single('image'), (req, res, next) => {
    // controller should handle request.body and req.file
    return productController.addProduct(req, res, next);
});

app.post('/products/update/:id', checkAuthenticated, checkAdmin, upload.single('image'), (req, res, next) => {
    return productController.updateProduct(req, res, next);
});

app.get('/products/delete/:id', checkAuthenticated, checkAdmin, (req, res, next) => {
    return productController.deleteProduct(req, res, next);
});

// Admin inventory view - render via controller (reuse product listing)
app.get('/inventory', checkAuthenticated, checkAdmin, (req, res, next) => {
    return productController.getAllProducts(req, res, next);
});

// NEW: Admin dashboard - shows stats and navigation
app.get('/dashboard', checkAuthenticated, checkAdmin, (req, res, next) => {
    const productModel = require('./models/productModel');
    const userModel = require('./models/userModel');
    
    // Fetch stats for dashboard
    productModel.getAllProducts((err, products) => {
        if (err) return next(err);
        
        userModel.getAllUsers((err2, users) => {
            if (err2) return next(err2);
            
            const stats = {
                totalProducts: products.length,
                lowStockCount: products.filter(p => parseInt(p.quantity, 10) < 5).length,
                totalUsers: users.length,
                adminCount: users.filter(u => u.role === 'admin').length
            };
            
            res.render('dashboard', { user: req.session.user, stats });
        });
    });
});

// Render add product form (no DB access needed here)
app.get('/addProduct', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addProduct', {user: req.session.user } ); 
});

// Add: handle form POST from /addProduct (match form action)
app.post('/addProduct', checkAuthenticated, checkAdmin, upload.single('image'), (req, res, next) => {
    return productController.addProduct(req, res, next);
});

// Render update product form - delegate to controller (controller may render the specific view)
app.get('/products/update/:id', checkAuthenticated, checkAdmin, (req, res, next) => {
    return productController.getProductById(req, res, next);
});

// NEW: Toggle product visibility (admin only) - MUST be before generic product routes
app.post('/toggleVisibility/:id', checkAuthenticated, checkAdmin, (req, res, next) => {
    return productController.toggleVisibility(req, res, next);
});

// Users routes (use controller)
app.get('/users', checkAuthenticated, checkAdmin, (req, res, next) => {
    return userController.getAllUsers(req, res, next);
});

app.get('/users/:id', checkAuthenticated, (req, res, next) => {
    return userController.getUserById(req, res, next);
});

// NEW: Render user edit form
app.get('/users/edit/:id', checkAuthenticated, checkAdmin, (req, res, next) => {
    const userModel = require('./models/userModel');
    userModel.getUserById(req.params.id, (err, result) => {
        if (err) return next(err);
        const userData = Array.isArray(result) ? result[0] : result;
        if (!userData) return res.status(404).send('User not found');
        res.render('users/edit', { userData, user: req.session.user });
    });
});

app.post('/users/add', upload.single('image'), validateRegistration, (req, res, next) => {
    return userController.addUser(req, res, next);
});

app.post('/users/update/:id', checkAuthenticated, checkAdmin, upload.single('image'), (req, res, next) => {
    return userController.updateUser(req, res, next);
});

// NEW: Promote user to admin
app.post('/users/promote/:id', checkAuthenticated, checkAdmin, (req, res, next) => {
    return userController.promoteToAdmin(req, res, next);
});

// NEW: Demote admin to user
app.post('/users/demote/:id', checkAuthenticated, checkAdmin, (req, res, next) => {
    return userController.demoteToUser(req, res, next);
});

app.get('/users/delete/:id', checkAuthenticated, checkAdmin, (req, res, next) => {
    return userController.deleteUser(req, res, next);
});

// Registration and login views/routes (delegate processing to userController)
app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

// keep the register POST but route to controller
app.post('/register', validateRegistration, (req, res, next) => {
    // delegate actual user creation to controller
    return userController.addUser(req, res, next);
});

app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});

app.post('/login', (req, res, next) => {
    // delegate authentication to controller
    return userController.login(req, res, next);
});

// Redirect to dashboard after successful admin login
app.use((req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin' && req.path === '/') {
        return res.redirect('/dashboard');
    }
    next();
});

// Shopping list - reuse product controller for listing available products
app.get('/shopping', checkAuthenticated, (req, res, next) => {
    return productController.getAllProducts(req, res, next);
});

// Cart and add-to-cart: cart is stored in session; product retrieval should be handled by controller.
// Here we delegate product fetching to controller via a helper route, then manage session cart in controller or via dedicated endpoints.
// For now we forward to controller that can handle adding to cart (controller should implement addToCart).
app.post('/add-to-cart/:id', checkAuthenticated, (req, res, next) => {
    // delegate to product controller; controller is expected to handle adding to session cart and redirecting
    if (typeof productController.addToCart === 'function') {
        return productController.addToCart(req, res, next);
    } else {
        // Fallback: fetch product details and add to cart with correct price
        const productId = parseInt(req.params.id);
        const quantity = parseInt(req.body.quantity) || 1;
        // Use your product model to fetch product details
        const productModel = require('./models/productModel');
        productModel.getProductById(productId, (err, results) => {
            if (err || !results || results.length === 0) {
                req.flash('error', 'Product not found');
                return res.redirect('/shopping');
            }
            const product = Array.isArray(results) ? results[0] : results;
            if (!req.session.cart) req.session.cart = [];
            const existingItem = req.session.cart.find(item => item.productId === productId);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                req.session.cart.push({
                    productId: product.id,
                    productName: product.productName,
                    price: parseFloat(product.price) || 0,
                    quantity: quantity,
                    image: product.image
                });
            }
            return res.redirect('/cart');
        });
    }
});

app.get('/cart', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    // Calculate total and item totals safely
    cart.forEach(item => {
        item.price = parseFloat(item.price) || 0;
        item.quantity = parseInt(item.quantity) || 0;
        item.total = item.price * item.quantity;
    });
    const total = cart.reduce((sum, item) => sum + item.total, 0);
    res.render('cart', { cart, user: req.session.user, total });
});

// NEW: cart management endpoints
app.post('/cart/add/:id', checkAuthenticated, (req, res, next) => {
    // delegate adding to cart to controller
    return productController.addToCart(req, res, next);
});

app.post('/cart/update', checkAuthenticated, (req, res, next) => {
    // expects body: productId, quantity
    return productController.updateCartItem(req, res, next);
});

app.post('/cart/remove/:id', checkAuthenticated, (req, res, next) => {
    return productController.removeFromCart(req, res, next);
});

app.post('/cart/clear', checkAuthenticated, (req, res, next) => {
    return productController.clearCart(req, res, next);
});

// Checkout: persist order and redirect to invoice
app.post('/checkout', checkAuthenticated, (req, res, next) => {
    return productController.checkout(req, res, next);
});

// NEW: Add GET route for checkout page
app.get('/checkout', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    if (!cart || cart.length === 0) {
        req.flash('error', 'Cart is empty');
        return res.redirect('/cart');
    }
    
    // Calculate total
    cart.forEach(item => {
        item.price = parseFloat(item.price) || 0;
        item.quantity = parseInt(item.quantity) || 0;
        item.total = item.price * item.quantity;
    });
    const total = cart.reduce((sum, item) => sum + item.total, 0);
    
    res.render('checkout', { cart, user: req.session.user, total });
});

// Payment options page
app.get('/payment-options', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    // Calculate total
    cart.forEach(item => {
        item.price = parseFloat(item.price) || 0;
        item.quantity = parseInt(item.quantity) || 0;
        item.total = item.price * item.quantity;
    });
    const total = cart.reduce((sum, item) => sum + item.total, 0);
    res.render('payment-options', { 
        user: req.session.user, 
        total, 
        stripeConfigured: !!stripe, 
        paypalConfigured: !!paypalClient,
        currency: 'SGD',
        bnplMonths: null
    });
});

app.post('/payment-options', checkAuthenticated, (req, res) => {
    const total = parseFloat(req.body.total) || 0;
    const currency = req.body.currency || 'SGD';
    const bnplMonths = req.body.bnplMonths || null;
    
    res.render('payment-options', { 
        user: req.session.user, 
        total, 
        stripeConfigured: !!stripe, 
        paypalConfigured: !!paypalClient,
        currency: currency,
        bnplMonths: bnplMonths
    });
});

// Stripe Payment Routes
app.post('/create-stripe-checkout', checkAuthenticated, async (req, res) => {
    if (!stripe) {
        return res.redirect('/payment-options?error=stripe_not_configured');
    }
    
    const cart = req.session.cart || [];
    const total = parseFloat(req.body.cartTotal) || 0; // This is SGD amount
    
    // Currency is for display only - always charge SGD
    const displayCurrency = req.body.currency || 'SGD';
    
    // Store currency and BNPL info in session for order processing
    req.session.paymentCurrency = displayCurrency;
    req.session.paymentAmount = total;
    req.session.bnplMonths = req.body.bnplMonths || null;
    
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'sgd', // Always charge in SGD
                        product_data: {
                            name: 'Supermarket Order',
                            description: 'Payment for your supermarket order',
                        },
                        unit_amount: Math.round(total * 100), // SGD amount in cents
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/stripe-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.protocol}://${req.get('host')}/stripe-cancel`,
            metadata: {
                userId: req.session.user.userId,
                cartItems: JSON.stringify(cart),
                displayCurrency: displayCurrency,
                bnplMonths: req.session.bnplMonths || 'none'
            }
        });
        
        res.redirect(session.url);
    } catch (error) {
        console.error('Stripe checkout error:', error);
        res.redirect('/payment-options?error=stripe_checkout_failed');
    }
});

app.get('/stripe-success', checkAuthenticated, async (req, res) => {
    if (!stripe) {
        return res.redirect('/cart?error=stripe_not_configured');
    }
    
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
    
    if (session.payment_status === 'paid') {
        // Clear cart and create order
        const cart = req.session.cart || [];
        const userId = req.session.user.userId;

        // Calculate total from cart
        cart.forEach(item => {
            item.price = parseFloat(item.price) || 0;
            item.quantity = parseInt(item.quantity) || 0;
            item.total = item.price * item.quantity;
        });
        const total = cart.reduce((sum, item) => sum + item.total, 0);

        // Create order in database
        const db = require('./db');
        const productModel = require('./models/productModel');

        try {
            // Get BNPL and display currency from session
            const displayCurrency = req.session.paymentCurrency || 'SGD';
            const bnplMonths = req.session.bnplMonths || null;
            
            // Insert order with display currency and BNPL info
            const orderResult = await new Promise((resolve, reject) => {
                db.query('INSERT INTO orders (userId, total, displayCurrency, bnplMonths, createdAt) VALUES (?, ?, ?, ?, NOW())',
                    [userId, total, displayCurrency, bnplMonths], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });

            // Get the auto-generated order ID
            const orderId = orderResult.insertId;

            // Insert order items
            for (const item of cart) {
                await new Promise((resolve, reject) => {
                    db.query('INSERT INTO order_items (orderId, productId, productName, price, quantity) VALUES (?, ?, ?, ?, ?)',
                        [orderId, item.productId, item.productName, item.price, item.quantity], (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
                });
            }

            // Decrease stock for each product in the order
            for (const item of cart) {
                await new Promise((resolve, reject) => {
                    productModel.decreaseProductStock(item.productId, item.quantity, (err) => {
                        if (err) {
                            console.error(`Failed to decrease stock for product ${item.productId}:`, err);
                        }
                        resolve();
                    });
                });
            }

            // Clear cart
            req.session.cart = [];

            res.render('stripeSuccess', {
                user: req.session.user,
                orderId: orderId,
                total: total
            });
        } catch (error) {
            console.error('Order creation error:', error);
            res.redirect('/cart?error=order_creation_failed');
        }
    } else {
        res.redirect('/stripe-cancel');
    }
});

app.get('/stripe-cancel', checkAuthenticated, (req, res) => {
    res.render('stripeCancel', { user: req.session.user });
});

// PayPal Payment Routes
app.post('/create-paypal-order', checkAuthenticated, async (req, res) => {
    if (!paypalClient) return res.status(500).json({ error: 'PayPal not configured' });
    const cart = req.session.cart || [];
    const total = cart.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0), 0);
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
            amount: {
                currency_code: 'SGD',
                value: total.toFixed(2)
            }
        }]
    });
    try {
        const order = await paypalClient.execute(request);
        res.json({ id: order.result.id });
    } catch (err) {
        console.error('PayPal order creation error:', err);
        res.status(500).json({ error: 'Failed to create PayPal order' });
    }
});

app.post('/capture-paypal-order', checkAuthenticated, async (req, res) => {
    if (!paypalClient) return res.status(500).json({ error: 'PayPal not configured' });
    const { orderID } = req.body;
    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});
    try {
        const capture = await paypalClient.execute(request);
        // On success, create order in DB
        const cart = req.session.cart || [];
        const userId = req.session.user.userId;
        cart.forEach(item => {
            item.price = parseFloat(item.price) || 0;
            item.quantity = parseInt(item.quantity) || 0;
            item.total = item.price * item.quantity;
        });
        const total = cart.reduce((sum, item) => sum + item.total, 0);
        const db = require('./db');
        const productModel = require('./models/productModel');
        
        // Get BNPL and display currency from session
        const displayCurrency = req.session.paymentCurrency || 'SGD';
        const bnplMonths = req.session.bnplMonths || null;
        
        // Insert order and items, then decrease stock
        const orderResult = await new Promise((resolve, reject) => {
            db.query('INSERT INTO orders (userId, total, displayCurrency, bnplMonths, createdAt) VALUES (?, ?, ?, ?, NOW())',
                [userId, total, displayCurrency, bnplMonths], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
        const orderId = orderResult.insertId;
        
        for (const item of cart) {
            await new Promise((resolve, reject) => {
                db.query('INSERT INTO order_items (orderId, productId, productName, price, quantity) VALUES (?, ?, ?, ?, ?)',
                    [orderId, item.productId, item.productName, item.price, item.quantity], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        }
        
        for (const item of cart) {
            await new Promise((resolve, reject) => {
                productModel.decreaseProductStock(item.productId, item.quantity, (err) => {
                    if (err) console.error(`Failed to decrease stock for product ${item.productId}:`, err);
                    resolve();
                });
            });
        }
        
        req.session.cart = [];
        res.json({ success: true, orderId });
    } catch (err) {
        console.error('PayPal capture error:', err);
        res.status(500).json({ error: 'Failed to capture PayPal order' });
    }
});

// Orders & invoice
app.get('/orders', checkAuthenticated, (req, res, next) => {
    return productController.getOrders(req, res, next);
});

app.get('/invoice/:orderId', checkAuthenticated, (req, res, next) => {
    return productController.getInvoice(req, res, next);
});

// NEW: Admin order management routes
app.get('/admin/orders', checkAuthenticated, checkAdmin, (req, res, next) => {
    return productController.getAllOrders(req, res, next);
});

app.get('/admin/invoice/:orderId', checkAuthenticated, checkAdmin, (req, res, next) => {
    return productController.getAdminInvoice(req, res, next);
});

app.get('/logout', (req, res) => {
    // remove user from session but keep session for flash messages
    if (req.session) {
        req.session.user = null;
        req.flash('success', 'Logged out successfully');
        // ensure session is saved so flash is persisted then redirect
        req.session.save(err => {
            return res.redirect('/');
        });
    } else {
        return res.redirect('/');
    }
});

// Product detail route alias to match previous naming (delegate to controller)
app.get('/product/:id', checkAuthenticated, (req, res, next) => {
    return productController.getProductById(req, res, next);
});

// Product update/delete legacy endpoints redirected to new routes
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, (req, res, next) => {
    return productController.getProductById(req, res, next);
});

app.post('/updateProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), (req, res, next) => {
    return productController.updateProduct(req, res, next);
});

app.get('/deleteProduct/:id', checkAuthenticated, checkAdmin, (req, res, next) => {
    return productController.deleteProduct(req, res, next);
});

// Wishlist routes
app.get('/wishlist', checkAuthenticated, (req, res, next) => {
  return wishlistController.getWishlist(req, res, next);
});

app.post('/wishlist/add/:id', checkAuthenticated, (req, res, next) => {
  return wishlistController.addToWishlist(req, res, next);
});

app.post('/wishlist/remove/:id', checkAuthenticated, (req, res, next) => {
  return wishlistController.removeFromWishlist(req, res, next);
});

app.post('/wishlist/clear', checkAuthenticated, (req, res, next) => {
  return wishlistController.clearWishlist(req, res, next);
});

app.post('/wishlist/update-notes', checkAuthenticated, (req, res, next) => {
  return wishlistController.updateWishlistNotes(req, res, next);
});

app.post('/wishlist/move-to-cart', checkAuthenticated, (req, res, next) => {
  return wishlistController.moveAllToCart(req, res, next);
});

// ========================================
// Currency Conversion API Routes
// ========================================

/**
 * Get exchange rates from external API
 * Caches rates for 1 hour to reduce API calls
 */
let exchangeRatesCache = null;
let cacheExpiry = null;

app.get('/api/exchange-rates', async (req, res) => {
    const baseCurrency = req.query.base || 'SGD';
    
    // Check if cache is valid
    if (exchangeRatesCache && cacheExpiry && Date.now() < cacheExpiry) {
        return res.json(exchangeRatesCache);
    }
    
    try {
        // Using exchangerate-api.com (free tier)
        // Alternative: You can use other APIs like fixer.io, currencyapi.com, etc.
        const apiUrl = `https://api.exchangerate-api.com/v4/latest/${baseCurrency}`;
        const response = await axios.get(apiUrl);
        
        const data = {
            base: response.data.base,
            rates: response.data.rates,
            time_last_update_utc: response.data.time_last_update_utc || new Date().toISOString()
        };
        
        // Cache for 1 hour
        exchangeRatesCache = data;
        cacheExpiry = Date.now() + (60 * 60 * 1000);
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching exchange rates:', error);
        
        // Return fallback rates if API fails
        res.json({
            base: baseCurrency,
            rates: {
                'SGD': 1.00,
                'USD': 0.74,
                'EUR': 0.68,
                'GBP': 0.58,
                'JPY': 110.50,
                'AUD': 1.09,
                'CNY': 4.76,
                'MYR': 3.12,
                'THB': 25.20,
                'KRW': 880.00
            },
            time_last_update_utc: new Date().toISOString(),
            fallback: true
        });
    }
});

/**
 * Calculate BNPL installment plans
 */
app.post('/api/calculate-bnpl', (req, res) => {
    const { amount, months, currency } = req.body;
    
    if (!amount || !months) {
        return res.status(400).json({ error: 'Amount and months are required' });
    }
    
    const totalAmount = parseFloat(amount);
    const installmentMonths = parseInt(months);
    
    if (totalAmount < 50) {
        return res.json({ 
            qualifies: false, 
            message: 'Minimum amount for BNPL is 50 currency units' 
        });
    }
    
    const monthlyPayment = totalAmount / installmentMonths;
    
    res.json({
        qualifies: true,
        totalAmount: totalAmount,
        months: installmentMonths,
        monthlyPayment: monthlyPayment.toFixed(2),
        currency: currency || 'SGD',
        interestRate: 0,
        totalInterest: 0
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});