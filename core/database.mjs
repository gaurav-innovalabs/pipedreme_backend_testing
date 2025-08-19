// database.mjs
import sqlite3 from 'sqlite3';
import fs from 'fs';

let db;

// Ensure db_data directory exists
const dbDir = './db_data';
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

export async function initDB() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database('./db_data/pd_local.sqlite', (err) => {
            if (err) return reject(err);
            
            // Enable foreign keys
            db.run('PRAGMA foreign_keys = ON');
            
            // Create all required tables
            const createTables = [
                
                // Apps/Accounts table (for authentication)
                `CREATE TABLE IF NOT EXISTS accounts (
                    id TEXT PRIMARY KEY,
                    app_key TEXT NOT NULL,
                    external_user_id TEXT NOT NULL,
                    app_slug TEXT NOT NULL,
                    credentials_json TEXT NOT NULL,
                    auth_type TEXT DEFAULT 'custom',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
                
                
                // Component runs history
                `CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
                    app_slug TEXT NOT NULL,
                    component_key TEXT NOT NULL,
                    external_user_id TEXT NOT NULL,
                    configured_props_json TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    output_json TEXT,
                    error_message TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME
                )`,
                
            ];
            
            let completed = 0;
            const total = createTables.length;
            
            createTables.forEach(sql => {
                db.run(sql, (err) => {
                    if (err) return reject(err);
                    completed++;
                    if (completed === total) {
                        console.log('Database initialized successfully');
                        resolve(db);
                    }
                });
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