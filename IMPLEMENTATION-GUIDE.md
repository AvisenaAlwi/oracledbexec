# Panduan Implementasi Oracle Database dengan Library oracledbexec

## 🚀 Quick Start Guide

### 1. Install Library
```bash
npm install oracledbexec --save
```

### 2. Setup Environment Variables
Buat file `.env` di root project:
```bash
# Database Configuration (REQUIRED)
ORA_USR=your_username
ORA_PWD=your_password  
ORA_CONSTR=127.0.0.1:1521/SERVICE_NAME

# Production-Optimized Pool Settings
POOL_MIN=2
POOL_MAX=8
POOL_INCREMENT=1
POOL_PING_INTERVAL=30
POOL_TIMEOUT=120
QUEUE_MAX=50
QUEUE_TIMEOUT=5000

# Enable Built-in Monitoring (RECOMMENDED)
ORACLE_POOL_MONITORING=true
ORACLE_MONITOR_INTERVAL=30000

# Oracle Client Mode
THIN_MODE=true
```

### 3. Initialize Database in app.js
```javascript
const oracledbexec = require('oracledbexec')
const { oraexec } = require('oracledbexec')

// Initialize database pool (reads from environment variables)
oracledbexec.initialize()

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...')
    try {
        await oracledbexec.close()
        console.log('Database pool closed')
    } catch (err) {
        console.error('Error closing pool:', err.message)
    }
    process.exit(0)
})

process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down...')
    try {
        await oracledbexec.close()
        console.log('Database pool closed')
    } catch (err) {
        console.error('Error closing pool:', err.message)
    }
    process.exit(0)
})
```

## 📊 Production Monitoring Setup

### 1. Add Health Check Endpoints
```javascript
// Pool statistics endpoint
app.get('/api/pool-stats', (req, res) => {
    try {
        const stats = oracledbexec.getPoolStats()
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            poolStats: stats
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        })
    }
})

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        // Quick database test
        const result = await oraexec('SELECT 1 as test FROM DUAL', {})
        const stats = oracledbexec.getPoolStats()
        
        res.json({
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: {
                connected: true,
                testQuery: result.rows[0].TEST === 1
            },
            pool: stats
        })
    } catch (error) {
        res.status(503).json({
            success: false,
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        })
    }
})
```

### 2. Monitor Console Logs
Library akan otomatis log monitoring info:
```
🔍 Pool monitoring enabled for: default
⚠️  Pool usage high: 85.5% (7/8)
🚨 Pool exhausted! All connections in use.
```

## 💡 Usage Examples

### Single Query
```javascript
const { oraexec } = require('oracledbexec')

try {
    const sql = 'SELECT * FROM users WHERE id = :id'
    const params = { id: 123 }
    const result = await oraexec(sql, params)
    console.log(result.rows)
} catch (error) {
    console.error('Query failed:', error.message)
}
```

### Transaction (Multiple Queries)
```javascript
const { oraexectrans } = require('oracledbexec')

try {
    const queries = [
        {
            query: 'INSERT INTO users VALUES (:id, :name)',
            parameters: { id: 1, name: 'John' }
        },
        {
            query: 'INSERT INTO logs VALUES (:user_id, :action)',
            parameters: { user_id: 1, action: 'created' }
        }
    ]
    
    await oraexectrans(queries)
    console.log('Transaction completed successfully')
} catch (error) {
    console.error('Transaction failed, rolled back:', error.message)
}
```

### Manual Transaction Control
```javascript
const { begintrans, exectrans, committrans, rollbacktrans } = require('oracledbexec')

let session
try {
    session = await begintrans()
    
    // Execute queries
    const result1 = await exectrans(session, 'SELECT balance FROM accounts WHERE id = :id', {id: 1})
    const balance = result1.rows[0].BALANCE
    
    if (balance >= 1000) {
        await exectrans(session, 'UPDATE accounts SET balance = balance - 1000 WHERE id = :id', {id: 1})
        await exectrans(session, 'INSERT INTO transactions VALUES (:id, :amount)', {id: 1, amount: -1000})
        await committrans(session)
        console.log('Transaction committed')
    } else {
        await rollbacktrans(session)
        console.log('Insufficient balance, transaction rolled back')
    }
} catch (error) {
    if (session) await rollbacktrans(session)
    console.error('Transaction error:', error.message)
}
```

