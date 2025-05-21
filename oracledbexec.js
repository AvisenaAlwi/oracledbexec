const oracledb              = require('oracledb')
const { queryBindToString } = require('bind-sql-string')
const {
    logConsole: logConsoleDefault,
    errorConsole,
    sqlLogConsole: sqlLogConsoleDefault
} = require('@thesuhu/colorconsole');
const { resolve } = require('path');

const pools = new Map();
let logEnable = true;

const logConsole = (message) => {
    if (logEnable)
        logConsoleDefault(message);
}
const sqlLogConsole = (message) => {
    if (logEnable)
        sqlLogConsoleDefault(message);
}

const thinMode = process.env.THIN_MODE || 'true'
if (thinMode === 'false') {
    const icExists = require('fs').existsSync(process.env.ORACLE_LIB_DIR ?? null)
    if (!icExists)
        throw new Error('When using thick mode, the ORACLE_LIB_DIR environment variable must point to the Instant Client path.')
    oracledb.initOracleClient({ libDir: process.env.ORACLE_LIB_DIR });
}
const env             = process.env.NODE_ENV || 'dev'
const poolClosingTime = process.env.POOL_CLOSING_TIME || 0  // 0 = force close, use 10 (seconds) to avoid force close

const dbconfig = {
    user            : process.env.ORA_USR || 'hr',
    password        : process.env.ORA_PWD || 'hr',
    connectString   : process.env.ORA_CONSTR || 'localhost:1521/XEPDB1',
    poolMin         : parseInt(process.env.POOL_MIN, 10) || 10,             // minimum pool size
    poolMax         : parseInt(process.env.POOL_MAX, 10) || 10,             // maximum pool size
    poolIncrement   : parseInt(process.env.POOL_INCREMENT, 10) || 0,        // 0 = pool is not incremental
    poolAlias       : process.env.POOL_ALIAS || 'default',                  // optional pool alias
    poolPingInterval: parseInt(process.env.POOL_PING_INTERVAL, 10) || 60,   // check aliveness of connection if idle in the pool for 60 seconds
    queueMax        : parseInt(process.env.QUEUE_MAX, 10) || 500,           // don't allow more than 500 unsatisfied getConnection() calls in the pool queue
    queueTimeout    : parseInt(process.env.QUEUE_TIMEOUT, 10) || 60000,     // terminate getConnection() calls queued for longer than 60000 milliseconds

}

const defaultThreadPoolSize = 4                                         // default thread pool size
process.env.UV_THREADPOOL_SIZE = dbconfig.poolMax + defaultThreadPoolSize  // Increase thread pool size by poolMax

exports.enableLogConsole = (boolean) => {
    logEnable = boolean == 'true' || boolean === true || boolean === 1 || boolean === '1'
}

/**
 * Create new pool
 * @param { import('oracledb').PoolAttributes } customConfig - Pool Attributes
 */
exports.initialize = async function initialize(customConfig) {
    try {
        logConsole('Attempting to create pool: ' + (customConfig ? customConfig.poolAlias : dbconfig.poolAlias));
        let pool = null
        if (customConfig) {
            pool = await oracledb.createPool(customConfig);
            logConsole('Pool created: ' + customConfig.poolAlias);
        } else {
            pool = await oracledb.createPool(dbconfig);
            logConsole('Pool created: ' + dbconfig.poolAlias);
        }
        if ((customConfig || dbconfig).poolAlias)
            pools.set((customConfig || dbconfig).poolAlias, pool)
    } catch (err) {
        errorConsole('Error creating pool: ' + err.message);
        throw new Error(err.message);
    }
};

/**
 * Close Pool
 * @param { string } poolAlias - DB Pool Alias
 * @returns { Promise }
 */
exports.close = async function close(poolAlias = null) {
    if (poolAlias === null) {
        for ( const pool of Array.from(pools.values()) ) {
            await pool.close(poolClosingTime)
            logConsole(`Pool closed: ${pool.poolAlias}`)
        }
        return
    }
    await (oracledb.getPool(poolAlias))?.close(poolClosingTime)
    logConsole(`Pool closed: ${poolAlias}`)
}

/**
 * Run SQL query
 * @param { string } sql - SQL Query
 * @param { object | null } param - Object of query binding
 * @param { string } poolAlias - Pool alias
 * @param { import('oracledb').ExecuteOptions } options
 * @param { { log: boolean } } customOption - Custom option
 * @returns { Promise<import('oracledb').Result> } - OracleDb Result
 */
