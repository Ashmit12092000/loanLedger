import React, { useState, useMemo } from 'react';
import { Calendar, Plus, Trash2, User, DollarSign, Calculator, FileText } from 'lucide-react';

const LoanLedgerApp = () => {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);

  // Customer form state
  const [customerForm, setCustomerForm] = useState({
    name: '',
    iclStartDate: '',
    iclEndDate: '',
    interestMethod: 'Compound',
    interestRate: '',
    interestFrequency: 'Quarterly',
    tdsRate: ''
  });

  // Transaction form state
  const [transactionForm, setTransactionForm] = useState({
    date: '',
    amountPaid: '',
    amountRepaid: ''
  });

  const createCustomer = () => {
    const newCustomer = {
      id: Date.now(),
      ...customerForm,
      interestRate: parseFloat(customerForm.interestRate),
      tdsRate: parseFloat(customerForm.tdsRate),
      transactions: [],
      createdAt: new Date().toISOString()
    };
    
    setCustomers([...customers, newCustomer]);
    setCustomerForm({
      name: '',
      iclStartDate: '',
      iclEndDate: '',
      interestMethod: 'Compound',
      interestRate: '',
      interestFrequency: 'Quarterly',
      tdsRate: ''
    });
    setShowCustomerForm(false);
  };

  const addTransaction = () => {
    if (!selectedCustomer) return;
    
    const amountPaid = parseFloat(transactionForm.amountPaid) || 0;
    const amountRepaid = parseFloat(transactionForm.amountRepaid) || 0;
    
    const newTransaction = {
      id: Date.now(),
      date: transactionForm.date,
      amountPaid,
      amountRepaid,
      type: amountPaid > 0 ? 'Deposit' : 'Repayment'
    };

    const updatedCustomers = customers.map(customer => {
      if (customer.id === selectedCustomer.id) {
        return {
          ...customer,
          transactions: [...customer.transactions, newTransaction].sort((a, b) => new Date(a.date) - new Date(b.date))
        };
      }
      return customer;
    });

    setCustomers(updatedCustomers);
    setSelectedCustomer(updatedCustomers.find(c => c.id === selectedCustomer.id));
    setTransactionForm({ date: '', amountPaid: '', amountRepaid: '' });
    setShowTransactionForm(false);
  };

  // Helper functions for date calculations
  const getQuarterEnd = (date) => {
    const d = new Date(date);
    const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    const month = d.getMonth();
    
    if (month >= 3 && month <= 5) return new Date(`${year}-06-30T00:00:00`);
    if (month >= 6 && month <= 8) return new Date(`${year}-09-30T00:00:00`);
    if (month >= 9 && month <= 11) return new Date(`${year}-12-31T00:00:00`);
    return new Date(`${year + 1}-03-31T00:00:00`);
  };

  const getNextQuarterEnd = (date) => {
    const quarterEnd = getQuarterEnd(date);
    if (date <= quarterEnd) return quarterEnd;
    
    const currentMonth = quarterEnd.getMonth();
    const currentYear = quarterEnd.getFullYear();
    
    if (currentMonth === 5) return new Date(`${currentYear}-09-30T00:00:00`);
    if (currentMonth === 8) return new Date(`${currentYear}-12-31T00:00:00`);
    if (currentMonth === 11) return new Date(`${currentYear + 1}-03-31T00:00:00`);
    if (currentMonth === 2) return new Date(`${currentYear}-06-30T00:00:00`);
    
    return quarterEnd;
  };

  const getDaysBetween = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  };

  const getQuartersBetween = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    return Math.floor(months / 3);
  };

  // Format date properly
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Main ledger calculation function
  const calculateLedger = (customer) => {
    if (!customer || !customer.transactions) return [];

    const ledger = [];
    const iclStart = new Date(customer.iclStartDate);
    const transactions = [...customer.transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    let outstandingBalance = 0;
    let cumulativeNetInterest = 0;
    let lastEventDate = iclStart;

    // Helper to add interest entry
    const addInterestEntry = (startDate, endDate, principal, reason = '') => {
      if (principal <= 0) return 0;
      
      const days = getDaysBetween(startDate, endDate);
      if (days <= 0) return 0;

      let interest = 0;
      const isAfterICL = startDate >= iclStart;
      
      if (isAfterICL && customer.interestMethod === 'Compound') {
        const quarters = getQuartersBetween(startDate, endDate);
        if (quarters > 0) {
          interest = principal * (Math.pow(1 + customer.interestRate / 400, quarters) - 1);
        } else {
          interest = (principal * customer.interestRate * days) / (100 * 365);
        }
      } else {
        interest = (principal * customer.interestRate * days) / (100 * 365);
      }

      const tds = interest * customer.tdsRate / 100;
      const netInterest = interest - tds;
      cumulativeNetInterest += netInterest;

      ledger.push({
        date: formatDate(endDate),
        type: 'Interest',
        description: reason || `Interest accrual (${days} days)`,
        grossInterest: parseFloat(interest.toFixed(2)),
        tds: parseFloat(tds.toFixed(2)),
        netInterest: parseFloat(netInterest.toFixed(2)),
        principal: parseFloat(principal.toFixed(2)),
        outstandingBalance: parseFloat(principal.toFixed(2)),
        cumulativeNetInterest: parseFloat(cumulativeNetInterest.toFixed(2)),
        balance: parseFloat((principal + cumulativeNetInterest).toFixed(2)),
        days: days
      });

      return netInterest;
    };

    // Create a timeline of all events (transactions + quarter ends)
    const events = [];
    
    // Add all transactions
    transactions.forEach(transaction => {
      events.push({
        date: new Date(transaction.date),
        type: 'transaction',
        data: transaction
      });
    });

    // Add all quarter ends from ICL start to current date
    let currentQuarterEnd = getQuarterEnd(iclStart);
    const currentDate = new Date();
    
    while (currentQuarterEnd <= currentDate) {
      events.push({
        date: currentQuarterEnd,
        type: 'quarter_end',
        data: currentQuarterEnd
      });
      
      // Move to next quarter
      if (currentQuarterEnd.getMonth() === 5) currentQuarterEnd = new Date(`${currentQuarterEnd.getFullYear()}-09-30T00:00:00`);
      else if (currentQuarterEnd.getMonth() === 8) currentQuarterEnd = new Date(`${currentQuarterEnd.getFullYear()}-12-31T00:00:00`);
      else if (currentQuarterEnd.getMonth() === 11) currentQuarterEnd = new Date(`${currentQuarterEnd.getFullYear() + 1}-03-31T00:00:00`);
      else if (currentQuarterEnd.getMonth() === 2) currentQuarterEnd = new Date(`${currentQuarterEnd.getFullYear()}-06-30T00:00:00`);
    }

    // Sort events by date, with transactions before quarter-ends on same date
    events.sort((a, b) => {
      const dateCompare = a.date.getTime() - b.date.getTime();
      if (dateCompare !== 0) return dateCompare;
      
      // Same date: transactions before quarter-ends
      if (a.type === 'transaction' && b.type === 'quarter_end') return -1;
      if (a.type === 'quarter_end' && b.type === 'transaction') return 1;
      return 0;
    });

    // Process opening balance
    if (transactions.length > 0) {
      const firstTransaction = transactions[0];
      if (firstTransaction.amountPaid > 0) {
        outstandingBalance = firstTransaction.amountPaid;
        
        ledger.push({
          date: firstTransaction.date,
          type: 'Deposit',
          description: `Opening Balance: ₹${firstTransaction.amountPaid.toLocaleString()}`,
          amountPaid: firstTransaction.amountPaid,
          amountRepaid: 0,
          netAmount: firstTransaction.amountPaid,
          principal: parseFloat(outstandingBalance.toFixed(2)),
          outstandingBalance: parseFloat(outstandingBalance.toFixed(2)),
          cumulativeNetInterest: parseFloat(cumulativeNetInterest.toFixed(2)),
          balance: parseFloat((outstandingBalance + cumulativeNetInterest).toFixed(2))
        });

        lastEventDate = new Date(firstTransaction.date);
        
        // Remove first transaction from events
        const firstTransactionIndex = events.findIndex(e => 
          e.type === 'transaction' && 
          e.data.date === firstTransaction.date && 
          e.data.amountPaid === firstTransaction.amountPaid
        );
        if (firstTransactionIndex !== -1) {
          events.splice(firstTransactionIndex, 1);
        }
      }
    }

    // Process all events in chronological order
    for (const event of events) {
      if (event.type === 'transaction') {
        const transaction = event.data;
        const transactionDate = event.date;
        
        // Calculate interest from last event to this transaction (if needed)
        if (lastEventDate < transactionDate) {
          const netInterestAdded = addInterestEntry(
            lastEventDate,
            transactionDate,
            outstandingBalance,
            'Interest till transaction'
          );
          
          // For compound interest, add to outstanding balance
          if (lastEventDate >= iclStart && customer.interestMethod === 'Compound' && netInterestAdded > 0) {
            outstandingBalance += netInterestAdded;
          }
        }
        
        // Add transaction
        const netAmount = transaction.amountPaid - transaction.amountRepaid;
        outstandingBalance += netAmount;

        ledger.push({
          date: transaction.date,
          type: transaction.amountPaid > 0 ? 'Deposit' : 'Repayment',
          description: transaction.amountPaid > 0 ? 
            `Deposit: ₹${transaction.amountPaid.toLocaleString()}` : 
            `Repayment: ₹${transaction.amountRepaid.toLocaleString()}`,
          amountPaid: transaction.amountPaid || 0,
          amountRepaid: transaction.amountRepaid || 0,
          netAmount,
          principal: parseFloat(outstandingBalance.toFixed(2)),
          outstandingBalance: parseFloat(outstandingBalance.toFixed(2)),
          cumulativeNetInterest: parseFloat(cumulativeNetInterest.toFixed(2)),
          balance: parseFloat((outstandingBalance + cumulativeNetInterest).toFixed(2))
        });

        lastEventDate = transactionDate;
        
      } else if (event.type === 'quarter_end') {
        const quarterEndDate = event.date;
        
        // Only add quarterly interest if we have outstanding balance and it's after ICL start
        if (outstandingBalance > 0 && lastEventDate < quarterEndDate && quarterEndDate >= iclStart) {
          const netInterestAdded = addInterestEntry(
            lastEventDate,
            quarterEndDate,
            outstandingBalance,
            'Quarterly accrual'
          );
          
          // For compound interest, add to outstanding balance
          if (customer.interestMethod === 'Compound' && netInterestAdded > 0) {
            outstandingBalance += netInterestAdded;
          }
          
          lastEventDate = quarterEndDate;
        }
      }
    }

    return ledger.sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const ledgerData = useMemo(() => {
    return selectedCustomer ? calculateLedger(selectedCustomer) : [];
  }, [selectedCustomer]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Loan Ledger Application</h1>
          <p className="text-gray-600">Advanced loan management with compound interest and TDS calculations</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Customer List */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Customers
                </h2>
                <button
                  onClick={() => setShowCustomerForm(true)}
                  className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
              {customers.map(customer => (
                <div
                  key={customer.id}
                  onClick={() => setSelectedCustomer(customer)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedCustomer?.id === customer.id 
                      ? 'bg-blue-50 border-blue-200 border' 
                      : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <div className="font-medium text-sm">{customer.name}</div>
                  <div className="text-xs text-gray-500">
                    {customer.interestMethod} - {customer.interestRate}%
                  </div>
                </div>
              ))}
              
              {customers.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  <User className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">No customers yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {selectedCustomer ? (
              <>
                {/* Customer Details */}
                <div className="bg-white rounded-lg shadow-sm border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">{selectedCustomer.name}</h2>
                    <button
                      onClick={() => setShowTransactionForm(true)}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Transaction
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">Interest Method</div>
                      <div className="font-medium">{selectedCustomer.interestMethod}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Interest Rate</div>
                      <div className="font-medium">{selectedCustomer.interestRate}%</div>
                    </div>
                    <div>
                      <div className="text-gray-500">TDS Rate</div>
                      <div className="font-medium">{selectedCustomer.tdsRate}%</div>
                    </div>
                    <div>
                      <div className="text-gray-500">ICL Start Date</div>
                      <div className="font-medium">{selectedCustomer.iclStartDate}</div>
                    </div>
                  </div>
                </div>

                {/* Ledger */}
                <div className="bg-white rounded-lg shadow-sm border">
                  <div className="p-4 border-b">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Loan Ledger
                    </h3>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-4 font-medium text-gray-700">Date</th>
                          <th className="text-left p-4 font-medium text-gray-700">Type</th>
                          <th className="text-left p-4 font-medium text-gray-700">Description</th>
                          <th className="text-right p-4 font-medium text-gray-700">Amount Paid</th>
                          <th className="text-right p-4 font-medium text-gray-700">Amount Repaid</th>
                          <th className="text-right p-4 font-medium text-gray-700">Outstanding</th>
                          <th className="text-right p-4 font-medium text-gray-700">Days</th>
                          <th className="text-right p-4 font-medium text-gray-700">Gross Interest</th>
                          <th className="text-right p-4 font-medium text-gray-700">TDS</th>
                          <th className="text-right p-4 font-medium text-gray-700">Net Interest</th>
                          <th className="text-right p-4 font-medium text-gray-700">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerData.map((entry, index) => (
                          <tr key={index} className={`border-b hover:bg-gray-50 ${
                            entry.type === 'Interest' ? 'bg-blue-50' : ''
                          }`}>
                            <td className="p-4">{entry.date}</td>
                            <td className="p-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                entry.type === 'Interest' ? 'bg-blue-100 text-blue-800' :
                                entry.type === 'Deposit' ? 'bg-green-100 text-green-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {entry.type}
                              </span>
                            </td>
                            <td className="p-4 text-sm">{entry.description}</td>
                            <td className="p-4 text-right">{entry.amountPaid ? `₹${entry.amountPaid.toLocaleString()}` : '-'}</td>
                            <td className="p-4 text-right">{entry.amountRepaid ? `₹${entry.amountRepaid.toLocaleString()}` : '-'}</td>
                            <td className="p-4 text-right font-medium">₹{(entry.outstandingBalance || entry.principal || 0).toLocaleString()}</td>
                            <td className="p-4 text-right text-sm">{entry.days || '-'}</td>
                            <td className="p-4 text-right">{entry.grossInterest ? `₹${entry.grossInterest.toLocaleString()}` : '-'}</td>
                            <td className="p-4 text-right">{entry.tds ? `₹${entry.tds.toLocaleString()}` : '-'}</td>
                            <td className="p-4 text-right">{entry.netInterest ? `₹${entry.netInterest.toLocaleString()}` : '-'}</td>
                            <td className="p-4 text-right font-medium">₹{(entry.balance || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                        
                        {ledgerData.length === 0 && (
                          <tr>
                            <td colSpan="11" className="p-8 text-center text-gray-500">
                              No transactions yet. Add a transaction to see the ledger.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
                <Calculator className="w-16 h-16 mx-auto mb-6 text-gray-300" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Select a Customer</h3>
                <p className="text-gray-600">Choose a customer from the left panel to view their loan ledger</p>
              </div>
            )}
          </div>
        </div>

        {/* Customer Form Modal */}
        {showCustomerForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">Add New Customer</h3>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({...customerForm, name: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ICL Start Date</label>
                  <input
                    type="date"
                    value={customerForm.iclStartDate}
                    onChange={(e) => setCustomerForm({...customerForm, iclStartDate: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Interest Method</label>
                  <select
                    value={customerForm.interestMethod}
                    onChange={(e) => setCustomerForm({...customerForm, interestMethod: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="Simple">Simple</option>
                    <option value="Compound">Compound</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Interest Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={customerForm.interestRate}
                    onChange={(e) => setCustomerForm({...customerForm, interestRate: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">TDS Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={customerForm.tdsRate}
                    onChange={(e) => setCustomerForm({...customerForm, tdsRate: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div className="p-6 border-t flex justify-end gap-3">
                <button
                  onClick={() => setShowCustomerForm(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createCustomer}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Customer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Transaction Form Modal */}
        {showTransactionForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">Add Transaction</h3>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={transactionForm.date}
                    onChange={(e) => setTransactionForm({...transactionForm, date: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={transactionForm.amountPaid}
                    onChange={(e) => setTransactionForm({...transactionForm, amountPaid: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount Repaid (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={transactionForm.amountRepaid}
                    onChange={(e) => setTransactionForm({...transactionForm, amountRepaid: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                  <strong>Note:</strong> Enter either Amount Paid (for deposits) or Amount Repaid (for repayments). 
                  The system will automatically determine the transaction type.
                </div>
              </div>
              
              <div className="p-6 border-t flex justify-end gap-3">
                <button
                  onClick={() => setShowTransactionForm(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addTransaction}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Add Transaction
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoanLedgerApp;
