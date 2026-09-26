const { PGlite } = require('@electric-sql/pglite');
const path = require('path');

const dbPath = path.join(__dirname, 'postgres-db');
const db = new PGlite(dbPath);

const pool = {
    execute: async (sql, params = []) => {
        try {
            await db.waitReady;
            // Convert MySQL '?' placeholders to PostgreSQL '$1, $2' placeholders
            let paramCount = 1;
            let pgSql = sql.replace(/\?/g, () => `$${paramCount++}`);
            
            // Replace some MySQL specific syntax with Postgres equivalents
            pgSql = pgSql.replace(/INSERT IGNORE/gi, 'INSERT ON CONFLICT DO NOTHING');
            pgSql = pgSql.replace(/\bJSON\b/g, 'JSONB');
            
            const res = await db.query(pgSql, params);
            
            if (pgSql.trim().toUpperCase().startsWith('SELECT')) {
                return [res.rows];
            } else {
                return [{ 
                    insertId: res.rows && res.rows.length > 0 ? res.rows[0].id : 0, 
                    affectedRows: res.affectedRows 
                }];
            }
        } catch (err) {
            console.error('SQL Error:', sql, err);
            throw err;
        }
    },
    query: async function(sql, params = []) {
        return this.execute(sql, params);
    },
    end: async () => {
        await db.close();
    }
};

module.exports = pool;
