const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, 'db.json');

// CORS configuration for production
const corsOptions = {
  origin: process.env.FRONTEND_URL || [
    'http://localhost:5173',
    'http://localhost:4173',
    /\.vercel\.app$/,
    /\.netlify\.app$/,
  ],
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' })); // For base64 images

// Initialize database file if it doesn't exist
async function initDB() {
  try {
    await fs.access(DB_FILE);
  } catch {
    // File doesn't exist, create it with initial data
    const initialData = require('./initial-data.js');
    await fs.writeFile(DB_FILE, JSON.stringify(initialData, null, 2));
    console.log('Database initialized with default data');
  }
}

// Read database
async function readDB() {
  const data = await fs.readFile(DB_FILE, 'utf8');
  return JSON.parse(data);
}

// Write database
async function writeDB(data) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

// ========================================
// API ENDPOINTS
// ========================================

// Get all data
app.get('/api/data', async (req, res) => {
  try {
    const data = await readDB();
    res.json(data);
  } catch (error) {
    console.error('Error reading data:', error);
    res.status(500).json({ error: 'Failed to read data' });
  }
});

// Update site settings
app.put('/api/settings', async (req, res) => {
  try {
    const data = await readDB();
    data.siteSettings = { ...data.siteSettings, ...req.body };
    await writeDB(data);
    res.json(data.siteSettings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Categories
app.get('/api/categories', async (req, res) => {
  try {
    const data = await readDB();
    res.json(data.categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read categories' });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const data = await readDB();
    const newCategory = { id: Date.now().toString(), ...req.body };
    data.categories.push(newCategory);
    await writeDB(data);
    res.json(newCategory);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  try {
    const data = await readDB();
    const index = data.categories.findIndex(c => c.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Category not found' });
    }
    data.categories[index] = { ...data.categories[index], ...req.body };
    await writeDB(data);
    res.json(data.categories[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const data = await readDB();
    data.categories = data.categories.filter(c => c.id !== req.params.id);
    await writeDB(data);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Products
app.get('/api/products', async (req, res) => {
  try {
    const data = await readDB();
    res.json(data.products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read products' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const data = await readDB();
    const newProduct = {
      id: Date.now().toString(),
      ...req.body,
      createdAt: new Date().toISOString(),
    };
    data.products.push(newProduct);
    await writeDB(data);
    res.json(newProduct);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const data = await readDB();
    const index = data.products.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Product not found' });
    }
    data.products[index] = { ...data.products[index], ...req.body };
    await writeDB(data);
    res.json(data.products[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const data = await readDB();
    data.products = data.products.filter(p => p.id !== req.params.id);
    await writeDB(data);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Orders
app.get('/api/orders', async (req, res) => {
  try {
    const data = await readDB();
    res.json(data.orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read orders' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const data = await readDB();
    const newOrder = {
      id: Date.now().toString(),
      ...req.body,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    data.orders.push(newOrder);
    await writeDB(data);
    res.json(newOrder);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const data = await readDB();
    const index = data.orders.findIndex(o => o.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Order not found' });
    }
    data.orders[index] = { ...data.orders[index], ...req.body };
    await writeDB(data);
    res.json(data.orders[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    const data = await readDB();
    data.orders = data.orders.filter(o => o.id !== req.params.id);
    await writeDB(data);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// Customers
app.get('/api/customers', async (req, res) => {
  try {
    const data = await readDB();
    res.json(data.customers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read customers' });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const data = await readDB();
    const newCustomer = {
      id: Date.now().toString(),
      ...req.body,
      createdAt: new Date().toISOString(),
    };
    data.customers.push(newCustomer);
    await writeDB(data);
    res.json(newCustomer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Start server
async function start() {
  await initDB();
  app.listen(PORT, () => {
    const env = process.env.NODE_ENV || 'development';
    console.log(`\n🚀 Backend server running`);
    console.log(`📍 Environment: ${env}`);
    console.log(`🌐 Port: ${PORT}`);
    console.log(`📊 Database: ${DB_FILE}`);
    if (env === 'development') {
      console.log(`🔗 URL: http://localhost:${PORT}`);
    }
    console.log('');
  });
}

start().catch(console.error);
