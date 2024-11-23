// main.js
const NodeManager = require('./blsnode'); // Mengubah import sesuai nama file yang benar

// Handle graceful shutdown
function shutdown(signal) {
  console.log(`\nReceived ${signal}. Performing graceful shutdown...`);
  process.exit(0);
}

// Handle process signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('\nUnhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('\nUncaught Exception:', error);
  process.exit(1);
});

// Start the application
console.log('Starting Blockless Node Manager...');
const manager = new NodeManager();

manager.start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
