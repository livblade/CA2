/**
 * Buy Now, Pay Later (BNPL) Simulator
 * Calculates and displays installment plans for purchases
 * Supports 3, 6, and 12-month interest-free installment options
 */

class BNPLCalculator {
  /**
   * Initialize BNPL Calculator
   * @param {number} totalAmount - Total purchase amount in selected currency
   * @param {string} currency - Currency code (SGD, USD, EUR, etc.)
   */
  constructor(totalAmount, currency = 'SGD') {
    this.totalAmount = parseFloat(totalAmount) || 0;
    this.currency = currency;
    this.currencySymbols = {
      'SGD': 'S$',
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'JPY': '¥',
      'AUD': 'A$',
      'CNY': '¥'
    };
  }

  /**
   * Get currency symbol for display
   * @returns {string} Currency symbol
   */
  getCurrencySymbol() {
    return this.currencySymbols[this.currency] || this.currency + ' ';
  }

  /**
   * Calculate installment plan for specified number of months
   * @param {number} months - Number of installment months (3, 6, or 12)
   * @returns {object} Installment plan details
   */
  calculateInstallment(months) {
    const monthlyPayment = this.totalAmount / months;
    const symbol = this.getCurrencySymbol();
    
    return {
      months: months,
      monthlyPayment: monthlyPayment,
      totalAmount: this.totalAmount,
      formattedMonthly: `${symbol}${monthlyPayment.toFixed(2)}`,
      formattedTotal: `${symbol}${this.totalAmount.toFixed(2)}`,
      interestRate: 0, // Interest-free
      savings: 0 // No interest charged
    };
  }

  /**
   * Get all available installment plans
   * @returns {array} Array of installment plan objects
   */
  getAllPlans() {
    return [
      this.calculateInstallment(3),
      this.calculateInstallment(6),
      this.calculateInstallment(12)
    ];
  }

  /**
   * Check if purchase amount qualifies for BNPL
   * Minimum amount: 50 currency units
   * @returns {boolean} True if qualifies
   */
  qualifiesForBNPL() {
    return this.totalAmount >= 50;
  }

  /**
   * Get recommended plan based on purchase amount
   * @returns {object} Recommended installment plan
   */
  getRecommendedPlan() {
    if (this.totalAmount < 100) {
      return this.calculateInstallment(3);
    } else if (this.totalAmount < 300) {
      return this.calculateInstallment(6);
    } else {
      return this.calculateInstallment(12);
    }
  }
}

/**
 * Initialize BNPL UI on checkout page
 * @param {string} containerId - ID of container element
 * @param {number} totalAmount - Total purchase amount
 * @param {string} currency - Currency code
 */
function initBNPL(containerId, totalAmount, currency = 'SGD') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const calculator = new BNPLCalculator(totalAmount, currency);
  
  // Check if purchase qualifies
  if (!calculator.qualifiesForBNPL()) {
    container.innerHTML = `
      <div class="bnpl-not-available">
        <p class="text-muted">
          <i class="bi bi-info-circle"></i> 
          Buy Now, Pay Later is available for purchases above ${calculator.getCurrencySymbol()}50
        </p>
      </div>
    `;
    return;
  }

  const plans = calculator.getAllPlans();
  const recommended = calculator.getRecommendedPlan();

  let html = `
    <div class="bnpl-container">
      <div class="bnpl-header">
        <h5>💳 Buy Now, Pay Later</h5>
        <p class="text-muted">Split your payment into interest-free installments</p>
      </div>
      <div class="bnpl-plans">
  `;

  plans.forEach(plan => {
    const isRecommended = plan.months === recommended.months;
    html += `
      <div class="bnpl-plan ${isRecommended ? 'bnpl-recommended' : ''}" data-months="${plan.months}">
        ${isRecommended ? '<span class="bnpl-badge">Recommended</span>' : ''}
        <div class="bnpl-plan-header">
          <strong>${plan.months} Months</strong>
        </div>
        <div class="bnpl-plan-amount">
          ${plan.formattedMonthly}<span class="bnpl-period">/month</span>
        </div>
        <div class="bnpl-plan-details">
          <small class="text-muted">
            ${plan.months} × ${plan.formattedMonthly} = ${plan.formattedTotal}
          </small>
        </div>
        <div class="bnpl-plan-features">
          <div class="bnpl-feature">✓ 0% Interest</div>
          <div class="bnpl-feature">✓ No Hidden Fees</div>
        </div>
      </div>
    `;
  });

  html += `
      </div>
      <div class="bnpl-footer">
        <small class="text-muted">
          <i class="bi bi-shield-check"></i> 
          Installment plans are calculated at checkout. Final amount may vary based on payment method fees.
        </small>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Add click handlers for plan selection
  container.querySelectorAll('.bnpl-plan').forEach(plan => {
    plan.addEventListener('click', function() {
      // Remove active class from all plans
      container.querySelectorAll('.bnpl-plan').forEach(p => p.classList.remove('bnpl-active'));
      // Add active class to clicked plan
      this.classList.add('bnpl-active');
      
      // Store selected plan in session storage
      const months = this.getAttribute('data-months');
      sessionStorage.setItem('selectedBNPLPlan', months);
      
      // Update UI to show selection
      const monthlyAmount = calculator.calculateInstallment(parseInt(months)).formattedMonthly;
      showBNPLSelection(months, monthlyAmount);
    });
  });
}

/**
 * Show BNPL selection confirmation
 * @param {number} months - Selected installment months
 * @param {string} monthlyAmount - Formatted monthly amount
 */
function showBNPLSelection(months, monthlyAmount) {
  // Create or update selection indicator
  let indicator = document.getElementById('bnpl-selection-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'bnpl-selection-indicator';
    indicator.className = 'alert alert-info mt-3';
    document.getElementById('bnpl-calculator').appendChild(indicator);
  }
  
  indicator.innerHTML = `
    <strong>Selected:</strong> ${months}-month plan at ${monthlyAmount}/month
    <button type="button" class="btn-close float-end" onclick="clearBNPLSelection()"></button>
  `;
}

/**
 * Clear BNPL selection
 */
function clearBNPLSelection() {
  sessionStorage.removeItem('selectedBNPLPlan');
  const indicator = document.getElementById('bnpl-selection-indicator');
  if (indicator) indicator.remove();
  
  document.querySelectorAll('.bnpl-plan').forEach(p => p.classList.remove('bnpl-active'));
}

/**
 * Get currently selected BNPL plan
 * @returns {number|null} Selected months or null
 */
function getSelectedBNPLPlan() {
  const selected = sessionStorage.getItem('selectedBNPLPlan');
  return selected ? parseInt(selected) : null;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BNPLCalculator, initBNPL };
}
