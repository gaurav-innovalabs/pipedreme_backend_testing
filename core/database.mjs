// database.mjs
import sqlite3 from 'sqlite3';

let db;

export async function initDB() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database('./db_data/connections.db', (err) => {
            if (err) return reject(err);
            
            db.run(`
                CREATE TABLE IF NOT EXISTS connections (
                    id TEXT PRIMARY KEY,
                    app_key TEXT NOT NULL,
                    auth_data TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) return reject(err);
                resolve(db);
            });
        });
    });
}

export function getDB() {
    if (!db) throw new Error('Database not initialized');
    return db;
}

// Helper function for async queries
export function dbGet(query, params) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

export function dbRun(query, params) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}