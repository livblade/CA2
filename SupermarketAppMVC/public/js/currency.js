/**
 * Multi-Currency Auto-Conversion System
 * Handles real-time currency conversion and display
 * Integrates with ExchangeRate-API for live exchange rates
 */

class CurrencyConverter {
  /**
   * Initialize Currency Converter
   * @param {number} baseAmount - Amount in base currency (SGD)
   * @param {string} baseCurrency - Base currency code (default: SGD)
   * NOTE: This is DISPLAY ONLY - customers are charged in SGD
   */
  constructor(baseAmount, baseCurrency = 'SGD') {
    this.baseAmount = parseFloat(baseAmount) || 0;
    this.baseCurrency = baseCurrency;
    this.currentCurrency = baseCurrency;
    this.exchangeRates = {};
    this.lastUpdated = null;
    this.sgdAmount = baseAmount; // Store original SGD amount for charging
    
    // Supported currencies with their symbols
    this.currencies = {
      'SGD': { name: 'Singapore Dollar', symbol: 'S$', flag: '🇸🇬' },
      'USD': { name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
      'EUR': { name: 'Euro', symbol: '€', flag: '🇪🇺' },
      'GBP': { name: 'British Pound', symbol: '£', flag: '🇬🇧' },
      'JPY': { name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵' },
      'AUD': { name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺' },
      'CNY': { name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳' },
      'MYR': { name: 'Malaysian Ringgit', symbol: 'RM', flag: '🇲🇾' },
      'THB': { name: 'Thai Baht', symbol: '฿', flag: '🇹🇭' },
      'KRW': { name: 'South Korean Won', symbol: '₩', flag: '🇰🇷' }
    };
  }

  /**
   * Fetch exchange rates from API
   * @returns {Promise<object>} Exchange rates data
   */
  async fetchExchangeRates() {
    try {
      // Using exchangerate-api.com (free tier: 1,500 requests/month)
      // Alternative: Use backend endpoint that caches rates
      const response = await fetch(`/api/exchange-rates?base=${this.baseCurrency}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch exchange rates');
      }
      
      const data = await response.json();
      this.exchangeRates = data.rates;
      this.lastUpdated = new Date(data.time_last_update_utc || Date.now());
      
      return data;
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
      // Use fallback rates if API fails
      this.useFallbackRates();
      throw error;
    }
  }

  /**
   * Use fallback exchange rates (approximate)
   * Used when API is unavailable
   */
  useFallbackRates() {
    this.exchangeRates = {
      'SGD': 1.00,
      'USD': 0.74,
      'EUR': 0.68,
      'GBP': 0.58,
      'JPY': 110.50,
      'AUD': 1.09,
      'CNY': 4.76,
      'MYR': 3.12,
      'THB': 25.20,
      'KRW': 880.00
    };
    this.lastUpdated = new Date();
    console.warn('Using fallback exchange rates');
  }

  /**
   * Convert amount to target currency
   * @param {string} targetCurrency - Target currency code
   * @returns {number} Converted amount
   */
  convert(targetCurrency) {
    if (!this.exchangeRates[targetCurrency]) {
      console.error(`Exchange rate not available for ${targetCurrency}`);
      return this.baseAmount;
    }
    
    const rate = this.exchangeRates[targetCurrency];
    return this.baseAmount * rate;
  }

  /**
   * Format amount with currency symbol
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code
   * @returns {string} Formatted amount
   */
  formatAmount(amount, currency) {
    const currencyInfo = this.currencies[currency];
    if (!currencyInfo) return `${amount.toFixed(2)} ${currency}`;
    
    // Special formatting for JPY and KRW (no decimal places)
    const decimals = (currency === 'JPY' || currency === 'KRW') ? 0 : 2;
    
    return `${currencyInfo.symbol}${amount.toFixed(decimals)}`;
  }

  /**
   * Get formatted converted amount
   * @param {string} targetCurrency - Target currency code
   * @returns {string} Formatted converted amount
   */
  getFormattedAmount(targetCurrency) {
    const amount = this.convert(targetCurrency);
    return this.formatAmount(amount, targetCurrency);
  }

  /**
   * Get all available currencies
   * @returns {array} Array of currency objects
   */
  getAvailableCurrencies() {
    return Object.keys(this.currencies).map(code => ({
      code,
      ...this.currencies[code]
    }));
  }
}

/**
 * Initialize currency selector UI
 * @param {string} containerId - ID of container element
 * @param {number} baseAmount - Base amount in SGD
 * @param {function} onCurrencyChange - Callback when currency changes
 */
async function initCurrencySelector(containerId, baseAmount, onCurrencyChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const converter = new CurrencyConverter(baseAmount, 'SGD');
  
  // Show loading state
  container.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div> Loading currencies...</div>';
  
  try {
    // Fetch exchange rates
    await converter.fetchExchangeRates();
    
    // Build currency selector UI
    const currencies = converter.getAvailableCurrencies();
    
    let html = `
      <div class="currency-selector">
        <div class="currency-header">
          <h5>🌍 View Price In Your Currency</h5>
          <p class="text-muted"><small>Display only - You'll be charged S$${baseAmount.toFixed(2)} SGD</small></p>
        </div>
        <div class="currency-dropdown">
          <select id="currency-select" class="form-select">
    `;
    
    currencies.forEach(curr => {
      const convertedAmount = converter.getFormattedAmount(curr.code);
      html += `<option value="${curr.code}" data-amount="${converter.convert(curr.code)}">
        ${curr.flag} ${curr.code} - ${curr.name} (${convertedAmount})
      </option>`;
    });
    
    html += `
          </select>
        </div>
        <div class="currency-info mt-2">
          <div id="converted-amount-display" class="currency-display">
            <div class="currency-amount">${converter.formatAmount(baseAmount, 'SGD')}</div>
            <div class="currency-label">Total Amount</div>
          </div>
          <div class="currency-exchange-rate" id="exchange-rate-info">
            <small class="text-muted">Using live exchange rates</small>
          </div>
        </div>
        <div class="currency-last-updated">
          <small class="text-muted">
            Last updated: ${converter.lastUpdated ? converter.lastUpdated.toLocaleTimeString() : 'Just now'}
          </small>
        </div>
      </div>
    `;
    
    container.innerHTML = html;
    
    // Add change event listener
    const select = document.getElementById('currency-select');
    const amountDisplay = document.getElementById('converted-amount-display');
    const rateInfo = document.getElementById('exchange-rate-info');
    
    select.addEventListener('change', function() {
      const selectedCurrency = this.value;
      const convertedAmount = converter.convert(selectedCurrency);
      const formattedAmount = converter.formatAmount(convertedAmount, selectedCurrency);
      
      // Update display
      amountDisplay.querySelector('.currency-amount').textContent = formattedAmount;
      
      // Show exchange rate
      const rate = converter.exchangeRates[selectedCurrency];
      rateInfo.innerHTML = `
        <small class="text-muted">
          1 SGD = ${rate.toFixed(4)} ${selectedCurrency}
        </small>
      `;
      
      // Store selected currency in session
      sessionStorage.setItem('selectedCurrency', selectedCurrency);
      sessionStorage.setItem('convertedAmount', convertedAmount);
      
      // Trigger callback if provided
      if (typeof onCurrencyChange === 'function') {
        onCurrencyChange(selectedCurrency, convertedAmount, formattedAmount);
      }
      
      // Update BNPL calculator if present
      updateBNPLWithCurrency(convertedAmount, selectedCurrency);
    });
    
    // Restore previously selected currency if any
    const savedCurrency = sessionStorage.getItem('selectedCurrency');
    if (savedCurrency && select.querySelector(`option[value="${savedCurrency}"]`)) {
      select.value = savedCurrency;
      select.dispatchEvent(new Event('change'));
    }
    
  } catch (error) {
    container.innerHTML = `
      <div class="alert alert-warning">
        <strong>Currency conversion temporarily unavailable</strong>
        <p>Showing prices in SGD only.</p>
      </div>
    `;
  }
}

/**
 * Update BNPL calculator with new currency
 * @param {number} amount - Converted amount
 * @param {string} currency - Currency code
 */
function updateBNPLWithCurrency(amount, currency) {
  const bnplContainer = document.getElementById('bnpl-calculator');
  if (bnplContainer) {
    initBNPL('bnpl-calculator', amount, currency);
  }
}

/**
 * Get selected currency data
 * @returns {object} Selected currency information
 */
function getSelectedCurrency() {
  return {
    code: sessionStorage.getItem('selectedCurrency') || 'SGD',
    amount: parseFloat(sessionStorage.getItem('convertedAmount')) || null
  };
}

/**
 * Reset to base currency
 */
function resetCurrency() {
  sessionStorage.removeItem('selectedCurrency');
  sessionStorage.removeItem('convertedAmount');
  const select = document.getElementById('currency-select');
  if (select) {
    select.value = 'SGD';
    select.dispatchEvent(new Event('change'));
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CurrencyConverter, initCurrencySelector };
}