exports.oraexec = function (sql, param = {}, poolAlias, options = {}, customOption) {
    const { log = true } = customOption ?? {}
    param                = param || {}
    options              = options || {}
    return new Promise((resolve, reject) => {
        let pool
        if (poolAlias) {
            pool = oracledb.getPool(poolAlias)
        } else {
            pool = oracledb.getPool('default')
        }
        pool.getConnection((err, connection) => {
            if (err) {
                reject(err)
                return
            }

            let bindings = queryBindToString(sql, param)
            if (log && env.includes('dev', 'devel', 'development')) {
                sqlLogConsole(bindings)
            }

            connection.execute(sql, param, {
                outFormat: oracledb.OBJECT,
                autoCommit: true,
                ...options
            }, function (err, result) {
                if (err) {
                    connection.close()
                    reject(err)
                    return
                }
                connection.close()
                resolve(result)
            })
        })
    })
}

/**
 * Run multiple query at once within transaction
 * @param { Array<{ query: string, parameters: object }> } queries - Array of SQL query
 * @param { string } poolAlias - Pool alias
 * @param { { log: boolean } } customOption - Custom option
 * @returns { Promise< import('oracledb').Result > } - OracleDB Result
 */
exports.oraexectrans = function (queries, poolAlias, customOption) {
    const { log = true } = customOption ?? {}
    let paramCount = queries.length - 1
    return new Promise((resolve, reject) => {
        let pool
        if (poolAlias) {
            pool = oracledb.getPool(poolAlias)
        } else {
            pool = oracledb.getPool('default')
        }
        let ressql = []
        pool.getConnection((err, connection) => {
            if (err) {
                reject(err)
                return
            }
            function running(count) {
                if (count <= paramCount && count > -1) {
                    let query = queries[count]
                    let sql   = query.query
                    let param = query.parameters || {}

                    let bindings = queryBindToString(sql, param)
                    if (log && env.includes('dev', 'devel', 'development')) {
                        sqlLogConsole(bindings)
                    }

                    let queryId = count
                    prosesSQL(connection, sql, param, resolve, reject, ressql, queryId, () => {
                        running(count + 1)
                    }, { log: log})
                } else {
                    completeSQL(connection)
                    resolve(ressql)
                }
            }
            running(0)
        })
    })
}

/**
 * Process SQL Query
 * @param { import('oracledb').Connection } connection - DB Connection
 * @param { string } sql - SQL Query
 * @param { object | null } param - Object
 * @param { (object) => void } resolve - Resolve
 * @param { (object) => void } reject - Reject
 * @param { Array< { queryid: number, results: Array< import('oracledb').Result >} > } ressql
 * @param { number } queryId - Query Id
 * @param { () => void } callback - Callback
 * @param { { log: boolean } } customOption - Custom option
 */
function prosesSQL(connection, sql, param, resolve, reject, ressql, queryId, callback, customOption) {
    const { log = true } = customOption ?? {}
    param = param || {}
    connection.execute(sql, param, {
        outFormat: oracledb.OBJECT,
        autoCommit: false
    }, (err, result) => {
        if (err) {
            connection.rollback()
            connection.close()
            if (log)
                sqlLogConsole('rollback')
            reject({
                message: err.message
            })
            return
        }
        ressql[queryId] = {
            queryid: queryId,
            results: result
        }
        callback()
    })
}

/**
 * Commits the current transaction on the provided Oracle database connection,
 * logs the commit action, and then closes the connection.
 *
 * @param { import('oracledb').Connection } connection - The Oracle database connection object.
 * @param { { log: boolean } } customOption - Custom option
 */
function completeSQL(connection, customOption) {
    const { log = true } = customOption ?? {}
    if (log)
        sqlLogConsole('commit')
    connection?.commit()
    connection?.close()
}

/**
 * Begin transaction
 * @param { string } poolAlias - Pool Alias
 * @param { { log: boolean } } customOption - Custom option
 * @returns { Promise< import('oracledb').Connection > } - Connection Open
 */
exports.begintrans = function (poolAlias, customOption) {
    const { log = true } = customOption ?? {}
    return new Promise((resolve, reject) => {
        let pool
        if (poolAlias) {
            pool = oracledb.getPool(poolAlias)
        } else {
            pool = oracledb.getPool('default')
        }
        pool.getConnection((err, connection) => {
            if (err) {
                reject(err)
                return
            }

            let bindings = 'begin transaction'
            if (log && env.includes('dev', 'devel', 'development')) {
                sqlLogConsole(bindings)
            }
            resolve(connection);
        })

    })
}

/**
 * Execute SQL within DB transaction
 * @param { import('oracledb').Connection } connection - OracleDB Connection
 * @param { string } sql - SQL Query
 * @param { object } param - Bind Parameter
 * @param {{ log: boolean }} customOption - Custom option
 * @returns { Promise< import('oracledb').Result > } - Promise of result
 */
