const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    })
    : new Pool({
        host: process.env.PGHOST || process.env.PGHOSTLOCAL,
        port: process.env.PGPORT || process.env.PGPORTLOCAL,
        user: process.env.PGUSER || process.env.PGUSERLOCAL,
        password: process.env.PGPASSWORD || process.env.PGPASSWORDLOCAL,
        database: process.env.PGDATABASE || process.env.PGDATABASELOCAL
    });

async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
            date TEXT NOT NULL,
            item_name TEXT NOT NULL,
            qty REAL NOT NULL,
            qty_tersisa REAL NOT NULL DEFAULT 0,
            buy_price REAL NOT NULL,
            sell_price REAL NOT NULL,
            is_ppn_applicable BOOLEAN DEFAULT true, -- true = Ya (10%), false = Tidak (0%)
            created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('Tabel transactions siap.');
}

app.get('/api/transactions', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM transactions ORDER BY date DESC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/transactions', async (req, res) => {
    const { date, itemName, qty, qtyTersisa, buyPrice, sellPrice, isPpnApplicable } = req.body;
    if (!date || !itemName) {
        return res.status(400).json({ error: "Semua field wajib diisi" });
    }
    try {
        const result = await pool.query(
            `INSERT INTO transactions (date, item_name, qty, qty_tersisa, buy_price, sell_price, is_ppn_applicable)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [date, itemName, qty, qtyTersisa, buyPrice, sellPrice, isPpnApplicable]
        );
        res.json({ id: result.rows[0].id, message: "Data berhasil disimpan" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/transactions/:id', async (req, res) => {
    const id = req.params.id;
    const { date, itemName, qty, qtyTersisa, buyPrice, sellPrice, isPpnApplicable } = req.body;

    try {
        await pool.query(
            `UPDATE transactions
             SET date=$1, item_name=$2, qty=$3, qty_tersisa=$4, buy_price=$5, sell_price=$6, is_ppn_applicable=$7
             WHERE id=$8`,
            [date, itemName, qty, qtyTersisa, buyPrice, sellPrice, isPpnApplicable, id]
        );
        res.json({ message: "Data berhasil diupdate" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/transactions/:id', async (req, res) => {
    const id = req.params.id;
    try {
        await pool.query(`DELETE FROM transactions WHERE id=$1`, [id]);
        res.json({ message: "Data berhasil dihapus" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/transactions', async (req, res) => {
    try {
        await pool.query(`DELETE FROM transactions`);
        res.json({ message: "Semua data berhasil dihapus" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

if (require.main === module) {
    initDb()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`Server sudah berjalan di ${PORT}`);
            });
        })
        .catch((err) => {
            console.error('Gagal inisialisasi database:', err);
            process.exit(1);
        });
}
 
module.exports = { app, initDb };