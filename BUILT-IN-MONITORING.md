# Built-in Pool Monitoring

## 🔍 Overview

Library oracledbexec v1.8.1+ includes built-in pool monitoring that automatically tracks connection pool health and provides real-time statistics.

## ⚙️ Configuration

### Environment Variables
```bash
# Enable monitoring (default: false)
ORACLE_POOL_MONITORING=true

# Monitor interval in milliseconds (default: 30000)
ORACLE_MONITOR_INTERVAL=30000
```

### Automatic Features
When enabled, monitoring provides:
- ✅ **Real-time pool statistics**
- ✅ **Automatic health checks every 30 seconds**
- ✅ **High usage warnings (>80%)**
- ✅ **Pool exhaustion alerts**
- ✅ **Error tracking and history**
- ✅ **Console logging with emoji indicators**

## 📊 Console Output

```
🔍 Pool monitoring enabled for: default
⚠️  Pool usage high: 85.5% (7/8)
🚨 Pool exhausted! All connections in use.
```

## 🔌 API Integration

### Get Pool Statistics
```javascript
const { getPoolStats } = require('oracledbexec')

const stats = getPoolStats()
console.log(stats)
```

### Response Format
```json
{
  "totalConnections": 3,
  "busyConnections": 1,
  "freeConnections": 2,
  "queuedRequests": 0,
  "lastCheck": "2025-08-13T10:30:00.000Z",
  "poolStatus": "healthy",
  "warnings": 0,
  "errors": []
}
```

### Pool Status Values
- **`healthy`** - Normal operation (< 80% usage)
- **`warning`** - High usage (80-99% usage)
- **`exhausted`** - All connections in use (100% usage)
- **`unknown`** - Monitoring not enabled or no data

## 🚨 Alert Thresholds

| Condition | Threshold | Action |
|-----------|-----------|--------|
| High Usage Warning | > 80% | Log warning every 5 minutes |
| Pool Exhaustion | 100% usage | Immediate alert |
| Connection Errors | Any error | Log to error array |

## 🎯 Production Usage

### Express.js Health Endpoint
```javascript
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
```

### Health Check with Database Test
```javascript
app.get('/api/health', async (req, res) => {
    try {
        const result = await oraexec('SELECT 1 as test FROM DUAL', {})
        const stats = oracledbexec.getPoolStats()
        
        res.json({
            success: true,
            status: 'healthy',
            database: { connected: true, testQuery: true },
            pool: stats
        })
    } catch (error) {
        res.status(503).json({
            success: false,
            status: 'unhealthy',
            error: error.message
        })
    }
})
```

## 📈 Monitoring Integration

### Prometheus Metrics
```javascript
const promClient = require('prom-client')
const { getPoolStats } = require('oracledbexec')

const poolGauge = new promClient.Gauge({
  name: 'oracle_pool_connections',
  help: 'Oracle connection pool statistics',
  labelNames: ['type']
})

setInterval(() => {
  const stats = getPoolStats()
  poolGauge.set({type: 'total'}, stats.totalConnections)
  poolGauge.set({type: 'busy'}, stats.busyConnections)
  poolGauge.set({type: 'free'}, stats.freeConnections)
}, 30000)
```

### External Monitoring
```bash
# Curl-based health check
curl -f http://localhost:3000/api/pool-stats || echo "Pool monitoring failed"

# Parse status for alerting
STATUS=$(curl -s http://localhost:3000/api/pool-stats | jq -r '.poolStats.poolStatus')
if [ "$STATUS" = "exhausted" ]; then
  echo "CRITICAL: Pool exhausted!"
fi
```

## 🔧 Troubleshooting

### No Monitoring Data
```json
{
  "monitoring": false,
  "message": "Pool monitoring is disabled. Set ORACLE_POOL_MONITORING=true to enable."
}
```
**Solution**: Set `ORACLE_POOL_MONITORING=true` in environment variables.

### High Memory Usage
If monitoring causes memory issues:
1. Increase `ORACLE_MONITOR_INTERVAL` (default: 30000ms)
2. Monitor error array size (kept to last 10 errors)
3. Check for connection leaks

### Monitoring Not Starting
1. Verify environment variable: `ORACLE_POOL_MONITORING=true`
2. Check pool initialization: `await oracledbexec.initialize()`
3. Look for console message: `🔍 Pool monitoring enabled for: [alias]`

## 🎛️ Advanced Configuration

### Custom Monitoring Class
```javascript
// Access internal monitoring class (advanced usage)
const pool = oracledb.getPool('default')
// Built-in monitor is automatically managed
```

### Disable Monitoring
```bash
# Disable in production if not needed
ORACLE_POOL_MONITORING=false
```

### Monitor Multiple Pools
```javascript
// Each pool alias gets its own monitor
await oracledbexec.initialize({ poolAlias: 'pool1' })
await oracledbexec.initialize({ poolAlias: 'pool2' })

// Both pools will have independent monitoring
```

## 📋 Best Practices

### Production
- ✅ Enable monitoring: `ORACLE_POOL_MONITORING=true`
- ✅ Set reasonable interval: `30000ms` (30 seconds)
- ✅ Monitor pool stats via API endpoints
- ✅ Set up alerting for `exhausted` status
- ✅ Review logs regularly for patterns

### Development
- ✅ Use monitoring to tune pool settings
- ✅ Watch for connection leaks during testing
- ✅ Monitor usage patterns under load
- ✅ Test pool exhaustion scenarios

### Performance
- ✅ Monitoring adds minimal overhead (~1-2ms per check)
- ✅ Statistics are cached between intervals
- ✅ Error history limited to prevent memory leaks
- ✅ Safe to run in production environments

## 🚀 Migration from External Monitoring

If upgrading from external pool monitoring:

### Remove External Files
```bash
rm pool-monitor.js
rm pool-stats-route.js
```

### Update Application Code
```javascript
// Before (external monitoring)
const poolMonitor = require('./pool-monitor')
poolMonitor.start()

// After (built-in monitoring)
// Just set ORACLE_POOL_MONITORING=true
// Monitoring starts automatically with initialize()
```

### Update Endpoints
```javascript
// Before (external route file)
app.get('/api/pool-stats', require('./pool-stats-route'))

// After (built-in API)
app.get('/api/pool-stats', (req, res) => {
    const stats = oracledbexec.getPoolStats()
    res.json({ success: true, poolStats: stats })
})
```

---

**Built-in Monitoring**: Zero-configuration, production-ready pool monitoring for oracledbexec library.
