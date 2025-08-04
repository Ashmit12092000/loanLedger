import React, { useState, useEffect, useCallback } from 'react'; 
import { format, addDays, differenceInDays, isBefore, isAfter, isSameDay, getYear, lastDayOfMonth, endOfQuarter, startOfDay } from 'date-fns';

// --- Helper Functions ---

const parseDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return null;
    const date = startOfDay(new Date(dateString));
    return isNaN(date.getTime()) ? null : date;
};

const getDaysInYear = (year) => {
    return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
};

const calculateSimpleInterest = (principal, rate, days, year) => {
    if (principal <= 0 || days <= 0) return 0;
    return (principal * rate * days) / (100 * getDaysInYear(year));
};

// --- Main App Component ---

const App = () => {
    // --- State Management for Multiple Ledgers ---
    const [ledgers, setLedgers] = useState([]);
    const [activeLedgerId, setActiveLedgerId] = useState(null);

    const [showCustomerForm, setShowCustomerForm] = useState(false);
    const [showTransactionForm, setShowTransactionForm] = useState(false);

    // Find the currently active ledger object
    const activeLedger = ledgers.find(l => l.id === activeLedgerId);

    // --- Core Ledger Logic ---
    const generateLedger = useCallback((customer, transactions) => {
        const iclStartDate = parseDate(customer.iclStartDate);
        const iclEndDate = parseDate(customer.iclEndDate);

        if (!iclStartDate || !customer.interestRate || transactions.length === 0) {
            return [];
        }

        const sortedTransactions = [...transactions]
            .filter(t => {
                const tDate = parseDate(t.date);
                return iclEndDate ? !isAfter(tDate, iclEndDate) : true;
            })
            .sort((a, b) => parseDate(a.date) - parseDate(b.date));

        if (sortedTransactions.length === 0) {
            return [];
        }

        const eventDates = new Set();
        const firstTransactionDate = parseDate(sortedTransactions[0].date);
        sortedTransactions.forEach(t => eventDates.add(t.date));
        
        const lastPossibleDate = iclEndDate || startOfDay(new Date());

        let currentDate = firstTransactionDate;
        while (!isAfter(currentDate, lastPossibleDate)) {
             const quarterEnd = endOfQuarter(currentDate);
             if(!isAfter(quarterEnd, lastPossibleDate) && !isBefore(quarterEnd, firstTransactionDate)){
                 eventDates.add(quarterEnd.toISOString().split('T')[0]);
             }
             currentDate = addDays(endOfQuarter(currentDate), 1);
        }
        
        if (iclEndDate) {
            eventDates.add(customer.iclEndDate);
        }

        const uniqueSortedDates = Array.from(eventDates).map(parseDate).sort((a, b) => a - b);

        let runningPrincipal = 0;
        let cumulativeInterest = 0;
        const newLedgerRows = [];

        for (let i = 0; i < uniqueSortedDates.length; i++) {
            const eventDate = uniqueSortedDates[i];
            const nextEventDate = (i + 1 < uniqueSortedDates.length) ? uniqueSortedDates[i + 1] : null;

            const transactionsOnDate = sortedTransactions.filter(t => isSameDay(parseDate(t.date), eventDate));
            let paidToday = 0;
            let repaidToday = 0;
            
            if (transactionsOnDate.length > 0) {
                 transactionsOnDate.forEach(t => {
                    paidToday += t.paid;
                    repaidToday += t.repaid;
                });
            }
            
            runningPrincipal += paidToday - repaidToday;

            const daysInPeriod = nextEventDate ? differenceInDays(nextEventDate, eventDate) : 1;
            const interest = calculateSimpleInterest(runningPrincipal, customer.interestRate, daysInPeriod, getYear(eventDate));
            const tds = interest * (customer.tdsRate / 100);
            const netInterest = interest - tds;
            cumulativeInterest += netInterest;

            newLedgerRows.push({
                date: format(eventDate, 'yyyy-MM-dd'),
                description: paidToday > 0 ? 'Deposit' : (repaidToday > 0 ? 'Repayment' : 'Interest Period'),
                paid: paidToday,
                repaid: repaidToday,
                principal: runningPrincipal,
                interest, tds, netInterest, cumulativeInterest
            });

            const isCurrentEventQuarterEnd = isSameDay(eventDate, endOfQuarter(eventDate));
            const useCompound = isAfter(eventDate, iclStartDate) || isSameDay(eventDate, iclStartDate);
            if (isCurrentEventQuarterEnd && useCompound && customer.interestMethod === 'Compound' && cumulativeInterest > 0) {
                runningPrincipal += cumulativeInterest;
                newLedgerRows.push({
                    date: format(eventDate, 'yyyy-MM-dd'),
                    description: 'Quarterly Interest Capitalized',
                    paid: 0, repaid: 0, principal: runningPrincipal,
                    interest: 0, tds: 0, netInterest: 0, cumulativeInterest,
                });
                cumulativeInterest = 0;
            }
        }
        
        return newLedgerRows;
    }, []);

    // --- Event Handlers ---

    const handleAddNewLedger = () => {
        const newId = Date.now();
        const newLedger = {
            id: newId,
            customer: {
                name: '', iclStartDate: '', iclEndDate: '',
                interestMethod: 'Compound', interestRate: 12, tdsRate: 10,
            },
            transactions: [],
            calculatedLedger: [],
        };
        setLedgers(prev => [...prev, newLedger]);
        setActiveLedgerId(newId);
        setShowCustomerForm(true);
        setShowTransactionForm(false);
    };

    const handleCustomerChange = (e) => {
        const { name, value } = e.target;
        setLedgers(prevLedgers => prevLedgers.map(l => 
            l.id === activeLedgerId 
            ? { ...l, customer: { ...l.customer, [name]: value } } 
            : l
        ));
    };
    
    const handleSaveCustomer = () => {
        setShowCustomerForm(false);
        const current = ledgers.find(l => l.id === activeLedgerId);
        if (current) {
            const updatedLedgerRows = generateLedger(current.customer, current.transactions);
            setLedgers(prev => prev.map(l => l.id === activeLedgerId ? {...l, calculatedLedger: updatedLedgerRows} : l));
        }
    }

    const handleAddTransaction = (newTransaction) => {
        setLedgers(prevLedgers => prevLedgers.map(l => {
            if (l.id === activeLedgerId) {
                const updatedTransactions = [...l.transactions, newTransaction];
                const updatedLedgerRows = generateLedger(l.customer, updatedTransactions);
                return { ...l, transactions: updatedTransactions, calculatedLedger: updatedLedgerRows };
            }
            return l;
        }));
        setShowTransactionForm(false);
    };

    useEffect(() => {
        if (ledgers.length === 0) {
            handleAddNewLedger();
        }
    }, []);

    return (
        <div className="bg-slate-50 min-h-screen font-sans text-slate-800">
            <div className="container mx-auto p-4 sm:p-6 lg:p-8">
                <header className="mb-8 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Loan Ledger Pro</h1>
                        <button onClick={handleAddNewLedger} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 w-full sm:w-auto">
                            + Add New Ledger
                        </button>
                    </div>
                    {ledgers.length > 1 && (
                        <div>
                            <label htmlFor="ledger-select" className="block text-sm font-medium text-slate-600 mb-1">Active Ledger</label>
                            <select
                                id="ledger-select"
                                value={activeLedgerId || ''}
                                onChange={e => setActiveLedgerId(Number(e.target.value))}
                                className="w-full sm:w-1/2 lg:w-1/3 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                            >
                                {ledgers.map(l => (
                                    <option key={l.id} value={l.id}>
                                        {l.customer.name || Ledger #${l.id}}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </header>

                {activeLedger ? (
                    <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-1 space-y-6">
                            <div className="bg-white p-6 rounded-2xl shadow-lg shadow-slate-200/80">
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-xl font-bold text-slate-800">Customer Setup</h2>
                                    <button onClick={() => setShowCustomerForm(!showCustomerForm)} className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                                        {showCustomerForm ? 'Hide' : 'Edit'}
                                    </button>
                                </div>
                                {!showCustomerForm ? (
                                    <div className="space-y-2 text-sm">
                                        <p><strong>Name:</strong> {activeLedger.customer.name || 'Not Set'}</p>
                                        <p><strong>ICL Start Date:</strong> {activeLedger.customer.iclStartDate ? format(parseDate(activeLedger.customer.iclStartDate), 'dd MMM, yyyy') : 'Not Set'}</p>
                                        <p><strong>ICL End Date:</strong> {activeLedger.customer.iclEndDate ? format(parseDate(activeLedger.customer.iclEndDate), 'dd MMM, yyyy') : 'N/A'}</p>
                                        <p><strong>Interest Method:</strong> {activeLedger.customer.interestMethod}</p>
                                        <p><strong>Interest Rate:</strong> {activeLedger.customer.interestRate}%</p>
                                        <p><strong>TDS Rate:</strong> {activeLedger.customer.tdsRate}%</p>
                                    </div>
                                ) : (
                                    <CustomerForm customer={activeLedger.customer} onChange={handleCustomerChange} onSubmit={handleSaveCustomer} />
                                )}
                            </div>

                            <div className="bg-white p-6 rounded-2xl shadow-lg shadow-slate-200/80">
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-xl font-bold text-slate-800">New Transaction</h2>
                                    <button onClick={() => setShowTransactionForm(!showTransactionForm)} className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors disabled:text-slate-400 disabled:cursor-not-allowed" disabled={!activeLedger.customer.iclStartDate}>
                                        {showTransactionForm ? 'Cancel' : 'Add'}
                                    </button>
                                </div>
                                {showTransactionForm && <TransactionForm onAdd={handleAddTransaction} customer={activeLedger.customer} />}
                            </div>
                        </div>

                        <div className="lg:col-span-2">
                            <LedgerTable ledger={activeLedger.calculatedLedger} />
                        </div>
                    </main>
                ) : (
                     <div className="text-center py-16">
                        <p className="text-slate-600">No ledger selected. Please add a new ledger to begin.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Child Components ---

const CustomerForm = ({ customer, onChange, onSubmit }) => {
    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit();
    }
    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Customer Name</label>
                <input required type="text" name="name" value={customer.name} onChange={onChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">ICL Start Date</label>
                <input required type="date" name="iclStartDate" value={customer.iclStartDate} onChange={onChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">ICL End Date (Optional)</label>
                <input type="date" name="iclEndDate" value={customer.iclEndDate} onChange={onChange} min={customer.iclStartDate} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Interest Method</label>
                <select name="interestMethod" value={customer.interestMethod} onChange={onChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                    <option value="Simple">Simple</option>
                    <option value="Compound">Compound</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Interest Rate (%)</label>
                <input required type="number" step="0.01" name="interestRate" value={customer.interestRate} onChange={onChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">TDS Rate (%)</label>
                <input required type="number" step="0.01" name="tdsRate" value={customer.tdsRate} onChange={onChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Save Changes</button>
        </form>
    );
};

const TransactionForm = ({ onAdd, customer }) => {
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [amountPaid, setAmountPaid] = useState('');
    const [amountRepaid, setAmountRepaid] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        const transactionDate = parseDate(date);
        const iclEndDate = parseDate(customer.iclEndDate);

        if (iclEndDate && isAfter(transactionDate, iclEndDate)) {
            setError(Transaction date cannot be after ICL End Date (${format(iclEndDate, 'dd MMM, yyyy')}).);
            return;
        }

        const paid = parseFloat(amountPaid) || 0;
        const repaid = parseFloat(amountRepaid) || 0;
        if (paid > 0 || repaid > 0) {
            onAdd({ date, paid, repaid });
            setAmountPaid('');
            setAmountRepaid('');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-100 p-3 rounded-lg">{error}</p>}
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Amount Paid (Deposit)</label>
                <input type="number" placeholder="0.00" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Amount Repaid</label>
                <input type="number" placeholder="0.00" value={amountRepaid} onChange={e => setAmountRepaid(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
            </div>
            <button type="submit" className="w-full bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">Add Transaction</button>
        </form>
    );
};

const LedgerTable = ({ ledger }) => {
    if (!ledger || ledger.length === 0) {
        return (
            <div className="bg-white p-6 rounded-2xl shadow-lg text-center">
                <h3 className="text-xl font-bold text-slate-800 mb-2">Loan Ledger</h3>
                <p className="text-slate-500">No transactions found for this ledger. Please add transactions to generate a statement.</p>
            </div>
        );
    }
    
    const formatCurrency = (num) => num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/80 overflow-hidden">
            <h3 className="text-xl font-bold text-slate-800 p-6">Loan Ledger Statement</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-600">
                    <thead className="text-xs text-slate-700 uppercase bg-slate-100">
                        <tr>
                            <th scope="col" className="px-4 py-3">Date</th>
                            <th scope="col" className="px-4 py-3">Description</th>
                            <th scope="col" className="px-4 py-3 text-right">Paid In</th>
                            <th scope="col" className="px-4 py-3 text-right">Paid Out</th>
                            <th scope="col" className="px-4 py-3 text-right">Principal</th>
                            <th scope="col" className="px-4 py-3 text-right">Interest</th>
                            <th scope="col" className="px-4 py-3 text-right">TDS</th>
                            <th scope="col" className="px-4 py-3 text-right">Net Int.</th>
                            <th scope="col" className="px-4 py-3 text-right">Cum. Int.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ledger.map((row, index) => (
                            <tr key={index} className={border-b border-slate-100 ${row.description.includes('Capitalized') ? 'bg-blue-50 font-bold' : 'bg-white'} hover:bg-slate-50}>
                                <td className="px-4 py-3 whitespace-nowrap">{format(parseDate(row.date), 'dd-MMM-yy')}</td>
                                <td className="px-4 py-3">{row.description}</td>
                                <td className="px-4 py-3 text-right font-mono text-green-600">{row.paid > 0 ? formatCurrency(row.paid) : '-'}</td>
                                <td className="px-4 py-3 text-right font-mono text-red-600">{row.repaid > 0 ? formatCurrency(row.repaid) : '-'}</td>
                                <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">{formatCurrency(row.principal)}</td>
                                <td className="px-4 py-3 text-right font-mono text-sky-600">{row.interest > 0 ? formatCurrency(row.interest) : '-'}</td>
                                <td className="px-4 py-3 text-right font-mono text-orange-600">{row.tds > 0 ? formatCurrency(row.tds) : '-'}</td>
                                <td className="px-4 py-3 text-right font-mono text-indigo-600">{row.netInterest > 0 ? formatCurrency(row.netInterest) : '-'}</td>
                                <td className="px-4 py-3 text-right font-mono font-semibold text-purple-700">{row.cumulativeInterest > 0 ? formatCurrency(row.cumulativeInterest) : '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default App;

