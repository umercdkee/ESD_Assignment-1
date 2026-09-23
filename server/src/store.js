import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { expensesStored } from './metrics.js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;

// A small in-memory adapter makes the app usable immediately before Supabase is configured.
// It resets when the API restarts; configure Supabase for persistent storage.
const demoExpenses = [
  { id: 'demo-1', title: 'Weekly groceries', amount: 84.5, category: 'Food', expense_date: new Date().toISOString().slice(0, 10), notes: 'Market and pantry staples', created_at: new Date().toISOString() },
  { id: 'demo-2', title: 'Monthly transit pass', amount: 42, category: 'Transport', expense_date: new Date().toISOString().slice(0, 10), notes: '', created_at: new Date().toISOString() },
  { id: 'demo-3', title: 'Coffee with a friend', amount: 12.75, category: 'Food', expense_date: new Date().toISOString().slice(0, 10), notes: '', created_at: new Date().toISOString() },
  { id: 'demo-4', title: 'Streaming subscription', amount: 9.99, category: 'Bills', expense_date: new Date().toISOString().slice(0, 10), notes: '', created_at: new Date().toISOString() },
];
let memoryExpenses = [...demoExpenses];

export async function listExpenses() {
  if (supabase) {
    const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    expensesStored.set(data.length);
    return data;
  }
  expensesStored.set(memoryExpenses.length);
  return [...memoryExpenses].sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at));
}

export async function createExpense(expense) {
  if (supabase) {
    const { data, error } = await supabase.from('expenses').insert(expense).select().single();
    if (error) throw error;
    const { count } = await supabase.from('expenses').select('*', { count: 'exact', head: true });
    expensesStored.set(count ?? 0);
    return data;
  }
  const created = { id: `local-${randomUUID()}`, ...expense, created_at: new Date().toISOString() };
  memoryExpenses.push(created);
  expensesStored.set(memoryExpenses.length);
  return created;
}

export async function updateExpense(id, expense) {
  if (supabase) {
    const { data, error } = await supabase.from('expenses').update(expense).eq('id', id).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const index = memoryExpenses.findIndex((item) => item.id === id);
  if (index === -1) return null;
  memoryExpenses[index] = { ...memoryExpenses[index], ...expense };
  return memoryExpenses[index];
}

export async function deleteExpense(id) {
  if (supabase) {
    const { error, count } = await supabase.from('expenses').delete({ count: 'exact' }).eq('id', id);
    if (error) throw error;
    const { count: remaining } = await supabase.from('expenses').select('*', { count: 'exact', head: true });
    expensesStored.set(remaining ?? 0);
    return count > 0;
  }
  const before = memoryExpenses.length;
  memoryExpenses = memoryExpenses.filter((expense) => expense.id !== id);
  expensesStored.set(memoryExpenses.length);
  return memoryExpenses.length < before;
}
