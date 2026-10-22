import pg from 'pg';

// EN gemensam databasanslutning för hela servern.
// Alla filer som behöver databasen importerar den härifrån.
const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });