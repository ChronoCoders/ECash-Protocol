# E-Cash Algorithmic Stablecoin Protocol Dashboard

A comprehensive testing dashboard for the E-Cash algorithmic stablecoin protocol with real-time monitoring, stress testing, and scenario simulation capabilities.

## 🎯 Overview

The E-Cash Protocol is a sophisticated algorithmic stablecoin system that maintains a $1.00 peg through elastic supply adjustments. This dashboard provides a complete testing environment with:

- **Real-time Protocol Monitoring** - Live price, supply, and deviation tracking
- **Interactive Testing Controls** - One-click price simulation and rebase execution  
- **Comprehensive Stress Testing** - 5 different test categories with detailed results
- **Scenario Simulation** - Market crash, bull market, oracle attacks, and recovery procedures
- **Circuit Breaker Testing** - Emergency protection mechanism validation

## 🏗️ Architecture

### Smart Contracts

1. **ECashToken.sol** - Rebasing ERC-20 token with elastic supply mechanism
2. **OracleAggregator.sol** - Multi-source price aggregation with weighted averaging
3. **StabilizationController.sol** - Automated rebase logic with progressive stability bands
4. **Treasury.sol** - Protocol asset management with allocation controls
5. **MockChainlinkOracle.sol** - Testing oracle with price simulation capabilities
6. **TestHelper.sol** - Comprehensive testing utilities and status reporting

### Frontend Dashboard

- **Next.js 14** - Modern React framework with TypeScript
- **Tailwind CSS** - Utility-first styling with responsive design
- **Recharts** - Interactive charts for real-time data visualization
- **Ethers.js** - Ethereum blockchain interaction
- **React Toastify** - User feedback and notifications

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm/yarn
- MetaMask or compatible Web3 wallet
- Local Ethereum node (Hardhat Network recommended)

### Installation

