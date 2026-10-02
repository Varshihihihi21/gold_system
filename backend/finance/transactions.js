/** Run a callback inside one PostgreSQL transaction and always release the client. */
async function withTransaction(pool, callback) {
  const client = await pool.connect();
  let open = false;
  try {
    await client.query('BEGIN');
    open = true;
    const result = await callback(client);
    await client.query('COMMIT');
    open = false;
    return result;
  } catch (error) {
    if (open) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Financial transaction rollback failed:', rollbackError.message);
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Return the database's current date, avoiding a client/server timezone mismatch. */
async function currentBusinessDate(client) {
  const result = await client.query('SELECT CURRENT_DATE::text AS business_date');
  return result.rows[0].business_date;
}

module.exports = { withTransaction, currentBusinessDate };
