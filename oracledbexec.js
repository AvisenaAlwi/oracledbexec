const oracledb = require('oracledb')
const thinMode = process.env.THIN_MODE || 'true'
if (thinMode === 'false') {
    oracledb.initOracleClient()
}
const { queryBindToString } = require('bind-sql-string')
const { logConsole, errorConsole, sqlLogConsole } = require('@thesuhu/colorconsole')
const env = process.env.NODE_ENV || 'dev'
const poolClosingTime = process.env.POOL_CLOSING_TIME || 0 // 0 = force close, use 10 (seconds) to avoid force close

const dbconfig = {
    user: process.env.ORA_USR || 'hr',
    password: process.env.ORA_PWD || 'hr',
    connectString: process.env.ORA_CONSTR || 'localhost:1521/XEPDB1',
    poolMin: parseInt(process.env.POOL_MIN, 10) || 10, // minimum pool size
    poolMax: parseInt(process.env.POOL_MAX, 10) || 10, // maximum pool size
    poolIncrement: parseInt(process.env.POOL_INCREMENT, 10) || 0, // 0 = pool is not incremental
    poolAlias: process.env.POOL_ALIAS || 'default', // optional pool alias
    poolPingInterval: parseInt(process.env.POOL_PING_INTERVAL, 10) || 60, // check aliveness of connection if idle in the pool for 60 seconds
    queueMax: parseInt(process.env.QUEUE_MAX, 10) || 500, // don't allow more than 500 unsatisfied getConnection() calls in the pool queue
    queueTimeout: parseInt(process.env.QUEUE_TIMEOUT, 10) || 60000, // terminate getConnection() calls queued for longer than 60000 milliseconds
}

const defaultThreadPoolSize = 4 // default thread pool size
process.env.UV_THREADPOOL_SIZE = dbconfig.poolMax + defaultThreadPoolSize // Increase thread pool size by poolMax

// create pool
exports.initialize = async function initialize(customConfig) {
    try {
        logConsole('Attempting to create pool: ' + (customConfig ? customConfig.poolAlias : dbconfig.poolAlias));
        if (customConfig) {
            await oracledb.createPool(customConfig);
            logConsole('Pool created: ' + customConfig.poolAlias);
        } else {
            await oracledb.createPool(dbconfig);
            logConsole('Pool created: ' + dbconfig.poolAlias);
        }
    } catch (err) {
        errorConsole('Error creating pool: ' + err.message);
        throw new Error(err.message);
    }
};

// close pool
exports.close = async function close() {
    await oracledb.getPool().close(poolClosingTime)
}

// single query
exports.oraexec = function (sql, param, poolAlias) {
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
            if (env.includes('dev', 'devel', 'development')) {
                sqlLogConsole(bindings)
            }

            connection.execute(sql, param, {
                outFormat: oracledb.OBJECT,
                autoCommit: true
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

// multi query
exports.oraexectrans = function (queries, poolAlias) {
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
                    let sql = query.query
                    let param = query.parameters

                    let bindings = queryBindToString(sql, param)
                    if (env.includes('dev', 'devel', 'development')) {
                        sqlLogConsole(bindings)
                    }

                    let queryId = count
                    prosesSQL(connection, sql, param, resolve, reject, ressql, queryId, () => {
                        running(count + 1)
                    })
                } else {
                    completeSQL(connection)
                    resolve(ressql)
                }
            }
            running(0)
        })
    })
}

// proses query
function prosesSQL(connection, sql, param, resolve, reject, ressql, queryId, callback) {
    connection.execute(sql, param, {
        outFormat: oracledb.OBJECT,
        autoCommit: false
    }, (err, result) => {
        if (err) {
            connection.rollback()
            connection.close()
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

// commit
function completeSQL(connection) {
    sqlLogConsole('commit')
    connection.commit()
    connection.close()
}

// create session
exports.begintrans = function (poolAlias) {
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
            if (env.includes('dev', 'devel', 'development')) {
                sqlLogConsole(bindings)
            }
            resolve(connection);
        })

    })
}

// exec with manual session
exports.exectrans = function (connection, sql, param) {
    return new Promise((resolve, reject) => {
        let bindings = queryBindToString(sql, param)
        if (env.includes('dev', 'devel', 'development')) {
            sqlLogConsole(bindings)
        }

        connection.execute(sql, param, {
            outFormat: oracledb.OBJECT,
            autoCommit: false
        }, function (err, result) {
            if (err) {
                connection.rollback()
                connection.close()

                if (env.includes('dev', 'devel', 'development')) {
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

// commit and close session
exports.committrans = function (connection) {
    return new Promise((resolve) => {
        connection.commit()
        let bindings = 'commit transaction'

        if (env.includes('dev', 'devel', 'development')) {
            sqlLogConsole(bindings)
        }
        connection.close()
        resolve()
    })
}

// rollback and close session
exports.rollbacktrans = function (connection) {
    return new Promise((resolve) => {
        connection.rollback()
        let bindings = 'rollback transaction'

        if (env.includes('dev', 'devel', 'development')) {
            sqlLogConsole(bindings)
        }
        connection.close()
        resolve()
    })
}
