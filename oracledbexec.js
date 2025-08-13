const oracledb = require('oracledb')
const thinMode = process.env.THIN_MODE || 'true'
if (thinMode === 'false') {
    oracledb.initOracleClient()
}
const { queryBindToString } = require('bind-sql-string')
const { logConsole, errorConsole, sqlLogConsole } = require('@thesuhu/colorconsole')
const env = process.env.NODE_ENV || 'dev'
const poolClosingTime = process.env.POOL_CLOSING_TIME || 0 // 0 = force close, use 10 (seconds) to avoid force close

// Built-in monitoring configuration
const enableMonitoring = process.env.ORACLE_POOL_MONITORING === 'true' || false
const monitoringInterval = parseInt(process.env.ORACLE_MONITOR_INTERVAL, 10) || 30000 // 30 seconds
let poolMonitor = null

// Remove default credentials for security
const dbconfig = {
    user: process.env.ORA_USR,
    password: process.env.ORA_PWD,
    connectString: process.env.ORA_CONSTR,
    poolMin: parseInt(process.env.POOL_MIN, 10) || 2, // Conservative default
    poolMax: parseInt(process.env.POOL_MAX, 10) || 8, // Conservative default
    poolIncrement: parseInt(process.env.POOL_INCREMENT, 10) || 1, // Allow growth
    poolAlias: process.env.POOL_ALIAS || 'default', // optional pool alias
    poolPingInterval: parseInt(process.env.POOL_PING_INTERVAL, 10) || 30, // Ping every 30 seconds
    poolTimeout: parseInt(process.env.POOL_TIMEOUT, 10) || 120, // Timeout after 2 minutes
    queueMax: parseInt(process.env.QUEUE_MAX, 10) || 50, // Smaller queue to prevent overload
    queueTimeout: parseInt(process.env.QUEUE_TIMEOUT, 10) || 5000, // 5 second timeout for queue
}

const defaultThreadPoolSize = 4 // default thread pool size
process.env.UV_THREADPOOL_SIZE = dbconfig.poolMax + defaultThreadPoolSize // Increase thread pool size by poolMax

// Built-in Pool Monitor Class
class BuiltInPoolMonitor {
    constructor(poolAlias, intervalMs = 30000) {
        this.poolAlias = poolAlias
        this.intervalMs = intervalMs
        this.monitorInterval = null
        this.stats = {
            totalConnections: 0,
            busyConnections: 0,
            freeConnections: 0,
            lastCheck: null,
            poolStatus: 'unknown',
            warnings: 0,
            errors: []
        }
    }

    start() {
        if (enableMonitoring) {
            logConsole(`🔍 Pool monitoring enabled for: ${this.poolAlias}`)
            this.monitorInterval = setInterval(() => {
                this.checkPoolHealth()
            }, this.intervalMs)
        }
    }

    stop() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval)
            this.monitorInterval = null
            logConsole('Pool monitoring stopped')
        }
    }

    checkPoolHealth() {
        try {
            const pool = oracledb.getPool(this.poolAlias)
            
            this.stats = {
                totalConnections: pool.connectionsInUse + pool.connectionsOpen,
                busyConnections: pool.connectionsInUse,
                freeConnections: pool.connectionsOpen,
                queuedRequests: pool.queueLength || 0,
                lastCheck: new Date().toISOString(),
                poolStatus: 'healthy'
            }

            // Warning thresholds
            const usagePercent = (this.stats.busyConnections / Math.max(this.stats.totalConnections, 1)) * 100
            
            if (usagePercent > 80) {
                this.stats.poolStatus = 'warning'
                this.stats.warnings++
                
                // Log warning every 5 minutes to avoid spam
                if (this.stats.warnings % 10 === 1) {
                    logConsole(`⚠️  Pool usage high: ${usagePercent.toFixed(1)}% (${this.stats.busyConnections}/${this.stats.totalConnections})`)
                }
            }

            if (this.stats.busyConnections >= this.stats.totalConnections && this.stats.totalConnections > 0) {
                this.stats.poolStatus = 'exhausted'
                errorConsole('🚨 Pool exhausted! All connections in use.')
            }

        } catch (error) {
            this.stats.errors.push({
                timestamp: new Date().toISOString(),
                error: error.message
            })
            // Keep only last 10 errors
            if (this.stats.errors.length > 10) {
                this.stats.errors = this.stats.errors.slice(-10)
            }
        }
    }

    getStats() {
        return this.stats
    }
}

// create pool with validation
exports.initialize = async function initialize(customConfig) {
    try {
        const config = customConfig || dbconfig
        
        // Validate required config
        if (!config.user || !config.password || !config.connectString) {
            throw new Error('Missing required database configuration: user, password, or connectString')
        }
        
        logConsole('Attempting to create pool: ' + config.poolAlias);
        await oracledb.createPool(config);
        logConsole('Pool created: ' + config.poolAlias);
        
        // Start built-in monitoring if enabled
        if (enableMonitoring) {
            poolMonitor = new BuiltInPoolMonitor(config.poolAlias, monitoringInterval)
            poolMonitor.start()
        }
        
    } catch (err) {
        errorConsole('Error creating pool: ' + err.message);
        throw new Error(err.message);
    }
};

// close pool
exports.close = async function close() {
    // Stop monitoring before closing
    if (poolMonitor) {
        poolMonitor.stop()
        poolMonitor = null
    }
    await oracledb.getPool().close(poolClosingTime)
}

