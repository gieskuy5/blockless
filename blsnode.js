const fs = require('fs');
const axios = require('axios');
const readline = require('readline');
const { exec } = require('child_process');

const LOGO = `
    ____  __           __   __              
   / __ )/ /___  _____/ /__/ /__  __________
  / __  / / __ \\/ ___/ //_/ / _ \\/ ___/ ___/
 / /_/ / / /_/ / /__/ ,< / /  __(__  |__  ) 
/_____/_/\\____/\\___/_/|_/_/\\___/____/____/  
`;

class BLSNode {
  constructor(nodeId, token) {
    this.nodeId = nodeId;
    this.token = token;
    this.info = null;
    this.lastPing = null;
    this.pingSuccess = false;
    this.pingInterval = null;
    this.startTime = null;
    this.lastReward = 0;
    this.rewardHistory = [];
  }

  async ping() {
    try {
      const response = await axios.post(
        `https://gateway-run.bls.dev/api/v1/nodes/${this.nodeId}/ping`,
        {},
        {
          headers: { 'Authorization': `Bearer ${this.token}` },
          timeout: 10000
        }
      );
      
      this.lastPing = new Date();
      this.pingSuccess = response.data.status === 'ok';
      console.log(`[${this.lastPing.toLocaleString()}] Ping ${this.nodeId}: ${this.pingSuccess ? '✅' : '❌'}`);
      return this.pingSuccess;
    } catch (error) {
      this.pingSuccess = false;
      console.error(`[${new Date().toLocaleString()}] Ping failed for ${this.nodeId}:`, error.message);
      return false;
    }
  }

  startPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.pingInterval = setInterval(() => this.ping(), 60000);
    this.ping();
  }

  async checkStatus() {
    try {
      const response = await axios.get(
        `https://gateway-run.bls.dev/api/v1/nodes/${this.nodeId}`,
        {
          headers: { 'Authorization': `Bearer ${this.token}` },
          timeout: 10000
        }
      );
      this.info = response.data;
      
      if (!this.info.isConnected) {
        await this.startSession();
      } else {
        this.checkRewardChange();
      }
      
      return this.info;
    } catch (error) {
      console.error(`Error checking node ${this.nodeId}:`, error.message);
    }
  }

  checkRewardChange() {
    if (this.info && this.lastReward !== this.info.totalReward) {
      const rewardDiff = this.info.totalReward - this.lastReward;
      if (rewardDiff > 0) {
        const now = new Date();
        if (!this.startTime) {
          this.startTime = now;
        }
        this.rewardHistory.push({
          timestamp: now,
          reward: rewardDiff
        });
        console.log(`[${now.toLocaleString()}] Node ${this.nodeId} reward increased by ${rewardDiff.toFixed(4)}`);
      }
      this.lastReward = this.info.totalReward;
    }
  }

  async startSession() {
    try {
      const response = await axios.post(
        `https://gateway-run.bls.dev/api/v1/nodes/${this.nodeId}/start-session`,
        {},
        {
          headers: { 'Authorization': `Bearer ${this.token}` },
          timeout: 10000
        }
      );
      this.startTime = new Date();
      this.lastReward = 0;
      this.rewardHistory = [];
      console.log(`[${this.startTime.toLocaleString()}] Started new session for node ${this.nodeId}`);
      return response.data;
    } catch (error) {
      console.error(`Error starting session for node ${this.nodeId}:`, error.message);
    }
  }

  formatStatus() {
    const time = new Date().toLocaleString();
    let output = `\n[${time}] Node: ${this.nodeId}\n`;
    output += '----------------------------------------\n';
    
    if (this.info) {
      output += `Status: ${this.info.isConnected ? '✅ Online' : '❌ Offline'}\n`;
      output += `Total Reward: ${this.info.totalReward.toFixed(4)}\n`;
      output += `Today's Reward: ${this.info.todayReward.toFixed(4)}\n`;
      if (this.startTime) {
        output += `Start Time: ${this.startTime.toLocaleString()}\n`;
        output += `Running Time: ${formatRunningTime(new Date() - this.startTime)}\n`;
      }
      if (this.rewardHistory.length > 0) {
        output += '\nReward History:\n';
        this.rewardHistory.slice(-5).forEach(entry => {
          output += `  ${entry.timestamp.toLocaleString()}: +${entry.reward.toFixed(4)}\n`;
        });
      }
    }
    
    output += `Last Ping: ${this.lastPing ? this.lastPing.toLocaleString() : 'Never'}\n`;
    output += `Ping Status: ${this.pingSuccess ? '✅ Success' : '❌ Failed'}\n`;
    return output;
  }

  static async setupEnvironment() {
    const commands = [
      'apt-get update',
      'apt-get upgrade -y',
      'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -',
      'apt-get install -y nodejs',
      'npm install pm2 -g',
      'mkdir -p /opt/blockless',
      'npm install',
      'pm2 start main.js --name "blockless-node"',
      'pm2 save',
      'pm2 startup'
    ];

    for (const cmd of commands) {
      try {
        await new Promise((resolve, reject) => {
          exec(cmd, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout);
          });
        });
        console.log(`✅ Successfully executed: ${cmd}`);
      } catch (error) {
        console.error(`❌ Error executing ${cmd}:`, error);
        throw error;
      }
    }
  }
}

function formatRunningTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
}

class NodeManager {
  constructor() {
    this.nodes = [];
    this.currentNode = 0;
    this.setupKeyboard();
  }

  setupKeyboard() {
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      process.stdin.on('keypress', (str, key) => {
        if (key.ctrl && key.name === 'c') {
          process.exit();
        } else if (key.name === 'right') {
          this.currentNode = (this.currentNode + 1) % this.nodes.length;
          this.display();
        } else if (key.name === 'left') {
          this.currentNode = (this.currentNode - 1 + this.nodes.length) % this.nodes.length;
          this.display();
        }
      });
    }
  }

  display() {
    if (process.stdout.isTTY) {
      console.clear();
      console.log(LOGO);
      console.log(this.nodes[this.currentNode].formatStatus());
      console.log(`Node ${this.currentNode + 1}/${this.nodes.length}`);
      console.log('Use ← → to navigate | ctrl+c to exit');
    } else {
      console.log(this.nodes[this.currentNode].formatStatus());
    }
  }

  async start() {
    if (process.env.SETUP_ENV) {
      await BLSNode.setupEnvironment();
    }
    
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    
    for (const node of config.nodes) {
      const blsNode = new BLSNode(node.id, node.token);
      this.nodes.push(blsNode);
    }

    for (const node of this.nodes) {
      await node.checkStatus();
      node.startPingInterval();
    }
    
    this.display();

    setInterval(() => {
      Promise.all(this.nodes.map(node => node.checkStatus()));
      this.display();
    }, 60000);
  }
}

module.exports = NodeManager;
