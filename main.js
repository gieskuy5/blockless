// main.js
const NodeManager = require('./blsNode');

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

const manager = new NodeManager();
manager.start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});