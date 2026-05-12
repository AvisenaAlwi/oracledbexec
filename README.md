# oracledbexec

[![npm](https://img.shields.io/npm/v/oracledbexec.svg?style=flat-square)](https://www.npmjs.com/package/oracledbexec)
[![license](https://img.shields.io/github/license/thesuhu/oracledbexec?style=flat-square)](https://github.com/thesuhu/oracledbexec/blob/master/LICENSE)

Running Oracle queries made easier.

## Install

```sh
npm install oracledbexec --save
```

## Environment Variables

This module reads environment variables for configuration. If environment variables are not found, default values will be used. You can also pass database configuration parameters when initializing the module.

### Database Configuration
* **ORA_USR**: the database user name. (required, no default)
* **ORA_PWD**: the password of the database user. (required, no default)
* **ORA_CONSTR**: connection string `<host>:<port>/<service name>`. (required, no default)

### Pool Configuration (Production Optimized)
* **POOL_MIN**: the minimum number of connections in the pool. (default: `2`)
* **POOL_MAX**: the maximum number of connections. (default: `8`)
* **POOL_INCREMENT**: connections opened when more are needed. (default: `1`)
* **POOL_ALIAS**: pool identifier for multiple pools. (default: `default`)
* **POOL_PING_INTERVAL**: connection health check interval in seconds. (default: `30`)
* **POOL_TIMEOUT**: idle connection timeout in seconds. (default: `120`)
* **POOL_CLOSING_TIME**: graceful pool shutdown wait time in seconds. (default: `0`)

### Queue Configuration
* **QUEUE_MAX**: maximum queued connection requests. (default: `50`)
* **QUEUE_TIMEOUT**: queue wait timeout in milliseconds. (default: `5000`)

### Client Configuration
* **THIN_MODE**: enable Oracle thin client mode. (default: `true`)

### Built-in Monitoring (New Feature)
* **ORACLE_POOL_MONITORING**: enable automatic pool monitoring. (default: `false`)
* **ORACLE_MONITOR_INTERVAL**: monitoring check interval in milliseconds. (default: `30000`)

## Usage

### Basic Setup

Initialize database in `index.js/app.js` file to create connection pool:

```js
const oracledbexec = require('oracledbexec')

// Initialize with environment variables
await oracledbexec.initialize()
```

Or pass custom database configuration:

```js
const oracledbexec = require('oracledbexec')

let dbconfig = {
    user: 'hr',
    password: 'hr',
    connectString: 'localhost:1521/XEPDB1',
    poolMin: 2,        // Production optimized
    poolMax: 8,        // Production optimized
    poolIncrement: 1,  // Allow gradual scaling
    poolAlias: 'default',
    poolPingInterval: 30,
    poolTimeout: 120,
    queueMax: 50,
    queueTimeout: 5000,
}
await oracledbexec.initialize(dbconfig)
```

### Built-in Pool Monitoring (New Feature)

Enable automatic pool monitoring by setting environment variable:
```bash
ORACLE_POOL_MONITORING=true
ORACLE_MONITOR_INTERVAL=30000  # Check every 30 seconds
```

Get pool statistics programmatically:
```js
const { getPoolStats } = require('oracledbexec')

// Get current pool status
const stats = getPoolStats()
console.log(stats)
/*
Output:
{
  totalConnections: 3,
  busyConnections: 1,
  freeConnections: 2,
  queuedRequests: 0,
  lastCheck: '2025-08-13T10:30:00.000Z',
  poolStatus: 'healthy', // 'healthy', 'warning', 'exhausted'
  warnings: 0,
  errors: []
}
*/
```

### Single Query Execution

Execute single SQL statements with automatic connection management:

```js
const { oraexec } = require('oracledbexec')

try {
    let sql = `SELECT * FROM countries WHERE country_id = :country_id`
    let param = {country_id: 'JP'}
    let result = await oraexec(sql, param)
    console.log(result.rows)
} catch (err) {
    console.log(err.message)
}
```

Use specific pool:
```js
let result = await oraexec(sql, param, 'hrpool')
```

### Transaction Execution

For multiple SQL statements with automatic rollback on failure:

```js
const { oraexectrans } = require('oracledbexec')

try {
    let queries = []
    queries.push({
        query: `INSERT INTO countries VALUES (:country_id, :country_name)`,
        parameters: {country_id: 'ID', country_name: 'Indonesia'}
    })
    queries.push({
        query: `INSERT INTO countries VALUES (:country_id, :country_name)`,
        parameters: {country_id: 'JP', country_name: 'Japan'}
    })
    queries.push({
        query: `INSERT INTO countries VALUES (:country_id, :country_name)`,
        parameters: {country_id: 'CN', country_name: 'China'}
    })

    await oraexectrans(queries)
    console.log('All queries executed successfully')
} catch (err) {
    console.log('Transaction failed, all changes rolled back:', err.message)
}
```

Use specific pool:
```js
await oraexectrans(queries, 'hrpool')
```

### Manual Transaction Control

For complex transactions requiring intermediate processing:

**⚠️ Important**: Always close sessions to prevent connection leaks!

```js
const { begintrans, exectrans, committrans, rollbacktrans } = require('oracledbexec')

let session
try {
    // Start transaction session
    session = await begintrans()

    // Execute first query
    let sql = `SELECT country_name FROM countries WHERE country_id = :country_id`
    let param = {country_id: 'ID'}
    let result = await exectrans(session, sql, param)

    // Process result and execute second query
    sql = `INSERT INTO sometable VALUES (:name, :country_name)`
    param = {
        name: 'Some Name',
        country_name: result.rows[0].country_name
    }
    await exectrans(session, sql, param)

    // Commit transaction
    await committrans(session)
    console.log('Transaction committed successfully')

} catch (err) {
    // Rollback on error
    if (session) {
        await rollbacktrans(session)
    }
    console.log('Transaction rolled back:', err.message)
}
```

Use specific pool for transaction:
```js
let session = await begintrans('hrpool')
```

### Graceful Shutdown

Properly close connection pools when your application shuts down:

```js
const { close } = require('oracledbexec')

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...')
    try {
        await close()
        console.log('Database pool closed')
        process.exit(0)
    } catch (err) {
        console.error('Error closing pool:', err.message)
        process.exit(1)
    }
})
```

## Production Best Practices

### Recommended Environment Configuration

```bash
# Database connection
ORA_USR=your_username
ORA_PWD=your_password
ORA_CONSTR=host:port/service_name

# Production-optimized pool settings
POOL_MIN=2
POOL_MAX=8
POOL_INCREMENT=1
POOL_PING_INTERVAL=30
POOL_TIMEOUT=120

# Queue settings
QUEUE_MAX=50
QUEUE_TIMEOUT=5000

# Enable monitoring
ORACLE_POOL_MONITORING=true
ORACLE_MONITOR_INTERVAL=30000

# Use thin client
THIN_MODE=true
```

### Error Handling

All functions throw errors that should be caught:

```js
const { oraexec } = require('oracledbexec')

try {
    const result = await oraexec('SELECT * FROM invalid_table')
} catch (error) {
    console.error('Database error:', error.message)
    // Handle error appropriately
}
```

### Connection Leak Prevention

The library automatically manages connections and prevents leaks:
- All connections are properly closed in `finally` blocks
- Failed connections are automatically cleaned up
- Pool monitoring alerts when connections are exhausted

## API Reference

### Functions

| Function | Description | Parameters | Returns |
|----------|-------------|------------|---------|
| `initialize(config?)` | Initialize connection pool | Optional config object | Promise<void> |
| `close()` | Close connection pool | None | Promise<void> |
| `oraexec(sql, params?, poolAlias?)` | Execute single query | SQL string, parameters, pool alias | Promise<result> |
| `oraexectrans(queries, poolAlias?)` | Execute transaction | Array of queries, pool alias | Promise<results[]> |
| `begintrans(poolAlias?)` | Start manual transaction | Pool alias | Promise<connection> |
| `exectrans(connection, sql, params?)` | Execute in transaction | Connection, SQL, parameters | Promise<result> |
| `committrans(connection)` | Commit transaction | Connection | Promise<void> |
| `rollbacktrans(connection)` | Rollback transaction | Connection | Promise<void> |
| `getPoolStats()` | Get pool statistics | None | Object |

### Built-in Monitoring

When `ORACLE_POOL_MONITORING=true`:
- Automatic health checks every 30 seconds (configurable)
- Warnings when pool usage > 80%
- Alerts when pool is exhausted
- Connection statistics tracking
- Error logging and history

## Changelog

### Version 1.8.1+ (Latest Improvements)
- ✅ **Production-optimized defaults**: Conservative pool sizing (2-8 connections)
- ✅ **Built-in monitoring**: Optional automatic pool health monitoring
- ✅ **Enhanced error handling**: Guaranteed connection cleanup
- ✅ **Connection leak prevention**: Try-finally blocks ensure proper cleanup
- ✅ **Improved transaction management**: Better rollback and commit handling
- ✅ **Pool statistics API**: `getPoolStats()` function for monitoring
- ✅ **Configurable timeouts**: Reduced queue timeout to prevent hanging
- ✅ **Input validation**: Enhanced parameter validation
- ✅ **Graceful shutdown**: Proper pool closing with configurable wait time

That's all.

If you find this useful, please ⭐ the repository. Any feedback is welcome.

You can contribute or you want to, feel free to [**Buy me a coffee! :coffee:**](https://saweria.co/thesuhu), I will be really thankfull for anything even if it is a coffee or just a kind comment towards my work, because that helps me a lot.

## License

[MIT](https://github.com/thesuhu/oracledbexec/blob/master/LICENSE)
