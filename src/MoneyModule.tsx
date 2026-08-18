import { useMemo, useState } from 'react';
import {
  addCaptureRecord,
  BILL_RECURRENCES,
  MONEY_CATEGORIES,
  PAYMENT_METHODS,
  removeCaptureRecord,
  updateCaptureRecord,
  type CaptureRecord,
} from './localCaptureStore';

type MoneyKind = 'Bill' | 'Expense' | 'Scan receipt';
type MoneyEditor = { kind: MoneyKind; record: CaptureRecord | null } | null;

type ReportTransaction = {
  id: string;
  date: string;
  label: string;
  category: string;
  person: string;
  amount: number;
  source: 'Bill' | 'Expense' | 'Receipt';
};

const MONEY_PEOPLE = ['Family', 'Dad', 'Mom', 'Teen'];
const BILL_STATUSES = ['Unpaid', 'Paid'];

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const currentMonth = () => monthKey(new Date());
const money = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value || 0);

function safeAmount(value: string | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatDate(value: string | undefined) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function daysUntil(value: string | undefined) {
  if (!value) return null;
  const due = new Date(`${value}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (Number.isNaN(due.getTime())) return null;
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function billTiming(record: CaptureRecord) {
  if (record.values.status === 'Paid') return { label: 'Paid', tone: 'paid' } as const;
  const days = daysUntil(record.values.dueDate);
  if (days == null) return { label: 'Unpaid', tone: 'unpaid' } as const;
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: 'overdue' } as const;
  if (days === 0) return { label: 'Due today', tone: 'due' } as const;
  if (days <= 7) return { label: `Due in ${days}d`, tone: 'due' } as const;
  return { label: 'Upcoming', tone: 'upcoming' } as const;
}

function valuesFromForm(form: HTMLFormElement, existing?: Record<string, string>) {
  const values: Record<string, string> = { ...(existing ?? {}) };
  for (const [key, value] of new FormData(form).entries()) {
    if (value instanceof File) {
      if (value.name) values[key] = value.name;
    } else {
      values[key] = String(value);
    }
  }
  return values;
}

function monthLabel(value: string) {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, Math.max(0, month - 1), 1);
  return new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric' }).format(date);
}

function transactionsFor(records: CaptureRecord[], selectedMonth: string, person: string) {
  const bills = records.filter(record => record.kind === 'Bill');
  const billIds = new Set(bills.map(record => record.id));
  const transactions: ReportTransaction[] = [];

  for (const record of records) {
    if (record.kind === 'Bill') {
      if (record.values.status !== 'Paid') continue;
      const date = record.values.paidDate || record.values.dueDate;
      if (!date?.startsWith(selectedMonth)) continue;
      if (person !== 'All' && record.values.person !== person) continue;
      transactions.push({
        id: record.id,
        date,
        label: record.values.bill || 'Bill',
        category: record.values.category || 'Other',
        person: record.values.person || 'Family',
        amount: safeAmount(record.values.amount),
        source: 'Bill',
      });
      continue;
    }

    if (record.kind === 'Expense') {
      if (!record.values.date?.startsWith(selectedMonth)) continue;
      if (person !== 'All' && record.values.person !== person) continue;
      transactions.push({
        id: record.id,
        date: record.values.date,
        label: record.values.merchant || 'Expense',
        category: record.values.category || 'Other',
        person: record.values.person || 'Family',
        amount: safeAmount(record.values.amount),
        source: 'Expense',
      });
      continue;
    }

    if (record.kind === 'Scan receipt') {
      if (!record.values.date?.startsWith(selectedMonth)) continue;
      if (person !== 'All' && record.values.person !== person) continue;
      // A receipt linked to a Bill documents that bill; it should not count twice.
      if (record.values.linkedBillId && billIds.has(record.values.linkedBillId)) continue;
      transactions.push({
        id: record.id,
        date: record.values.date,
        label: record.values.merchant || 'Receipt',
        category: record.values.category || 'Other',
        person: record.values.person || 'Family',
        amount: safeAmount(record.values.amount),
        source: 'Receipt',
      });
    }
  }

  return transactions.sort((a, b) => b.date.localeCompare(a.date));
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export default function MoneyModule({ records }: { records: CaptureRecord[] }) {
  const [editor, setEditor] = useState<MoneyEditor>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reportMonth, setReportMonth] = useState(currentMonth);
  const [reportPerson, setReportPerson] = useState('All');
  const [query, setQuery] = useState('');

  const bills = records.filter(record => record.kind === 'Bill');
  const expenses = records.filter(record => record.kind === 'Expense');
  const receipts = records.filter(record => record.kind === 'Scan receipt');
  const unpaidBills = bills.filter(record => record.values.status !== 'Paid');
  const dueSoonBills = unpaidBills.filter(record => {
    const days = daysUntil(record.values.dueDate);
    return days != null && days <= 30;
  });
  const dueSoonAmount = dueSoonBills.reduce((sum, record) => sum + safeAmount(record.values.amount), 0);

  const transactions = useMemo(() => transactionsFor(records, reportMonth, reportPerson), [records, reportMonth, reportPerson]);
  const reportTotal = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const billSpend = transactions.filter(item => item.source === 'Bill').reduce((sum, item) => sum + item.amount, 0);
  const receiptSpend = transactions.filter(item => item.source === 'Receipt').reduce((sum, item) => sum + item.amount, 0);
  const expenseSpend = transactions.filter(item => item.source === 'Expense').reduce((sum, item) => sum + item.amount, 0);
  const monthUnpaid = unpaidBills.filter(record => record.values.dueDate?.startsWith(reportMonth));
  const monthUnpaidAmount = monthUnpaid.reduce((sum, record) => sum + safeAmount(record.values.amount), 0);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach(transaction => map.set(transaction.category, (map.get(transaction.category) ?? 0) + transaction.amount));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [transactions]);
  const maxCategory = Math.max(1, ...categoryTotals.map(([, total]) => total));

  const trend = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = monthKey(date);
      const total = transactionsFor(records, key, reportPerson).reduce((sum, item) => sum + item.amount, 0);
      return { key, label: new Intl.DateTimeFormat('en-CA', { month: 'short' }).format(date), total };
    });
  }, [records, reportPerson]);
  const trendMax = Math.max(1, ...trend.map(item => item.total));

  const filteredBills = bills
    .filter(record => `${record.values.bill} ${record.values.category} ${record.values.person} ${record.values.account}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const status = Number(a.values.status === 'Paid') - Number(b.values.status === 'Paid');
      return status || (a.values.dueDate || '').localeCompare(b.values.dueDate || '');
    });
  const filteredReceipts = receipts
    .filter(record => `${record.values.merchant} ${record.values.category} ${record.values.person} ${record.values.receipt}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (b.values.date || '').localeCompare(a.values.date || ''));
  const filteredExpenses = expenses
    .filter(record => `${record.values.merchant} ${record.values.category} ${record.values.person}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (b.values.date || '').localeCompare(a.values.date || ''));

  const openEditor = (kind: MoneyKind, record: CaptureRecord | null = null) => {
    setErrors({});
    setEditor({ kind, record });
  };

  const saveEditor = (form: HTMLFormElement) => {
    if (!editor) return;
    const values = valuesFromForm(form, editor.record?.values);
    const result = editor.record
      ? updateCaptureRecord(editor.record.id, values)
      : addCaptureRecord(editor.kind, values);
    if (!result.record) {
      setErrors(result.validation?.errors ?? { form: 'Unable to save this money record.' });
      return;
    }
    setErrors({});
    setEditor(null);
  };

  const deleteRecord = (record: CaptureRecord) => {
    const label = record.kind === 'Bill' ? record.values.bill : record.values.merchant;
    if (!window.confirm(`Remove ${label || 'this record'}?`)) return;
    removeCaptureRecord(record.id);
    if (editor?.record?.id === record.id) setEditor(null);
  };

  const markBill = (record: CaptureRecord, status: 'Paid' | 'Unpaid') => {
    updateCaptureRecord(record.id, {
      ...record.values,
      status,
      paidDate: status === 'Paid' ? (record.values.paidDate || isoDate(new Date())) : '',
    });
  };

  const exportCsv = () => {
    const rows = [
      ['Date', 'Source', 'Description', 'Category', 'Person', 'Amount CAD'],
      ...transactions.map(item => [item.date, item.source, item.label, item.category, item.person, item.amount.toFixed(2)]),
    ];
    const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
    downloadText(`family-os-money-${reportMonth}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const linkedBillName = (receipt: CaptureRecord) => bills.find(bill => bill.id === receipt.values.linkedBillId)?.values.bill;

  return <div className="stack money-module">
    <header className="module-hero money-hero">
      <span className="eyebrow">Family OS · Money</span>
      <h1>Bills, receipts and household reports.</h1>
      <p>Track what is due, what was paid and where household money went. Everything stays local until a future cloud or financial-data adapter is connected.</p>
    </header>

    <section className="money-summary-grid">
      <article className="panel money-summary-card"><span>💡</span><div><strong>{unpaidBills.length}</strong><small>Unpaid bills</small></div></article>
      <article className="panel money-summary-card"><span>⏳</span><div><strong>{money(dueSoonAmount)}</strong><small>Due within 30 days</small></div></article>
      <article className="panel money-summary-card"><span>🧾</span><div><strong>{receipts.length}</strong><small>Saved receipts</small></div></article>
      <article className="panel money-summary-card"><span>📊</span><div><strong>{money(reportTotal)}</strong><small>{monthLabel(reportMonth)} spending</small></div></article>
    </section>

    <section className="panel money-search-panel">
      <label><span>Search money records</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search bills, merchants, categories, people…" /></label>
      <div><button onClick={() => openEditor('Bill')}>+ Bill</button><button onClick={() => openEditor('Scan receipt')}>+ Receipt</button><button onClick={() => openEditor('Expense')}>+ Expense</button></div>
    </section>

    <section className="panel money-record-panel bill-panel">
      <header><div><span className="eyebrow">Household obligations</span><h2>Bills</h2><p>Due dates appear in Calendar automatically.</p></div><button className="primary" data-money-add-bill onClick={() => openEditor('Bill')}>+ Add bill</button></header>
      {filteredBills.length ? <div className="bill-list">{filteredBills.map(record => {
        const timing = billTiming(record);
        return <article className={`bill-row bill-${timing.tone}`} key={record.id} data-money-bill-row>
          <span className="bill-icon">💡</span>
          <div className="bill-main"><div><span className={`money-status money-status-${timing.tone}`}>{timing.label}</span><h3>{record.values.bill}</h3></div><small>{record.values.category || 'Other'} · {record.values.person || 'Family'} · {record.values.recurrence || 'One-time'}{record.values.autopay === 'Yes' ? ' · Autopay' : ''}</small><span>Due {formatDate(record.values.dueDate)}{record.values.account ? ` · Ref ${record.values.account}` : ''}</span></div>
          <strong className="bill-amount">{money(safeAmount(record.values.amount))}</strong>
          <div className="bill-actions">{record.values.status === 'Paid' ? <button onClick={() => markBill(record, 'Unpaid')}>Mark unpaid</button> : <button className="money-positive" onClick={() => markBill(record, 'Paid')}>✓ Mark paid</button>}<button onClick={() => openEditor('Bill', record)}>Edit</button></div>
        </article>;
      })}</div> : <div className="money-empty"><span>💡</span><div><strong>No bills found.</strong><small>Add recurring or one-time bills to track due dates and payment status.</small></div></div>}
    </section>

    <section className="money-two-col">
      <section className="panel money-record-panel">
        <header><div><span className="eyebrow">Documents & purchases</span><h2>Receipts</h2><p>Receipt metadata is local; attached file names are preserved until cloud file storage is added.</p></div><button className="primary" data-money-add-receipt onClick={() => openEditor('Scan receipt')}>+ Add receipt</button></header>
        {filteredReceipts.length ? <div className="receipt-list">{filteredReceipts.map(record => <article className="receipt-row" key={record.id} data-money-receipt-row>
          <span>🧾</span><div><strong>{record.values.merchant || 'Receipt'}</strong><small>{formatDate(record.values.date)} · {record.values.category || 'Other'} · {record.values.person || 'Family'}</small><small>{record.values.paymentMethod || 'Payment method not recorded'}{record.values.receipt ? ` · ${record.values.receipt}` : ''}{linkedBillName(record) ? ` · linked to ${linkedBillName(record)}` : ''}</small></div><b>{money(safeAmount(record.values.amount))}</b><button onClick={() => openEditor('Scan receipt', record)}>Edit</button>
        </article>)}</div> : <p className="note">No receipts saved yet.</p>}
      </section>

      <section className="panel money-record-panel">
        <header><div><span className="eyebrow">Manual transactions</span><h2>Expenses</h2><p>Use this when you need the transaction but do not have a receipt.</p></div><button className="primary" data-money-add-expense onClick={() => openEditor('Expense')}>+ Add expense</button></header>
        {filteredExpenses.length ? <div className="receipt-list">{filteredExpenses.map(record => <article className="receipt-row" key={record.id} data-money-expense-row>
          <span>💵</span><div><strong>{record.values.merchant || 'Expense'}</strong><small>{formatDate(record.values.date)} · {record.values.category || 'Other'} · {record.values.person || 'Family'}</small><small>{record.values.paymentMethod || 'Payment method not recorded'}</small></div><b>{money(safeAmount(record.values.amount))}</b><button onClick={() => openEditor('Expense', record)}>Edit</button>
        </article>)}</div> : <p className="note">No standalone expenses saved yet.</p>}
      </section>
    </section>

    <section className="panel money-report" data-money-report>
      <header><div><span className="eyebrow">Local household report</span><h2>Spending report</h2><p>Paid bills + standalone expenses + unlinked receipts. Receipts linked to bills are excluded from totals to prevent double-counting.</p></div><div className="money-report-actions"><button onClick={exportCsv}>↓ CSV</button><button onClick={() => window.print()}>Print</button></div></header>
      <div className="money-report-filters"><label>Month<input type="month" value={reportMonth} onChange={event => setReportMonth(event.target.value || currentMonth())} /></label><label>Person<select value={reportPerson} onChange={event => setReportPerson(event.target.value)}><option>All</option>{MONEY_PEOPLE.map(person => <option key={person}>{person}</option>)}</select></label></div>
      <div className="money-report-kpis"><article><small>Total spending</small><strong>{money(reportTotal)}</strong></article><article><small>Paid bills</small><strong>{money(billSpend)}</strong></article><article><small>Expenses</small><strong>{money(expenseSpend)}</strong></article><article><small>Unlinked receipts</small><strong>{money(receiptSpend)}</strong></article><article><small>Still unpaid this month</small><strong>{money(monthUnpaidAmount)}</strong></article></div>

      <div className="money-report-grid">
        <section><div className="money-report-subhead"><h3>By category</h3><small>{transactions.length} transaction{transactions.length === 1 ? '' : 's'}</small></div>{categoryTotals.length ? <div className="money-category-bars">{categoryTotals.map(([category, total]) => <article key={category}><div><span>{category}</span><strong>{money(total)}</strong></div><i><b style={{ width: `${Math.max(4, (total / maxCategory) * 100)}%` }} /></i></article>)}</div> : <p className="note">No spending records in this period.</p>}</section>
        <section><div className="money-report-subhead"><h3>Six-month trend</h3><small>CAD</small></div><div className="money-trend">{trend.map(item => <article key={item.key}><div><i style={{ height: `${Math.max(5, (item.total / trendMax) * 100)}%` }} /></div><strong>{item.label}</strong><small>{money(item.total)}</small></article>)}</div></section>
      </div>

      <section className="money-report-table"><div className="money-report-subhead"><h3>Transactions</h3><small>{monthLabel(reportMonth)}</small></div>{transactions.length ? <div className="money-transaction-list">{transactions.map(item => <article key={`${item.source}:${item.id}`}><time>{formatDate(item.date)}</time><span className={`money-source money-source-${item.source.toLowerCase()}`}>{item.source}</span><div><strong>{item.label}</strong><small>{item.category} · {item.person}</small></div><b>{money(item.amount)}</b></article>)}</div> : <p className="note">No transactions to report for this selection.</p>}</section>
    </section>

    {editor ? <div className="money-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditor(null); }}><section className="money-modal" role="dialog" aria-modal="true" data-money-modal>
      <header><div><span className="eyebrow">{editor.record ? 'Edit local money record' : 'New local money record'}</span><h2>{editor.kind === 'Scan receipt' ? 'Receipt' : editor.kind}</h2><p>{editor.kind === 'Bill' ? 'Track the obligation and its payment status.' : editor.kind === 'Expense' ? 'Record a purchase without a receipt.' : 'Save confirmed receipt details; binary file storage comes with the future cloud adapter.'}</p></div><button onClick={() => setEditor(null)} aria-label="Close">×</button></header>
      <form onSubmit={event => { event.preventDefault(); saveEditor(event.currentTarget); }}>
        {errors.form ? <div className="money-error-summary">{errors.form}</div> : null}
        {editor.kind === 'Bill' ? <div className="money-form-grid">
          <label><span>Bill / payee</span><input name="bill" defaultValue={editor.record?.values.bill || ''} placeholder="Hydro" />{errors.bill ? <small className="money-field-error">{errors.bill}</small> : null}</label>
          <label><span>Amount</span><input name="amount" type="number" step="0.01" min="0.01" defaultValue={editor.record?.values.amount || ''} placeholder="0.00" />{errors.amount ? <small className="money-field-error">{errors.amount}</small> : null}</label>
          <label><span>Due date</span><input name="dueDate" type="date" defaultValue={editor.record?.values.dueDate || isoDate(new Date())} />{errors.dueDate ? <small className="money-field-error">{errors.dueDate}</small> : null}</label>
          <label><span>Category</span><select name="category" defaultValue={editor.record?.values.category || 'Utilities'}>{MONEY_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
          <label><span>Recurrence</span><select name="recurrence" defaultValue={editor.record?.values.recurrence || 'Monthly'}>{BILL_RECURRENCES.map(recurrence => <option key={recurrence}>{recurrence}</option>)}</select></label>
          <label><span>Responsible person</span><select name="person" defaultValue={editor.record?.values.person || 'Family'}>{MONEY_PEOPLE.map(person => <option key={person}>{person}</option>)}</select></label>
          <label><span>Status</span><select name="status" defaultValue={editor.record?.values.status || 'Unpaid'}>{BILL_STATUSES.map(status => <option key={status}>{status}</option>)}</select></label>
          <label><span>Autopay</span><select name="autopay" defaultValue={editor.record?.values.autopay || 'No'}><option>No</option><option>Yes</option></select></label>
          <label><span>Paid date</span><input name="paidDate" type="date" defaultValue={editor.record?.values.paidDate || ''} /></label>
          <label><span>Account / reference</span><input name="account" defaultValue={editor.record?.values.account || ''} placeholder="Optional" /></label>
          <label className="wide"><span>Notes</span><textarea name="notes" rows={4} defaultValue={editor.record?.values.notes || ''} placeholder="Billing notes, renewal details, payment instructions…" /></label>
        </div> : editor.kind === 'Expense' ? <div className="money-form-grid">
          <label><span>Merchant / description</span><input name="merchant" defaultValue={editor.record?.values.merchant || ''} placeholder="Groceries" />{errors.merchant ? <small className="money-field-error">{errors.merchant}</small> : null}</label>
          <label><span>Amount</span><input name="amount" type="number" step="0.01" min="0.01" defaultValue={editor.record?.values.amount || ''} placeholder="0.00" />{errors.amount ? <small className="money-field-error">{errors.amount}</small> : null}</label>
          <label><span>Tax</span><input name="tax" type="number" step="0.01" min="0" defaultValue={editor.record?.values.tax || ''} placeholder="0.00" /></label>
          <label><span>Category</span><select name="category" defaultValue={editor.record?.values.category || 'Groceries'}>{MONEY_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
          <label><span>Date</span><input name="date" type="date" defaultValue={editor.record?.values.date || isoDate(new Date())} />{errors.date ? <small className="money-field-error">{errors.date}</small> : null}</label>
          <label><span>Paid by</span><select name="person" defaultValue={editor.record?.values.person || 'Family'}>{MONEY_PEOPLE.map(person => <option key={person}>{person}</option>)}</select></label>
          <label><span>Payment method</span><select name="paymentMethod" defaultValue={editor.record?.values.paymentMethod || 'Credit'}>{PAYMENT_METHODS.map(method => <option key={method}>{method}</option>)}</select></label>
          <label className="wide"><span>Notes</span><textarea name="notes" rows={4} defaultValue={editor.record?.values.notes || ''} /></label>
        </div> : <div className="money-form-grid">
          <label className="wide"><span>Receipt image / PDF</span><input name="receipt" type="file" accept="image/*,application/pdf" /><small>{editor.record?.values.receipt ? `Current file name: ${editor.record.values.receipt}. Choose another file to replace the name.` : 'For now only the file name is persisted; the file bytes remain on this device.'}</small></label>
          <label><span>Merchant</span><input name="merchant" defaultValue={editor.record?.values.merchant || ''} placeholder="Store name" />{errors.merchant ? <small className="money-field-error">{errors.merchant}</small> : null}</label>
          <label><span>Total</span><input name="amount" type="number" step="0.01" min="0.01" defaultValue={editor.record?.values.amount || ''} placeholder="0.00" />{errors.amount ? <small className="money-field-error">{errors.amount}</small> : null}</label>
          <label><span>Subtotal</span><input name="subtotal" type="number" step="0.01" min="0" defaultValue={editor.record?.values.subtotal || ''} placeholder="0.00" /></label>
          <label><span>Tax</span><input name="tax" type="number" step="0.01" min="0" defaultValue={editor.record?.values.tax || ''} placeholder="0.00" /></label>
          <label><span>Tip</span><input name="tip" type="number" step="0.01" min="0" defaultValue={editor.record?.values.tip || ''} placeholder="0.00" /></label>
          <label><span>Date</span><input name="date" type="date" defaultValue={editor.record?.values.date || isoDate(new Date())} /></label>
          <label><span>Category</span><select name="category" defaultValue={editor.record?.values.category || 'Groceries'}>{MONEY_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
          <label><span>Paid by</span><select name="person" defaultValue={editor.record?.values.person || 'Family'}>{MONEY_PEOPLE.map(person => <option key={person}>{person}</option>)}</select></label>
          <label><span>Payment method</span><select name="paymentMethod" defaultValue={editor.record?.values.paymentMethod || 'Credit'}>{PAYMENT_METHODS.map(method => <option key={method}>{method}</option>)}</select></label>
          <label className="wide"><span>Link to bill</span><select name="linkedBillId" defaultValue={editor.record?.values.linkedBillId || ''}><option value="">Not linked — count this receipt as spending</option>{bills.map(bill => <option key={bill.id} value={bill.id}>{bill.values.bill} · {money(safeAmount(bill.values.amount))} · {formatDate(bill.values.dueDate)}</option>)}</select><small>Linked receipts are supporting documents and are excluded from report totals so the bill is not counted twice.</small></label>
          <label className="wide"><span>Notes</span><textarea name="notes" rows={4} defaultValue={editor.record?.values.notes || ''} /></label>
        </div>}
        <footer><div>{editor.record ? <button type="button" className="money-danger" onClick={() => deleteRecord(editor.record!)}>Delete</button> : null}</div><div><button type="button" onClick={() => setEditor(null)}>Cancel</button><button className="primary" type="submit">{editor.record ? 'Save changes' : editor.kind === 'Bill' ? 'Save bill' : editor.kind === 'Expense' ? 'Save expense' : 'Save receipt'}</button></div></footer>
      </form>
    </section></div> : null}
  </div>;
}
