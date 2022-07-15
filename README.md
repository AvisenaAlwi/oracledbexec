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

ORA_USR: the database user name. (default: `hr`)
ORA_PWD: the password of the database user. (default: `hr`)
ORA_CONSTR: connection string `<host>:<port>/<service name>`. (default: `localhost:1521/XEPDB1`)
POOL_MIN: the number of connections initially created. (default: `10`)
POOL_MAX: the maximum number of connections. (default: `10`)
POOL_INCREMENT: the number of connections that are opened whenever a connection request exceeds the number of currently open connections. (default: `0`)
POOL_ALIAS: is used to explicitly add pools to the connection pool cache. (default: `default`)

# Usage

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
    poolAlias: 'default'
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
    queries.push({query: `INSERT INTO countries VALUES (:nama)`, parameters: {country_id: 'ID', country_name: 'Indonesia'}})
    queries.push({query: `INSERT INTO countries VALUES (:nama)`, parameters: {country_id: 'JP', country_name: 'Japan'}})
    queries.push({query: `INSERT INTO countries VALUES (:nama)`, parameters: {country_id: 'CN', country_name: 'China'}})
    await oraexectrans(queries)
} catch (err) {
    console.log(err.message)
}
```

Same as `oraexec`, you can pass the pool alias parameter behind.

```js
let result = await oraexectrans(queries, 'hrpool')
```

If you find this useful, please ⭐ the repository. Any feedback is welcome. 

You can contribute or you want to, feel free to [__Buy me a coffee! :coffee:__](https://saweria.co/thesuhu), I will be really thankfull for anything even if it is a coffee or just a kind comment towards my work, because that helps me a lot.

## License

[MIT](https://github.com/thesuhu/oracledbexec/blob/master/LICENSE)
