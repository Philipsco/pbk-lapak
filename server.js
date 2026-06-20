const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Folder untuk file HTML/JS

// Inisialisasi Database SQLite
const db = new sqlite3.Database('./sales.db');

// Buat Tabel jika belum ada
db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        item_name TEXT NOT NULL,
        qty REAL NOT NULL,
        qty_tersisa REAL NOT NULL DEFAULT 0,
        buy_price REAL NOT NULL,
        sell_price REAL NOT NULL,
        is_ppn_applicable BOOLEAN DEFAULT 1, -- 1 = Ya (10%), 0 = Tidak (0%)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// --- API ROUTES ---

// 1. Get All Transactions (Read)
app.get('/api/transactions', (req, res) => {
    db.all(`SELECT * FROM transactions ORDER BY date DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 2. Create Transaction (Create)
app.post('/api/transactions', (req, res) => {
    const { date, itemName, qty, qtyTersisa, buyPrice, sellPrice, isPpnApplicable } = req.body;

    // Validasi sederhana
    if (!date || !itemName || !qty || !sellPrice) {
        return res.status(400).json({ error: "Semua field wajib diisi" });
    }

    db.run(
        `INSERT INTO transactions (date, item_name, qty, qty_tersisa, buy_price, sell_price, is_ppn_applicable)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [date, itemName, qty, qtyTersisa, buyPrice, sellPrice, isPpnApplicable],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: "Data berhasil disimpan" });
        }
    );
});

// 3. Update Transaction (Update)
app.put('/api/transactions/:id', (req, res) => {
    const id = req.params.id;
    const { date, itemName, qty, qtyTersisa, buyPrice, sellPrice, isPpnApplicable } = req.body;

    db.run(
        `UPDATE transactions SET date=?, item_name=?, qty=?, qty_tersisa=?, buy_price=?, sell_price=?, is_ppn_applicable=? WHERE id=?`,
        [date, itemName, qty, qtyTersisa, buyPrice, sellPrice, isPpnApplicable, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Data berhasil diupdate" });
        }
    );
});

// 4. Delete Transaction (Delete)
app.delete('/api/transactions/:id', (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM transactions WHERE id=?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Data berhasil dihapus" });
    });
});

// 5. Clear All Transactions (Delete)
app.delete('/api/transactions', (req, res) => {
    db.run(`DELETE FROM transactions`, [], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Semua data berhasil dihapus" });
    });
});

app.listen(PORT, () => {
    console.log(`Server sudah berjalan jalan di ${PORT}`);
});