// Get pool statistics (NEW FEATURE)
exports.getPoolStats = function() {
    if (poolMonitor) {
        return poolMonitor.getStats()
    }
    return {
        monitoring: false,
        message: 'Pool monitoring is disabled. Set ORACLE_POOL_MONITORING=true to enable.'
    }
}

// single query - IMPROVED with proper connection management
exports.oraexec = async function(sql, param = {}, poolAlias = 'default') {
    // Input validation
    if (!sql || typeof sql !== 'string') {
        throw new Error('SQL query is required and must be a string')
    }

    const pool = oracledb.getPool(poolAlias)
    let connection

    try {
        connection = await pool.getConnection()
        
        // Log SQL in development
        if (['dev', 'devel', 'development'].includes(env)) {
            const bindings = queryBindToString(sql, param)
            sqlLogConsole(bindings)
        }

        const result = await connection.execute(sql, param, {
            outFormat: oracledb.OBJECT,
            autoCommit: true
        })

        return result
    } catch (error) {
        // Enhanced error logging
        errorConsole('Oracle execution error: ' + error.message)
        throw error
    } finally {
        // GUARANTEED connection cleanup
        if (connection) {
            try {
                await connection.close()
            } catch (closeError) {
                errorConsole('Error closing connection: ' + closeError.message)
            }
        }
    }
}

// multi query - IMPROVED with proper transaction management
exports.oraexectrans = async function(queries, poolAlias = 'default') {
    // Input validation
    if (!Array.isArray(queries) || queries.length === 0) {
        throw new Error('Queries must be a non-empty array')
    }

    const pool = oracledb.getPool(poolAlias)
    let connection

    try {
        connection = await pool.getConnection()
        const results = []

        // Process each query in the transaction
        for (let i = 0; i < queries.length; i++) {
            const query = queries[i]
            
            if (!query.query || typeof query.query !== 'string') {
                throw new Error(`Query at index ${i} is invalid`)
            }

            const sql = query.query
            const param = query.parameters || {}

            // Log SQL in development
            if (['dev', 'devel', 'development'].includes(env)) {
                const bindings = queryBindToString(sql, param)
                sqlLogConsole(bindings)
            }

            const result = await connection.execute(sql, param, {
                outFormat: oracledb.OBJECT,
                autoCommit: false
            })
            
            results.push({
                queryid: i,
                results: result
            })
        }

        // Commit all queries
        await connection.commit()
        if (['dev', 'devel', 'development'].includes(env)) {
            sqlLogConsole('Transaction committed')
        }
        
        return results

    } catch (error) {
        // Rollback on error
        if (connection) {
            try {
                await connection.rollback()
                if (['dev', 'devel', 'development'].includes(env)) {
                    sqlLogConsole('Transaction rolled back due to error')
                }
            } catch (rollbackError) {
                errorConsole('Rollback error: ' + rollbackError.message)
            }
        }
        throw error
    } finally {
        // GUARANTEED connection cleanup
        if (connection) {
            try {
                await connection.close()
            } catch (closeError) {
                errorConsole('Error closing connection: ' + closeError.message)
            }
        }
    }
}

// Manual transaction - IMPROVED with proper session management
exports.begintrans = async function(poolAlias = 'default') {
    const pool = oracledb.getPool(poolAlias)
    
    try {
        const connection = await pool.getConnection()
        
        if (['dev', 'devel', 'development'].includes(env)) {
            sqlLogConsole('Transaction session started')
        }
        
        return connection
    } catch (error) {
        errorConsole('Error starting transaction: ' + error.message)
        throw error
    }
}

// Execute with manual session - IMPROVED
exports.exectrans = async function(connection, sql, param = {}) {
    // Input validation
    if (!connection) {
        throw new Error('Connection is required')
    }
    if (!sql || typeof sql !== 'string') {
        throw new Error('SQL query is required and must be a string')
    }

    try {
        if (['dev', 'devel', 'development'].includes(env)) {
            const bindings = queryBindToString(sql, param)
            sqlLogConsole(bindings)
        }

        const result = await connection.execute(sql, param, {
            outFormat: oracledb.OBJECT,
            autoCommit: false
        })

        return result
    } catch (error) {
        errorConsole('Transaction execution error: ' + error.message)
        throw error
    }
}

// Commit transaction - IMPROVED
exports.committrans = async function(connection) {
    if (!connection) {
        throw new Error('Connection is required')
    }

    try {
        await connection.commit()
        
        if (['dev', 'devel', 'development'].includes(env)) {
            sqlLogConsole('Transaction committed')
        }
    } catch (error) {
        errorConsole('Commit error: ' + error.message)
        throw error
    } finally {
        try {
            await connection.close()
        } catch (closeError) {
            errorConsole('Error closing connection after commit: ' + closeError.message)
        }
    }
}

// Rollback transaction - IMPROVED
exports.rollbacktrans = async function(connection) {
    if (!connection) {
        throw new Error('Connection is required')
    }

    try {
        await connection.rollback()
        
        if (['dev', 'devel', 'development'].includes(env)) {
            sqlLogConsole('Transaction rolled back')
        }
    } catch (error) {
        errorConsole('Rollback error: ' + error.message)
        throw error
    } finally {
        try {
            await connection.close()
        } catch (closeError) {
            errorConsole('Error closing connection after rollback: ' + closeError.message)
        }
    }
}
