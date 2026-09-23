import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleHelp, Coffee, CreditCard, Edit2, Ellipsis, FileDown, Filter, Home, LayoutDashboard, Leaf, LoaderCircle, Plus, Search, Settings2, ShoppingBag, Sparkles, Trash2, Utensils, X } from 'lucide-react';

const CATEGORIES = ['Food', 'Transport', 'Housing', 'Bills', 'Shopping', 'Health', 'Entertainment', 'Other'];
const ICONS = { Food: Utensils, Transport: CreditCard, Housing: Home, Bills: FileDown, Shopping: ShoppingBag, Health: Sparkles, Entertainment: Coffee, Other: Ellipsis };
const TONES = { Food: 'peach', Transport: 'blue', Housing: 'lavender', Bills: 'gold', Shopping: 'pink', Health: 'mint', Entertainment: 'blue', Other: 'gray' };
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const today = () => new Date().toISOString().slice(0, 10);

function dateLabel(date) {
  const d = new Date(`${date}T12:00:00`);
  if (date === today()) return 'Today';
  if (date === new Date(Date.now() - 86400000).toISOString().slice(0, 10)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(d);
}

function App() {
  const [expenses, setExpenses] = useState([]);
  const [storage, setStorage] = useState('memory');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [month, setMonth] = useState('This month');
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ title: '', amount: '', category: 'Food', expense_date: today(), notes: '' });

  async function refresh() {
    setError('');
    try {
      const [items, health] = await Promise.all([fetch('/api/expenses'), fetch('/api/health')]);
      if (!items.ok || !health.ok) throw new Error('The API could not load your expenses.');
      setExpenses(await items.json());
      setStorage((await health.json()).storage);
    } catch {
      setError('Couldn’t connect to the API. Make sure both the API and web app are running.');
    } finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast]);

  const currentMonth = today().slice(0, 7);
  const thisMonthExpenses = expenses.filter((e) => e.expense_date.startsWith(currentMonth));
  const monthTotal = thisMonthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const lastMonthDate = new Date(); lastMonthDate.setDate(1); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = lastMonthDate.toISOString().slice(0, 7);
  const lastTotal = expenses.filter((e) => e.expense_date.startsWith(lastMonth)).reduce((sum, e) => sum + Number(e.amount), 0);
  const change = lastTotal ? Math.round(((monthTotal - lastTotal) / lastTotal) * 100) : null;
  const filtered = useMemo(() => expenses.filter((e) => {
    const matchesText = `${e.title} ${e.category} ${e.notes || ''}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === 'All categories' || e.category === category;
    const matchesMonth = month === 'All time' || e.expense_date.startsWith(currentMonth);
    return matchesText && matchesCategory && matchesMonth;
  }), [expenses, query, category, month, currentMonth]);
  const grouped = filtered.reduce((groups, expense) => {
    (groups[expense.expense_date] ||= []).push(expense);
    return groups;
  }, {});
  const breakdown = CATEGORIES.map((name) => ({ name, total: thisMonthExpenses.filter((e) => e.category === name).reduce((sum, e) => sum + Number(e.amount), 0) })).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
  const topCategory = breakdown[0];
  const maxBreakdown = Math.max(...breakdown.map((x) => x.total), 1);

  async function submitExpense(event) {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch(editingId ? `/api/expenses/${encodeURIComponent(editingId)}` : '/api/expenses', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save this expense.');
      setExpenses((items) => editingId ? items.map((item) => item.id === editingId ? data : item) : [data, ...items]); setModal(false); setEditingId(null); setForm({ title: '', amount: '', category: 'Food', expense_date: today(), notes: '' }); setToast(editingId ? 'Expense updated' : 'Expense added');
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  function openEdit(expense) {
    setEditingId(expense.id);
    setForm({ title: expense.title, amount: String(expense.amount), category: expense.category, expense_date: expense.expense_date, notes: expense.notes || '' });
    setModal(true);
  }

  async function removeExpense(expense) {
    if (!window.confirm(`Delete “${expense.title}”?`)) return;
    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(expense.id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not delete this expense.');
      setExpenses((items) => items.filter((item) => item.id !== expense.id)); setToast('Expense deleted');
    } catch (e) { setError(e.message); }
  }

  function exportCsv() {
    const rows = [['Date', 'Title', 'Category', 'Amount', 'Notes'], ...filtered.map((e) => [e.expense_date, e.title, e.category, Number(e.amount).toFixed(2), e.notes || ''])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'pennywise-expenses.csv'; link.click(); URL.revokeObjectURL(link.href);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#home" aria-label="Pennywise home"><span className="brand-mark"><Leaf size={19} strokeWidth={2.5} /></span><span>pennywise<span className="brand-period">.</span></span></a>
      <div className="workspace-switch"><span className="avatar">M</span><span className="workspace-copy"><b>My workspace</b><small>Personal account</small></span><ChevronDown size={15} /></div>
      <p className="nav-label">WORKSPACE</p>
      <nav className="nav-list"><a className="nav-item active" href="#dashboard"><LayoutDashboard size={17} /><span>Overview</span></a><a className="nav-item" href="#transactions"><ArrowDownLeft size={17} /><span>Transactions</span><span className="nav-count">{expenses.length}</span></a><a className="nav-item" href="#insights"><ArrowUpRight size={17} /><span>Insights</span><span className="nav-soon">SOON</span></a></nav>
      <div className="sidebar-bottom"><div className="upgrade-card"><span className="upgrade-icon"><Sparkles size={17} /></span><h3>Money, more mindful.</h3><p>A little clarity goes a long way.</p><a href="#transactions">View your activity <ArrowRight size={13} /></a></div><a className="nav-item settings" href="#settings"><Settings2 size={17} /><span>Settings</span></a><div className="profile"><span className="avatar profile-avatar">M</span><span className="workspace-copy"><b>Mumer</b><small>Free plan</small></span><Ellipsis size={17} /></div></div>
    </aside>

    <main className="main-content" id="home">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>Overview</b></div><div className="top-actions"><span className={`connection ${storage === 'supabase' ? 'connected' : ''}`}><span />{storage === 'supabase' ? 'Synced with Supabase' : 'Local demo mode'}</span><button className="icon-button help-button" title="About Pennywise" onClick={() => setToast('Your spending, organized in one place.')}><CircleHelp size={18} /></button><span className="avatar top-avatar">M</span></div></header>

      <div className="page-wrap">
        <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR MONEY, IN PERSPECTIVE</div><h1>A little more <span>clarity.</span></h1><p className="welcome-subtitle">The small things add up. Here’s where yours went.</p></div><button className="primary-button" onClick={() => { setEditingId(null); setForm({ title: '', amount: '', category: 'Food', expense_date: today(), notes: '' }); setModal(true); }}><Plus size={17} strokeWidth={2.5} />Add expense</button></section>

        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={16} /></button></div>}
        {storage === 'memory' && <div className="demo-notice"><span className="notice-dot" />Showing sample activity · connect Supabase to save your own expenses between sessions <a href="#setup" onClick={() => setToast('Add SUPABASE_URL and SUPABASE_ANON_KEY to .env, then run supabase/schema.sql.')}>Setup <ArrowRight size={12} /></a></div>}

        <section className="stats-grid" aria-label="Spending summary">
          <article className="stat-card balance-card"><div className="stat-top"><span className="stat-label">SPENT THIS MONTH</span><span className="stat-icon green"><ArrowDownLeft size={16} /></span></div><div className="stat-value">{money.format(monthTotal)}</div><div className="stat-foot">{change === null ? <span className="muted-foot">Your monthly spending at a glance</span> : <><span className={`trend ${change <= 0 ? 'positive' : 'negative'}`}>{change <= 0 ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}{Math.abs(change)}%</span><span>vs. last month</span></>}</div><div className="sparkline" aria-hidden="true"><svg viewBox="0 0 168 32" preserveAspectRatio="none"><path d="M0 24 C12 24 12 12 25 15 S41 27 52 20 S64 7 78 12 S96 25 108 17 S124 11 134 14 S150 2 168 5" /></svg></div></article>
          <article className="stat-card"><div className="stat-top"><span className="stat-label">TRANSACTIONS</span><span className="stat-icon lilac"><CreditCard size={16} /></span></div><div className="stat-value">{thisMonthExpenses.length}<span className="stat-unit"> expenses</span></div><div className="stat-foot"><span className="stat-note">Across {new Set(thisMonthExpenses.map((e) => e.category)).size} categories</span></div><div className="mini-pills"><i /><i /><i /><i /><i /><i /><i /></div></article>
          <article className="stat-card"><div className="stat-top"><span className="stat-label">TOP CATEGORY</span><span className="stat-icon peach"><Utensils size={16} /></span></div><div className="stat-value category-value">{topCategory?.name || '—'}</div><div className="stat-foot">{topCategory ? <><span className="stat-note">{money.format(topCategory.total)} total this month</span></> : <span className="stat-note">Add an expense to get started</span>}</div><div className="category-dots"><i /><i /><i /><i /><i /><i /></div></article>
        </section>

        <section className="content-grid" id="transactions">
          <article className="panel transactions-panel"><div className="panel-heading"><div><div className="heading-title-row"><h2>Recent activity</h2><span className="record-count">{filtered.length}</span></div><p>A running list of the little things.</p></div><button className="text-button" onClick={exportCsv}><FileDown size={15} />Export <ChevronDown size={13} /></button></div>
            <div className="toolbar"><label className="search-field"><Search size={15} /><input aria-label="Search expenses" placeholder="Search expenses..." value={query} onChange={(e) => setQuery(e.target.value)} /><kbd>⌘ K</kbd></label><label className="select-wrap"><Filter size={14} /><select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}><option>All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select><ChevronDown size={13} /></label><label className="select-wrap date-select"><CalendarDays size={14} /><select aria-label="Filter by month" value={month} onChange={(e) => setMonth(e.target.value)}><option>This month</option><option>All time</option></select><ChevronDown size={13} /></label></div>
            {loading ? <div className="loading-state"><LoaderCircle className="spin" size={22} />Getting things ready...</div> : Object.keys(grouped).length === 0 ? <div className="empty-state"><span className="empty-illustration"><Leaf size={22} /></span><h3>{expenses.length ? 'No matches this time' : 'Your story starts here'}</h3><p>{expenses.length ? 'Try a different search or filter.' : 'Add your first expense and start seeing the little things clearly.'}</p>{!expenses.length && <button className="secondary-button" onClick={() => setModal(true)}><Plus size={15} />Add your first expense</button>}</div> : <div className="expense-list">{Object.entries(grouped).map(([date, items]) => <div className="date-group" key={date}><div className="date-heading"><span>{dateLabel(date)}</span><span className="date-rule" /><span>{money.format(items.reduce((sum, e) => sum + Number(e.amount), 0))}</span></div>{items.map((expense) => { const Icon = ICONS[expense.category] || Ellipsis; return <div className="expense-row" key={expense.id}><span className={`expense-icon ${TONES[expense.category] || 'gray'}`}><Icon size={16} /></span><span className="expense-copy"><b>{expense.title}</b><small>{expense.notes || expense.category}</small></span><span className="expense-category">{expense.category}</span><span className="expense-amount">−{money.format(expense.amount)}</span><button className="edit-button" title={`Edit ${expense.title}`} aria-label={`Edit ${expense.title}`} onClick={() => openEdit(expense)}><Edit2 size={14} /></button><button className="delete-button" title={`Delete ${expense.title}`} aria-label={`Delete ${expense.title}`} onClick={() => removeExpense(expense)}><Trash2 size={14} /></button></div>; })}</div>)}</div>}
            <div className="panel-footer"><span>Showing <b>{filtered.length}</b> of <b>{expenses.length}</b> expenses</span><button className="view-all" onClick={() => { setMonth('All time'); setCategory('All categories'); setQuery(''); }}>View all activity <ArrowRight size={14} /></button></div>
          </article>

          <aside className="right-column"><article className="panel breakdown-panel" id="insights"><div className="panel-heading compact-heading"><div><h2>Where it goes</h2><p>Your spending, by category.</p></div><button className="icon-button more-button" aria-label="Category breakdown information" onClick={() => setToast('Category totals are based on this month’s expenses.')}><Ellipsis size={18} /></button></div><div className="breakdown-total"><span>{money.format(monthTotal)}</span><small>total this month</small></div>{breakdown.length ? <div className="breakdown-list">{breakdown.slice(0, 5).map((item, i) => { const Icon = ICONS[item.name] || Ellipsis; return <div className="breakdown-item" key={item.name}><div className="breakdown-name"><span className={`breakdown-icon ${TONES[item.name] || 'gray'}`}><Icon size={13} /></span><span>{item.name}</span><span className="breakdown-percent">{Math.round(item.total / monthTotal * 100)}%</span></div><div className="bar-track"><div className={`bar-fill bar-${i}`} style={{ width: `${Math.max(4, item.total / maxBreakdown * 100)}%` }} /></div><div className="breakdown-amount">{money.format(item.total)}</div></div>; })}</div> : <div className="breakdown-empty"><span className="empty-ring"><Leaf size={18} /></span><p>Your categories will appear here</p></div>}<button className="breakdown-link" onClick={() => { setMonth('All time'); document.getElementById('transactions')?.scrollIntoView({ behavior: 'smooth' }); }}>See all transactions <ArrowRight size={14} /></button></article>
            <article className="insight-card"><span className="insight-spark"><Sparkles size={16} /></span><div className="insight-label">A LITTLE INSIGHT</div>{topCategory ? <><h3>{topCategory.name} is your biggest category</h3><p>You’ve spent {money.format(topCategory.total)} here this month. Knowing is the first step.</p></> : <><h3>Small steps, clearer picture</h3><p>Start adding expenses to discover where your money goes each month.</p></>}<div className="insight-decoration">✳</div></article>
            <div className="privacy-note"><span className="privacy-dot" /><span>Your finances stay yours.<br /><b>Private by design.</b></span><button title="Your entries stay in your own database." onClick={() => setToast('Your expenses are stored in your Supabase project, or temporarily in local memory in demo mode.')}><CircleHelp size={15} /></button></div>
          </aside>
        </section>
        <footer className="page-footer"><span>Made for a little more peace of mind <span className="footer-heart">✳</span></span><span>PENNYWISE · PERSONAL FINANCE</span></footer>
      </div>
    </main>

    {modal && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="modal-kicker">A SMALL STEP TOWARD CLARITY</span><h2 id="modal-title">{editingId ? 'Edit expense' : 'Add an expense'}</h2></div><button className="icon-button" onClick={() => { setModal(false); setEditingId(null); }} aria-label="Close"><X size={19} /></button></div><form onSubmit={submitExpense}><label className="form-label">What was it for?<input autoFocus maxLength="100" required placeholder="e.g. Lunch with friends" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><div className="form-row"><label className="form-label">Amount<input required type="number" min="0.01" step="0.01" max="1000000" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label><label className="form-label">Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label></div><label className="form-label">Date<input type="date" required value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></label><label className="form-label">A note, if you like <span className="optional">OPTIONAL</span><textarea maxLength="500" rows="2" placeholder="Anything you’d like to remember" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label><div className="modal-actions"><button type="button" className="cancel-button" onClick={() => { setModal(false); setEditingId(null); }}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{saving ? 'Saving...' : editingId ? 'Save changes' : 'Save expense'}</button></div></form></section></div>}
    {toast && <div className="toast" role="status"><span className="toast-check"><Check size={13} /></span>{toast}<button onClick={() => setToast('')} aria-label="Dismiss"><X size={14} /></button></div>}
  </div>;
}

export default App;
