# Legacy Controllers

This folder contains legacy controllers that are either:
1. Deprecated and scheduled for removal
2. Being migrated to the new module structure
3. Kept for backward compatibility

## Files:
- **AuthController.js** - Original auth controller (now in /common/)
- **CustomerController.js** - Mixed broker/customer operations (split into /broker/ClientController.js and /customer/)
- **fundController.js** - Original fund management (split into /broker/FundController.js and /customer/FundController.js)
- **orderController.js** - Original order management (migrated to /customer/TradingController.js)
- **RegistrationController.js** - Original registration (migrated to /customer/RegistrationController.js)
- **SuperBrocker.js** - Typo in name, broker operations (migrated to /admin/BrokerController.js)
- **quoteController.js** - Old quote API (deprecated, not implemented)
- **upstoxController.js** - Upstox API integration (deprecated, now using Kite)

## Migration Notes:
- Most functionality has been moved to:
  - `/common/AuthController.js` - Unified authentication
  - `/admin/` module - Platform administration
  - `/broker/` module - Broker operations
  - `/customer/` module - Customer operations
  - `/market/` module - Market data (Chart, OptionChain, Instruments)

## Usage:
These files are kept for backward compatibility with existing routes.
New routes should import from the new module structure.