exports.exectrans = function (connection, sql, param, customOption) {
    const { log = true } = customOption ?? {}
    return new Promise((resolve, reject) => {
        let bindings = queryBindToString(sql, param)
        if (log && env.includes('dev', 'devel', 'development')) {
            sqlLogConsole(bindings)
        }

        connection.execute(sql, param, {
            outFormat: oracledb.OBJECT,
            autoCommit: false
        }, function (err, result) {
            if (err) {
                connection.rollback()
                connection.close()

                if (log && env.includes('dev', 'devel', 'development')) {
                    sqlLogConsole('rollback transction')
                }

                reject({
                    message: err.message
                })
                return
            }
            resolve(result)
        })
    })
}

/**
 * Commit transaction
 * @param { import('oracledb').Connection } connection - OracleDB Open Connection
 * @returns { Promise } - Promise of result
 */
exports.committrans = function (connection, customOption) {
    const { log = true } = customOption ?? {}
    return new Promise((resolve) => {
        connection.commit()
        let bindings = 'commit transaction'

        if (log && env.includes('dev', 'devel', 'development')) {
            sqlLogConsole(bindings)
        }
        connection.close()
        resolve()
    })
}

/**
 * Rollback Transaction
 * @param { import('oracledb').Connection } connection - OracleDB Open Connection
 * @returns { Promise } - Promise of result
 */
exports.rollbacktrans = function (connection, customOption) {
    const { log = true } = customOption ?? {}
    return new Promise((resolve) => {
        connection.rollback()
        let bindings = 'rollback transaction'

        if (log && env.includes('dev', 'devel', 'development')) {
            sqlLogConsole(bindings)
        }
        connection.close()
        resolve()
    })
}


/**
 *
 * @param { string } poolAlias - DB Pool Alias
 * @returns { import('oracledb').Statistics } - Statistics
 */
exports.getPoolStatistic = (poolAlias = 'default') => {
    return oracledb.getPool(poolAlias).getStatistics()
}


/**
 * Convert stream into string
 * @param { Stream } - Stream input
 * @returns { Promise< string > }
 */
streamToString = (stream) => {
  return new Promise((resolve, reject) => {
    let data = '';
    stream.setEncoding('utf8');

    stream.on('data', chunk => data += chunk);
    stream.on('end', () => resolve(data));
    stream.on('error', reject);
  });
};

/**
 * Read clob object into string
 * @param { * } - Clob
 * @returns { Promise< string > }
 */
readClobValue = async (clob) => {
  if (clob === null) return null;
  if (typeof clob === 'string') return clob;
  const content = await streamToString(clob);
  clob.destroy?.();
  return content;
};



/**
 * Execute SQL with CLOB column reading support
 * @param { string } query - SQL Query
 * @param { object | null} params - Binding parameter
 * @param { Array<string> } clobColumnNames - Array of CLOB column names
 * @param { import('oracledb').ExecuteOptions } options
 * @param { string } poolAlias - Pool alias
 * @param { { log: boolean } } customOption - Custom option
 * @returns { Promise< import('oracledb').Result > }
 *
 * @example
 *      oraexecAndReadClob('SELECT * FROM BLOGS FETCH FIRST 1 ROWS ONLY', {}, ['CONTENT'])
 *          .then((r) => {
 *              this.result = r.rows;
 *          })
 *          .catch((err) => {
 *          })
 */
exports.oraexecAndReadClob = async (query, params, clobColumnNames = [], options, poolAlias, customOption) => {
    options              = options || {}
    poolAlias            = poolAlias || 'default'
    const { log = true } = customOption ?? {}
    return new Promise((resolve, reject) => {
        const pool           = oracledb.getPool(poolAlias)

        pool.getConnection((err, connection) => {
            if (err) {
                reject(err)
                return
            }

            let bindings = queryBindToString(query, params)
            if (log && env.includes('dev', 'devel', 'development')) {
                sqlLogConsole(bindings)
            }

            connection.execute(query, params, {
                outFormat : oracledb.OBJECT,
                autoCommit: true,
                ...options
            }).then((queryResult) => {
                clobColumnNames   = clobColumnNames.map(name => `${name}`.toUpperCase())
                Promise.all(
                    queryResult.rows.map(async row => {
                        for (const clobColumnName of clobColumnNames) {
                            if (!Object.keys(row).includes(clobColumnName))
                            throw new Error(`Column ${clobColumnName} tidak ditemukan dalam hasil query`)
                            row[clobColumnName] = await readClobValue(row[clobColumnName])
                        }
                        return row
                    }),
                )
                .then((result) => {
                    resolve({
                        implicitResults: queryResult.implicitResults,
                        lastRowid      : queryResult.lastRowid,
                        metaData       : queryResult.metaData,
                        outBinds       : queryResult.outBinds,
                        resultSet      : queryResult.resultSet,
                        rows           : result,
                        rowsAffected   : queryResult.rowsAffected,
                        warning        : queryResult.warning
                    });
                })
                .finally(() => {
                    connection.close();
                });
            })
            .catch((err) => {
                connection.close();
                reject(err)
            })
        })
    })
};
