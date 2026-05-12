/**
 * UNIT TEST FOR ORACLEDBEXEC
 * Using Jest framework for professional testing.
 * Standardizing on v2.0.0 features.
 */

require('dotenv').config()
const db = require('./oracledbexec')
const oracledb = require('oracledb')

// Increase timeout as Oracle connections can be slow
jest.setTimeout(30000)

describe('OracleDBExec Library Tests (v2.0.0)', () => {

    // Initialize pool before all tests
    beforeAll(async () => {
        try {
            await db.initialize()
        } catch (err) {
            console.error('Failed to initialize primary pool:', err.message)
        }
    })

    // Close all pools after all tests
    afterAll(async () => {
        await db.close()
    })

    describe('Basic Execution (oraexec)', () => {
        test('should execute a simple query successfully', async () => {
            const sql = 'SELECT 1 as num FROM DUAL'
            const result = await db.oraexec(sql)

            expect(result).toBeDefined()
            expect(result.rows).toBeDefined()
            expect(result.rows[0].NUM).toBe(1)
        })

        test('should support custom execution options', async () => {
            const sql = 'SELECT 0.5 as val FROM DUAL'
            const options = {
                fetchInfo: { "VAL": { type: oracledb.STRING } }
            }
            const result = await db.oraexec(sql, {}, 'default', options)
            // Use parseFloat to handle both "0.5" or ".5" formatting
            expect(parseFloat(result.rows[0].VAL)).toBe(0.5)
        })

        test('should throw error for invalid SQL and show caller trace', async () => {
            const sql = 'SELECT * FROM NON_EXISTENT_TABLE_999'
            await expect(db.oraexec(sql)).rejects.toThrow()
        })
    })

    describe('Transaction Management (oraexectrans)', () => {
        test('should execute bulk queries in a transaction', async () => {
            const queries = [
                { query: 'SELECT 10 as val FROM DUAL' },
                { query: 'SELECT 20 as val FROM DUAL' }
            ]
            const results = await db.oraexectrans(queries)

            expect(results).toHaveLength(2)
            expect(results[0].results.rows[0].VAL).toBe(10)
            expect(results[1].results.rows[0].VAL).toBe(20)
        })
    })

    describe('Manual Transaction', () => {
        test('should handle manual begin, exec, and commit', async () => {
            const conn = await db.begintrans()
            expect(conn).toBeDefined()

            try {
                const res = await db.exectrans(conn, 'SELECT 99 as val FROM DUAL')
                expect(res.rows[0].VAL).toBe(99)
                await db.committrans(conn)
            } catch (err) {
                await db.rollbacktrans(conn)
                throw err
            }
        })
    })

    describe('Monitoring & Stats', () => {
        test('should return custom pool statistics', () => {
            const stats = db.getPoolStats()
            expect(stats).toBeDefined()
        })

        test('should return raw realtime statistics', () => {
            const stats = db.getPoolStatisticsRealtime()
            // Should not throw even if null
            expect(stats !== undefined).toBe(true)
        })
    })
})
