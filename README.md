# E-Cash Algorithmic Stablecoin Protocol Dashboard

A comprehensive testing dashboard for the E-Cash algorithmic stablecoin protocol with real-time monitoring, stress testing, and scenario simulation capabilities.

![E-Cash Protocol Dashboard](https://img.shields.io/badge/Next.js-15.2.4-black?style=for-the-badge&logo=next.js)
![Hardhat](https://img.shields.io/badge/Hardhat-2.26.0-yellow?style=for-the-badge&logo=ethereum)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0.0-blue?style=for-the-badge&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4.17-38B2AC?style=for-the-badge&logo=tailwind-css)

## 🎯 Overview

The E-Cash Protocol is a sophisticated algorithmic stablecoin system that maintains a $1.00 peg through elastic supply adjustments. This dashboard provides a complete testing environment with:

- **Real-time Protocol Monitoring** - Live price, supply, and deviation tracking
- **Interactive Testing Controls** - One-click price simulation and rebase execution  
- **Comprehensive Stress Testing** - 5 different test categories with detailed results
- **Scenario Simulation** - Market crash, bull market, oracle attacks, and recovery procedures
- **Circuit Breaker Testing** - Emergency protection mechanism validation
- **Multi-Network Support** - Localhost, Sepolia, and other testnets

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

- **Node.js 18+** and npm/yarn
- **MetaMask** or compatible Web3 wallet
- **Git** for cloning the repository

### Installation

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd ecash-protocol-dashboard
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Environment Variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Configure your environment:
   ```env
   # For localhost testing
   NEXT_PUBLIC_CHAIN_ID=31337
   NEXT_PUBLIC_RPC_URL=http://localhost:8545
   
   # For Sepolia testnet (optional)
   NEXT_PUBLIC_CHAIN_ID=11155111
   NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
   PRIVATE_KEY=your_private_key_here
   ETHERSCAN_API_KEY=your_etherscan_api_key_here
   ```

4. **Start Local Development**
   
   **Terminal 1** - Start Hardhat Node:
   ```bash
   npx hardhat node
   ```
   
   **Terminal 2** - Start Dashboard:
   ```bash
   npm run dev
   ```

5. **Configure MetaMask**
   - Add localhost network:
     - Network Name: `Localhost`
     - RPC URL: `http://127.0.0.1:8545`
     - Chain ID: `31337`
     - Currency Symbol: `ETH`
   - Import test account (optional):
     - Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

6. **Access Dashboard**
   - Open [http://localhost:3000](http://localhost:3000)
   - Connect your wallet
   - Deploy contracts using the deployment manager

## 🌐 Sepolia Testnet Deployment

### Setup for Sepolia

1. **Get Sepolia ETH**
   - Visit [Sepolia Faucet](https://sepoliafaucet.com/)
   - Request test ETH (~0.1 ETH needed for deployment)

2. **Get Required API Keys**
   - **Infura**: Sign up at [infura.io](https://infura.io/) → Create project → Copy Project ID
   - **Etherscan**: Sign up at [etherscan.io](https://etherscan.io/apis) → Create API key

3. **Update Environment Variables**
   ```env
   NEXT_PUBLIC_CHAIN_ID=11155111
   NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
   PRIVATE_KEY=your_private_key_here
   ETHERSCAN_API_KEY=your_etherscan_api_key_here
   INFURA_PROJECT_ID=your_infura_project_id_here
   ```

4. **Deploy to Sepolia**
   ```bash
   # Deploy contracts
   npm run deploy:sepolia-custom
   
   # Verify contracts (optional)
   npm run verify:sepolia
   ```

5. **Add Sepolia to MetaMask**
   - Network Name: `Sepolia Testnet`
   - RPC URL: `https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID`
   - Chain ID: `11155111`
   - Currency Symbol: `ETH`
   - Block Explorer: `https://sepolia.etherscan.io`

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

## 🛠️ Development

### Project Structure

```
├── contracts/              # Solidity smart contracts
│   ├── ECashToken.sol
│   ├── OracleAggregator.sol
│   ├── StabilizationController.sol
│   ├── Treasury.sol
│   └── TestHelper.sol
├── scripts/                # Deployment and utility scripts
│   ├── deploy.ts
│   ├── deploy-sepolia.ts
│   └── verify.ts
├── test/                   # Comprehensive test suite
├── app/                    # Next.js app directory
├── components/             # React components
│   ├── DeploymentManager.tsx
│   ├── RealtimeMetrics.tsx
│   ├── StressTestSuite.tsx
│   └── ScenarioRunner.tsx
├── lib/                    # Utilities and configuration
└── styles/                 # CSS and styling
```

### Available Scripts

```bash
# Development
npm run dev              # Start Next.js development server
npm run build           # Build for production
npm run start           # Start production server

# Blockchain
npm run compile         # Compile smart contracts
npm run test           # Run contract tests
npm run node           # Start Hardhat node

# Deployment
npm run deploy                    # Deploy to localhost
npm run deploy:sepolia-custom     # Deploy to Sepolia
npm run verify:sepolia           # Verify on Etherscan

# Testing
npm run test                     # Run unit tests
npm run setup:testnet           # Setup testnet environment
```

### Adding New Tests

1. Create test file in `test/` directory
2. Import required contracts and utilities
3. Write comprehensive test cases
4. Add to CI/CD pipeline

### Extending Dashboard

1. Create new component in `components/` directory
2. Add to main dashboard layout
3. Implement real-time data integration
4. Add user interaction handlers

## 🔧 Configuration

### Network Settings

```javascript
// hardhat.config.ts
networks: {
  localhost: {
    url: "http://127.0.0.1:8545",
    chainId: 31337,
  },
  sepolia: {
    url: process.env.SEPOLIA_RPC_URL,
    accounts: [process.env.PRIVATE_KEY],
    chainId: 11155111,
  }
}
```

### Contract Parameters

```solidity
// Key protocol constants
uint256 public constant TARGET_PRICE = 1e18; // $1.00
uint256 public constant REBASE_COOLDOWN = 12 hours;
uint256 public constant MAX_REBASE_PERCENTAGE = 10e16; // 10%
uint256 public constant MAX_PRICE_DEVIATION = 20e16; // 20%
```

## 🧪 Running Tests

### Unit Tests
```bash
npx hardhat test
```

### Coverage Report
```bash
npx hardhat coverage
```

### Gas Analysis
```bash
REPORT_GAS=true npx hardhat test
```

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

- **🟢 Green Indicators** - System operating normally within target parameters
- **🟡 Yellow Indicators** - Moderate deviation requiring attention
- **🔴 Red Indicators** - Critical conditions or circuit breaker activation
- **🔵 Blue Indicators** - System operations in progress

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

## 🚨 Troubleshooting

### Common Issues

**"MetaMask not detected"**
- Install MetaMask browser extension
- Refresh the page after installation

**"Network connection error"**
- Ensure Hardhat node is running (`npx hardhat node`)
- Check RPC URL in MetaMask matches `http://127.0.0.1:8545`
- Try `http://localhost:8545` as alternative

**"Insufficient funds for gas"**
- For localhost: Import test account with private key above
- For Sepolia: Get more ETH from [Sepolia Faucet](https://sepoliafaucet.com/)

**"Contract not deployed"**
- Use the deployment manager in the dashboard
- Or run `npm run deploy` in terminal

**"Nonce too high"**
- Reset MetaMask account: Settings → Advanced → Reset Account

### Network-Specific Issues

**Localhost (Chain ID 31337)**
- Ensure Hardhat node is running
- Check that MetaMask is connected to localhost network
- Verify RPC URL is correct

**Sepolia (Chain ID 11155111)**
- Ensure you have Sepolia ETH
- Check Infura RPC URL is working
- Verify private key has sufficient balance

## 📊 Performance Optimization

### Frontend Optimization

- **Code Splitting** - Lazy loading of components
- **Memoization** - React.memo and useMemo for expensive operations
- **Virtual Scrolling** - For large data sets
- **Chart Optimization** - Limited data points and efficient rendering

### Blockchain Optimization

- **Batch Operations** - Multiple calls in single transaction
- **Gas Optimization** - Efficient contract design
- **Caching** - Smart contract call results
- **Connection Pooling** - Multiple RPC endpoints

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add comprehensive tests
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Add tests for new features
- Update documentation
- Use conventional commit messages
- Ensure all tests pass

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Dashboard**: http://localhost:3000 (when running locally)
- **Sepolia Faucet**: https://sepoliafaucet.com/
- **Sepolia Explorer**: https://sepolia.etherscan.io/
- **Hardhat Documentation**: https://hardhat.org/docs
- **Next.js Documentation**: https://nextjs.org/docs

## 📞 Support

For questions, issues, or contributions:

- **GitHub Issues** - Bug reports and feature requests
- **Documentation** - Comprehensive guides and API reference
- **Community** - Discord server for real-time support

## 🎯 Roadmap

- [ ] **Mainnet Deployment** - Production-ready deployment
- [ ] **Advanced Analytics** - ML-powered market analysis
- [ ] **Mobile App** - React Native mobile dashboard
- [ ] **API Integration** - RESTful API for external integrations
- [ ] **Multi-chain Support** - Polygon, Arbitrum, and other L2s

---

**⚠️ Disclaimer**: This is experimental software for testing purposes. Do not use in production without thorough security audits and testing.

## 🏆 Features Showcase

### Real-time Dashboard
![Dashboard Preview](https://via.placeholder.com/800x400/3B82F6/FFFFFF?text=E-Cash+Protocol+Dashboard)

### Stress Testing Suite
![Stress Testing](https://via.placeholder.com/800x400/10B981/FFFFFF?text=Comprehensive+Stress+Testing)

### Scenario Simulation
![Scenario Runner](https://via.placeholder.com/800x400/F59E0B/FFFFFF?text=Market+Scenario+Simulation)

---

**Built with ❤️ by the E-Cash Protocol Team**