## 🔧 Development Testing

### Create test-db.js for Connection Testing
```javascript
require('dotenv').config()

// Clear Oracle environment variables
delete process.env.ORACLE_HOME
delete process.env.TNS_ADMIN
delete process.env.TWO_TASK
delete process.env.ORACLE_SID

const { oraexec } = require('oracledbexec')
const oracledbexec = require('oracledbexec')

async function testConnection() {
    try {
        console.log('=== Testing Database Connection ===')
        await oracledbexec.initialize()
        
        const result = await oraexec('SELECT SYSDATE as current_time, USER as current_user FROM DUAL', {})
        console.log('✅ Connection successful')
        console.log('Database time:', result.rows[0].CURRENT_TIME)
        console.log('Current user:', result.rows[0].CURRENT_USER)
        
    } catch (error) {
        console.error('❌ Connection failed:', error.message)
        
        // Troubleshooting hints
        if (error.message.includes('NJS-510')) {
            console.error('💡 HINT: Check network connectivity or SSH tunnel')
        } else if (error.message.includes('ORA-01017')) {
            console.error('💡 HINT: Check username/password')
        }
    } finally {
        try {
            await oracledbexec.close()
        } catch (err) {
            console.error('Error closing pool:', err.message)
        }
        process.exit(0)
    }
}

testConnection()
```

Run test:
```bash
node test-db.js
```

## 🚀 Production Deployment

### 1. Environment Variables
```bash
# Production values
NODE_ENV=production
ORACLE_POOL_MONITORING=true

# Database settings
ORA_USR=prod_user
ORA_PWD=secure_password
ORA_CONSTR=prod-db-host:1521/PROD_SERVICE

# Optimized pool for production
POOL_MIN=2
POOL_MAX=8
POOL_INCREMENT=1
```

### 2. Process Manager (PM2)
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'myapp',
    script: './bin/www',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      ORACLE_POOL_MONITORING: 'true'
    }
  }]
}
```

### 3. Health Check Script
```bash
#!/bin/bash
# health-check.sh
HEALTH=$(curl -s http://localhost:3000/api/health)
STATUS=$(echo $HEALTH | jq -r '.status')

if [ "$STATUS" != "healthy" ]; then
    echo "$(date): Application unhealthy"
    # Send alert or restart application
    # pm2 restart myapp
fi
```

### 4. Log Monitoring
```bash
# Monitor for critical events
tail -f /var/log/myapp.log | grep -E "Pool exhausted|⚠️|🚨|Error:"

# Or use logrotate for log management
sudo logrotate -f /etc/logrotate.d/myapp
```

## 📋 Troubleshooting Checklist

### Connection Issues
- [ ] Check environment variables
- [ ] Verify database service is running
- [ ] Test network connectivity
- [ ] Check SSH tunnel (if used)
- [ ] Validate connection string format

### Pool Issues
- [ ] Monitor pool usage with `/api/pool-stats`
- [ ] Check for connection leaks
- [ ] Verify pool configuration
- [ ] Review application logs

### Performance Issues
- [ ] Monitor response times
- [ ] Check database performance
- [ ] Review slow queries
- [ ] Verify pool sizing

## 🎯 Best Practices

### Security
- ✅ Use environment variables for credentials
- ✅ Enable SSL/TLS for database connections
- ✅ Implement proper error handling
- ✅ Don't log sensitive data

### Performance
- ✅ Use connection pooling (enabled by default)
- ✅ Implement proper transaction management
- ✅ Monitor pool usage regularly
- ✅ Use prepared statements with parameters

### Monitoring
- ✅ Enable built-in monitoring in production
- ✅ Set up health check endpoints
- ✅ Monitor application logs
- ✅ Implement alerting for critical issues

### Error Handling
- ✅ Always use try-catch blocks
- ✅ Implement proper cleanup in finally blocks
- ✅ Log errors with context
- ✅ Provide meaningful error messages to users

## 📞 Support

Jika mengalami issues:
1. Check library documentation
2. Review troubleshooting guide
3. Enable debug logging
4. Check GitHub issues
5. Create detailed bug report with logs

---

**Library Version**: 1.8.1+
**Last Updated**: August 2025
