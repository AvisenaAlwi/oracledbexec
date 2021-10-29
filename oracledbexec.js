const oracledb = require('oracledb')
const { queryBindToString } = require('bind-sql-string')
const { sqlLogConsole } = require('@thesuhu/colorconsole')
const env = process.env.NODE_ENV || 'dev'

const dbconfig = {
    user: process.env.ORA_USR || 'hr',
    password: process.env.ORA_PWD || 'hr',
    connectString: process.env.ORA_CONSTR || 'localhost:1521/XEPDB1'
}

// single query
exports.oraexec = function (sql, param) {
    return new Promise((resolve, reject) => {
        oracledb.getConnection(dbconfig, function (err, connection) {
            if (err) {
                reject(err)
                return
            }

            let bindings = queryBindToString(sql, param)
            if (env === 'dev') {
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
exports.oraexectrans = function (queries) {
    var paramCount = queries.length - 1
    return new Promise((resolve, reject) => {
        var ressql = []
        oracledb.getConnection(dbconfig, function (err, connection) {
            if (err) {
                reject(err)
                return
            }

            function running(count) {
                if (count <= paramCount && count > -1) {
                    var query = queries[count]
                    var sql = query.query
                    var param = query.parameters

                    let bindings = queryBindToString(sql, param)
                    if (env === 'dev') {
                        sqlLogConsole(bindings)
                    }

                    var queryId = count
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
    }, function (err, result) {
        if (err) {
            connection.rollback()
            connection.close()
            if (env === 'dev') {
                sqlLogConsole('rollback')
            }
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
    if (env === 'dev') {
        sqlLogConsole('commit')
    }
    connection.commit()
    connection.close()
}