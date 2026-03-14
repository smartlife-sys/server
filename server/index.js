const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

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
app.use(express.json({ limit: '50mb' }));

// ========================================
// DATABASE INITIALIZATION
// ========================================

async function initDB() {
  const client = await pool.connect();
  try {
    console.log('📊 Initializing database...');

    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name JSONB NOT NULL,
        slug TEXT NOT NULL,
        image TEXT,
        product_count INTEGER DEFAULT 0
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name JSONB NOT NULL,
        description JSONB NOT NULL,
        price NUMERIC NOT NULL,
        category_id TEXT REFERENCES categories(id),
        images JSONB DEFAULT '[]'::jsonb,
        in_stock BOOLEAN DEFAULT true,
        availability_type TEXT DEFAULT 'in_stock',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        items JSONB NOT NULL,
        total NUMERIC NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        data JSONB NOT NULL,
        CHECK (id = 1)
      );
    `);

    // Check if we have initial data
    const categoriesCount = await client.query('SELECT COUNT(*) FROM categories');

    if (parseInt(categoriesCount.rows[0].count) === 0) {
      console.log('📦 Loading initial data...');
      const initialData = require('./initial-data.js');

      // Insert categories
      for (const cat of initialData.categories) {
        await client.query(
          'INSERT INTO categories (id, name, slug, image, product_count) VALUES ($1, $2, $3, $4, $5)',
          [cat.id, cat.name, cat.slug, cat.image, cat.productCount]
        );
      }

      // Insert products
      for (const prod of initialData.products) {
        await client.query(
          'INSERT INTO products (id, name, description, price, category_id, images, in_stock, availability_type, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [
            prod.id,
            prod.name,
            prod.description,
            prod.price,
            prod.categoryId,
            JSON.stringify(prod.images),
            prod.inStock,
            prod.availabilityType || 'in_stock',
            prod.createdAt
          ]
        );
      }

      // Insert site settings
      await client.query(
        'INSERT INTO site_settings (id, data) VALUES (1, $1) ON CONFLICT (id) DO NOTHING',
        [JSON.stringify(initialData.siteSettings)]
      );

      console.log('✅ Initial data loaded');
    }

    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// ========================================
// API ENDPOINTS
// ========================================

// Get all data
app.get('/api/data', async (req, res) => {
  try {
    const [categories, products, orders, settings] = await Promise.all([
      pool.query('SELECT * FROM categories ORDER BY id'),
      pool.query('SELECT * FROM products ORDER BY created_at DESC'),
      pool.query('SELECT * FROM orders ORDER BY created_at DESC'),
      pool.query('SELECT data FROM site_settings WHERE id = 1')
    ]);

    res.json({
      categories: categories.rows,
      products: products.rows.map(p => ({
        ...p,
        categoryId: p.category_id,
        inStock: p.in_stock,
        availabilityType: p.availability_type,
        createdAt: p.created_at
      })),
      orders: orders.rows.map(o => ({
        ...o,
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        customerEmail: o.customer_email,
        createdAt: o.created_at
      })),
      siteSettings: settings.rows[0]?.data || {},
      customers: []
    });
  } catch (error) {
    console.error('Error reading data:', error);
    res.status(500).json({ error: 'Failed to read data' });
  }
});

// Site Settings
app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM site_settings WHERE id = 1');
    res.json(result.rows[0]?.data || {});
  } catch (error) {
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const result = await pool.query(
      'INSERT INTO site_settings (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = $1 RETURNING data',
      [JSON.stringify(req.body)]
    );
    res.json(result.rows[0].data);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Categories
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read categories' });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const id = Date.now().toString();
    const result = await pool.query(
      'INSERT INTO categories (id, name, slug, image, product_count) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, req.body.name, req.body.slug, req.body.image, 0]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE categories SET name = $1, slug = $2, image = $3 WHERE id = $4 RETURNING *',
      [req.body.name, req.body.slug, req.body.image, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Products
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    const products = result.rows.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: parseFloat(p.price),
      categoryId: p.category_id,
      images: p.images,
      inStock: p.in_stock,
      availabilityType: p.availability_type,
      createdAt: p.created_at
    }));
    res.json(products);
  } catch (error) {
    console.error('Error reading products:', error);
    res.status(500).json({ error: 'Failed to read products' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const id = Date.now().toString();
    const createdAt = new Date().toISOString();

    const result = await pool.query(
      'INSERT INTO products (id, name, description, price, category_id, images, in_stock, availability_type, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [
        id,
        req.body.name,
        req.body.description,
        req.body.price,
        req.body.categoryId,
        JSON.stringify(req.body.images || []),
        req.body.inStock !== false,
        req.body.availabilityType || 'in_stock',
        createdAt
      ]
    );

    const product = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      price: parseFloat(result.rows[0].price),
      categoryId: result.rows[0].category_id,
      images: result.rows[0].images,
      inStock: result.rows[0].in_stock,
      availabilityType: result.rows[0].availability_type,
      createdAt: result.rows[0].created_at
    };

    res.json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE products SET name = $1, description = $2, price = $3, category_id = $4, images = $5, in_stock = $6, availability_type = $7 WHERE id = $8 RETURNING *',
      [
        req.body.name,
        req.body.description,
        req.body.price,
        req.body.categoryId,
        JSON.stringify(req.body.images || []),
        req.body.inStock !== false,
        req.body.availabilityType || 'in_stock',
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      price: parseFloat(result.rows[0].price),
      categoryId: result.rows[0].category_id,
      images: result.rows[0].images,
      inStock: result.rows[0].in_stock,
      availabilityType: result.rows[0].availability_type,
      createdAt: result.rows[0].created_at
    };

    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Orders
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    const orders = result.rows.map(o => ({
      id: o.id,
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      customerEmail: o.customer_email,
      items: o.items,
      total: parseFloat(o.total),
      status: o.status,
      createdAt: o.created_at
    }));
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read orders' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const id = Date.now().toString();
    const createdAt = new Date().toISOString();

    const result = await pool.query(
      'INSERT INTO orders (id, customer_name, customer_phone, customer_email, items, total, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [
        id,
        req.body.customerName,
        req.body.customerPhone,
        req.body.customerEmail,
        JSON.stringify(req.body.items),
        req.body.total,
        'pending',
        createdAt
      ]
    );

    const order = {
      id: result.rows[0].id,
      customerName: result.rows[0].customer_name,
      customerPhone: result.rows[0].customer_phone,
      customerEmail: result.rows[0].customer_email,
      items: result.rows[0].items,
      total: parseFloat(result.rows[0].total),
      status: result.rows[0].status,
      createdAt: result.rows[0].created_at
    };

    res.json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [req.body.status, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = {
      id: result.rows[0].id,
      customerName: result.rows[0].customer_name,
      customerPhone: result.rows[0].customer_phone,
      customerEmail: result.rows[0].customer_email,
      items: result.rows[0].items,
      total: parseFloat(result.rows[0].total),
      status: result.rows[0].status,
      createdAt: result.rows[0].created_at
    };

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// Customers
app.get('/api/customers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
    const customers = result.rows.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      createdAt: c.created_at
    }));
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read customers' });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const id = Date.now().toString();
    const createdAt = new Date().toISOString();

    const result = await pool.query(
      'INSERT INTO customers (id, name, phone, email, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, req.body.name, req.body.phone, req.body.email, createdAt]
    );

    const customer = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      phone: result.rows[0].phone,
      email: result.rows[0].email,
      createdAt: result.rows[0].created_at
    };

    res.json(customer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: 'PostgreSQL Connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed'
    });
  }
});

// Start server
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      const env = process.env.NODE_ENV || 'development';
      console.log(`\n🚀 Backend server running`);
      console.log(`📍 Environment: ${env}`);
      console.log(`🌐 Port: ${PORT}`);
      console.log(`📊 Database: PostgreSQL`);
      if (env === 'development') {
        console.log(`🔗 URL: http://localhost:${PORT}`);
      }
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