1. **Clone and Install Dependencies**
   \`\`\`bash
   git clone <repository-url>
   cd ecash-protocol-dashboard
   npm install
   \`\`\`

2. **Set Environment Variables**
   \`\`\`bash
   cp .env.example .env.local
   \`\`\`
   
   Configure your environment:
   \`\`\`
   NEXT_PUBLIC_CHAIN_ID=31337
   NEXT_PUBLIC_RPC_URL=http://localhost:8545
   \`\`\`

3. **Start Local Blockchain**
   \`\`\`bash
   npx hardhat node
   \`\`\`

4. **Deploy Contracts**
   \`\`\`bash
   npx hardhat run scripts/deploy.js --network localhost
   \`\`\`

5. **Start Dashboard**
   \`\`\`bash
   npm run dev
   \`\`\`

6. **Access Dashboard**
   Open [http://localhost:3000](http://localhost:3000) and connect your wallet

## 🧪 Testing Features

### Real-time Monitoring

- **Price Tracking Chart** - Live price vs $1.00 target with stability band indicators
- **Supply Changes Chart** - Area chart showing elastic supply adjustments over time
- **Deviation Monitoring** - Real-time price deviation with color-coded severity levels
- **Market Metrics** - Market cap, rebase count, oracle confidence, and system health

### Interactive Controls

- **Price Simulation Buttons** - Instantly set prices to $0.95, $1.00, $1.05, $1.25
- **Rebase Execution** - Manual rebase triggering with real-time feedback
- **Circuit Breaker Controls** - Emergency system reset and recovery procedures
- **Auto-refresh Toggle** - Configurable real-time data updates

### Stress Test Suite

1. **Normal Rebase** - Standard rebase operation with 2% price deviation
2. **Circuit Breaker** - Extreme price (-25%) to verify emergency protection
3. **Oracle Failure** - System resilience testing with invalid oracle data
4. **High Frequency Rebases** - Rapid consecutive rebase operations
5. **Extreme Price Volatility** - System behavior under volatile market conditions

### Scenario Runner

1. **Market Crash Simulation** - Gradual price decline from $1.00 to $0.75
2. **Bull Market Growth** - Controlled supply expansion during price increases
3. **Oracle Manipulation Attack** - Resistance testing against price manipulation
4. **Recovery Procedure** - System recovery from circuit breaker activation

## 📊 Protocol Mechanics

### Stability Bands

The protocol uses progressive stability bands with different response intensities:

- **Band 1 (±1%)** - 10% dampening factor for minor deviations
- **Band 2 (±5%)** - 25% dampening factor for moderate deviations  
- **Band 3 (±10%)** - 50% dampening factor for significant deviations
- **Band 4 (±20%)** - 75% dampening factor before circuit breaker activation

### Circuit Breaker System

- **Activation Threshold** - 20% price deviation from $1.00 target
- **Protection Mechanism** - Prevents extreme supply adjustments during market volatility
- **Manual Reset** - Admin-controlled recovery after market stabilization
- **Cooldown Period** - 12-hour minimum interval between rebase operations

### Oracle Aggregation

- **Multi-source Support** - Weighted averaging from multiple price feeds
- **Outlier Rejection** - Automatic filtering of manipulated or stale data
- **Confidence Scoring** - Real-time assessment of data reliability
- **Heartbeat Monitoring** - Freshness validation for all price sources

## 🔧 Configuration

### Network Settings

\`\`\`javascript
// hardhat.config.js
networks: {
  localhost: {
    url: "http://127.0.0.1:8545",
    chainId: 31337,
  },
  goerli: {
    url: process.env.GOERLI_RPC_URL,
    accounts: [process.env.PRIVATE_KEY],
  }
}
\`\`\`

### Contract Parameters

\`\`\`solidity
// Key protocol constants
uint256 public constant TARGET_PRICE = 1e18; // $1.00
uint256 public constant REBASE_COOLDOWN = 12 hours;
uint256 public constant MAX_REBASE_PERCENTAGE = 10e16; // 10%
uint256 public constant MAX_PRICE_DEVIATION = 20e16; // 20%
\`\`\`

## 🧪 Running Tests

### Unit Tests
\`\`\`bash
npx hardhat test
\`\`\`

### Coverage Report
\`\`\`bash
npx hardhat coverage
\`\`\`

### Gas Analysis
\`\`\`bash
REPORT_GAS=true npx hardhat test
\`\`\`

## 📈 Dashboard Usage

### Getting Started

1. **Connect Wallet** - Click "Connect Wallet" and approve MetaMask connection
2. **Deploy Protocol** - Click "Deploy Protocol" to deploy all smart contracts
3. **Monitor Status** - View real-time protocol metrics and system health
4. **Run Tests** - Execute individual tests or full stress test suite
5. **Simulate Scenarios** - Test various market conditions and edge cases

### Price Simulation

Use the price simulation buttons to test different market conditions:

- **$0.95 (-5%)** - Tests moderate downward pressure and supply contraction
- **$1.00 (0%)** - Returns to target price for system stabilization
- **$1.05 (+5%)** - Tests moderate upward pressure and supply expansion
- **$1.25 (+25%)** - Tests extreme conditions and circuit breaker activation

### Interpreting Results

- **Green Indicators** - System operating normally within target parameters
- **Yellow Indicators** - Moderate deviation requiring attention
- **Red Indicators** - Critical conditions or circuit breaker activation
- **Blue Indicators** - System operations in progress

## 🔒 Security Features

### Access Control

- **Role-based Permissions** - Hierarchical access control for different operations
- **Multi-signature Support** - Critical operations require multiple approvals
- **Time-locked Changes** - Parameter updates have mandatory delay periods
- **Emergency Pause** - Immediate system shutdown capability

### Circuit Breakers

- **Price Deviation Limits** - Automatic protection against extreme market conditions
- **Oracle Manipulation Protection** - Resistance to price feed attacks
- **Supply Change Caps** - Maximum rebase percentage limits
- **Cooldown Enforcement** - Prevents high-frequency manipulation

## 🛠️ Development

### Project Structure

\`\`\`
├── contracts/           # Solidity smart contracts
├── scripts/            # Deployment and utility scripts  
├── test/               # Comprehensive test suite
├── pages/              # Next.js pages and routing
├── components/         # React components
├── styles/             # CSS and styling
└── public/             # Static assets
\`\`\`

### Adding New Tests

1. Create test file in \`test/\` directory
2. Import required contracts and utilities
3. Write comprehensive test cases
4. Add to CI/CD pipeline

### Extending Dashboard

1. Create new component in \`components/\` directory
2. Add to main dashboard layout
3. Implement real-time data integration
4. Add user interaction handlers

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add comprehensive tests
5. Submit a pull request

## 📞 Support

For questions, issues, or contributions:

- **GitHub Issues** - Bug reports and feature requests
- **Documentation** - Comprehensive guides and API reference
- **Community** - Discord server for real-time support

---

**⚠️ Disclaimer**: This is experimental software for testing purposes. Do not use in production without thorough security audits and testing.
\`\`\`
