import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { inr, todayIST, monthStart } from '../../lib/format'
import type { Customer } from '../../types'

type Row = {
  id: string
  amount: number
  sale_date: string
  status: string
  customer_id: string | null
  product_category: string | null
  customers: { name: string } | null
}

export default function SalesView({ userId }: { userId: string }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [rows, setRows] = useState<Row[]>([])

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIST())
  const [customerId, setCustomerId] = useState('')
  const [category, setCategory] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)

  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const c = await supabase
      .from('customers')
      .select('*')
      .eq('active', true)
      .order('name')

    if (!c.error) {
      setCustomers((c.data ?? []) as Customer[])
    }

    const s = await supabase
      .from('sales')
      .select(
        'id,amount,sale_date,status,customer_id,product_category,customers(name)'
      )
      .gte('sale_date', monthStart(todayIST()))
      .order('sale_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (s.error) {
      setMsg('Could not load sales: ' + s.error.message)
    } else {
      setRows((s.data ?? []) as unknown as Row[])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function resetForm() {
    setAmount('')
    setDate(todayIST())
    setCustomerId('')
    setCategory('')
    setEditingId(null)
    setMsg('')
  }

  function startEdit(row: Row) {
    setEditingId(row.id)
    setAmount(String(row.amount))
    setDate(row.sale_date)
    setCustomerId(row.customer_id ?? '')
    setCategory(row.product_category ?? '')
    setMsg('')
  }

  async function save() {
    setMsg('')

    const a = Number(amount)

    if (!Number.isFinite(a) || a <= 0) {
      return setMsg('Enter the sale amount as a number above 0.')
    }

    if (date > todayIST()) {
      return setMsg('Sale date cannot be in the future.')
    }

    setBusy(true)

    if (editingId) {
      const { error } = await supabase
        .from('sales')
        .update({
          amount: a,
          sale_date: date,
          customer_id: customerId || null,
          product_category: category.trim() || null,
        })
        .eq('id', editingId)
        .eq('user_id', userId)

      setBusy(false)

      if (error) {
        return setMsg('Could not update: ' + error.message)
      }

      resetForm()
      await load()
      return
    }

    const { error } = await supabase
      .from('sales')
      .insert({
        user_id: userId,
        amount: a,
        sale_date: date,
        customer_id: customerId || null,
        product_category: category.trim() || null,
      })

    setBusy(false)

    if (error) {
      return setMsg('Could not save: ' + error.message)
    }

    setAmount('')
    setCategory('')
    setCustomerId('')
    setDate(todayIST())

    await load()
  }

  async function cancelSale(id: string) {
    if (
      !window.confirm(
        'Mark this sale as cancelled? It will stop counting toward your target.'
      )
    ) {
      return
    }

    const { error } = await supabase
      .from('sales')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      return setMsg('Could not cancel: ' + error.message)
    }

    await load()
  }

  const total = rows
    .filter(r => r.status !== 'cancelled')
    .reduce((s, r) => s + Number(r.amount), 0)

  return (
    <div className="stack">
      <div className="card">
        <h2>{editingId ? 'Edit sale' : 'Record a sale'}</h2>

        <label>
          Amount (₹)
          <input
            inputMode="numeric"
            value={amount}
            onChange={e =>
              setAmount(e.target.value.replace(/[^0-9.]/g, ''))
            }
          />
        </label>

        <label>
          Customer (optional)
          <select
            value={customerId}
            onChange={e => setCustomerId(e.target.value)}
          >
            <option value="">No customer</option>

            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Date
          <input
            type="date"
            max={todayIST()}
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </label>

        <label>
          Product category (optional)
          <input
            value={category}
            onChange={e => setCategory(e.target.value)}
          />
        </label>

        {msg && <p className="msg">{msg}</p>}

        <button
          className="primary"
          disabled={busy}
          onClick={save}
        >
          {busy
            ? 'Saving…'
            : editingId
              ? 'Save changes'
              : 'Save sale'}
        </button>

        {editingId && (
          <button
            className="link small-btn"
            disabled={busy}
            onClick={resetForm}
          >
            Cancel editing
          </button>
        )}
      </div>

      <div className="card">
        <h2>This month: {inr(total)}</h2>

        {rows.length === 0 ? (
          <p>No sales recorded this month.</p>
        ) : (
          rows.map(r => (
            <div key={r.id} className="line">
              <span>
                {r.sale_date} · {r.customers?.name ?? 'No customer'}
                {r.status === 'cancelled'
                  ? ' (cancelled)'
                  : ''}
              </span>

              <span>
                <b>{inr(Number(r.amount))}</b>

                {r.status !== 'cancelled' && (
                  <>
                    <button
                      className="link small-btn"
                      onClick={() => startEdit(r)}
                    >
                      Edit
                    </button>

                    <button
                      className="link small-btn"
                      onClick={() => cancelSale(r.id)}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}