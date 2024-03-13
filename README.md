# oracledbexec

[![npm](https://img.shields.io/npm/v/oracledbexec.svg?style=flat-square)](https://www.npmjs.com/package/oracledbexec)
[![license](https://img.shields.io/github/license/thesuhu/oracledbexec?style=flat-square)](https://github.com/thesuhu/oracledbexec/blob/master/LICENSE)

Running Oracle queries made easier.

## Install

```sh
npm install oracledbexec --save
```

## Variables

This module will read seven environment variables. If it doesn't find the related environment variable it will read the default value. Or you can pass database configuration parameters when initializing the module.

* **ORA_USR**: the database user name. (default: `hr`)
* **ORA_PWD**: the password of the database user. (default: `hr`)
* **ORA_CONSTR**: connection string `<host>:<port>/<service name>`. (default: `localhost:1521/XEPDB1`)
* **POOL_MIN**: the number of connections initially created. (default: `10`)
* **POOL_MAX**: the maximum number of connections. (default: `10`)
* **POOL_INCREMENT**: the number of connections that are opened whenever a connection request exceeds the number of currently open connections. (default: `0`)
* **POOL_ALIAS**: is used to explicitly add pools to the connection pool cache. (default: `default`)
* **POOL_PING_INTERVAL**: check aliveness of connection if idle in the pool in seconds. (default: `60`)
* **QUEUE_MAX**: the maximum `getConnection()` calls in the pool queue. (default: `500`)
* **QUEUE_TIMEOUT**: terminate getConnection() calls queued for longer than 60000 milliseconds (default: `60000`)

## Usage

Initialize database in `index.js/app.js` file, to create connection pool and cache it.

```js
const oracledbexec = require('oracledbexec')

oracledbexec.initialize()
```

Or pass database configuration parameters.

```js
const oracledbexec = require('oracledbexec')

let dbconfig = {
    user: 'hr',
    password: 'hr',
    connectString: 'localhost:1521/XEPDB1',
    poolMin: 10,
    poolMax: 10,
    poolIncrement: 0,
    poolAlias: 'default',
    poolPingInterval: 60,
    queueMax: 500,
    queueTimeout: 60000,
}
oracledbexec.initialize(dbconfig)
```

Once initialized, you can use the main function of this module. The following is an example of executing a query statement:

```js
const { oraexec, oraexectrans } = require('oracledbexec')

try {
    let sql = `SELECT * FROM countries WHERE country_id = :country_id`
    let param = {country_id: 'JP'}
    let result = await oraexec(sql, param)
    console.log(result.rows)
} catch (err) {
    console.log(err.message)
}
```

If you want to call a specific pool, you can pass the pool alias parameter behind.

```js
let result = await oraexec(sql, param, 'hrpool')
```

For many sql statements, use the transaction function `oraexectrans`, so that if one sql statement fails, it will rollback.

```js
const { oraexec, oraexectrans } = require('oracledbexec')

try {
    let queries = []
    queries.push({query: `INSERT INTO countries VALUES (:country_id, :country_name)`, parameters: {country_id: 'ID', country_name: 'Indonesia'}})
    queries.push({query: `INSERT INTO countries VALUES (:country_id, :country_name)`, parameters: {country_id: 'JP', country_name: 'Japan'}})
    queries.push({query: `INSERT INTO countries VALUES (:country_id, :country_name)`, parameters: {country_id: 'CN', country_name: 'China'}})
    await oraexectrans(queries)
} catch (err) {
    console.log(err.message)
}
```

Same as `oraexec`, you can pass the pool alias parameter behind.

```js
let result = await oraexectrans(queries, 'hrpool')
```

In the above explanation, all sessions are created automatically. we simply call the method for query execution. If you want to handle separate sessions, follow these instructions.

If you to handle handle transactions that require a pause to retrieve variables from other tables. So, we have to manually create a new session for execution of transaction queries.

**Be careful**, if you use this method, don't forget to close the session under any circumstances or an orphan session occurs.

The sequence is to create a session, execute the query, and commit the session. here's an example:

```js
const { begintrans, exectrans, committrans, rollbacktrans } = require('oracledbexec')

try {
    let session = begintrans()

    let sql = `SELECT country_name FROM countries WHERE country_id=:country_id`
    let param = {country_id: 'ID'}
    let result = await exectrans(session, sql, param)

    sql = `INSERT INTO sometable VALUES (:name, :country_name)`
    param = {name: 'Some Name', country_name: results.rows[0].country_name}
    await exectrans(session, sql, param)

    await committrans(session)
} catch (err) {
    await rollbacktrans(session)
    console.log(err.message)
}
```

Of course, you can pass the pool alias parameter when create a session.

```js
let result = await begintrans('hrpool')
```

That's all.

If you find this useful, please ⭐ the repository. Any feedback is welcome.

You can contribute or you want to, feel free to [**Buy me a coffee! :coffee:**](https://saweria.co/thesuhu), I will be really thankfull for anything even if it is a coffee or just a kind comment towards my work, because that helps me a lot.

## License

[MIT](https://github.com/thesuhu/oracledbexec/blob/master/LICENSE)
