
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { inr } from '../../lib/format'
import type { Customer, Sale } from '../../types'

const empty = {
  name: '',
  type: '',
  phone: '',
  address: '',
  potential: '',
  priority: '3',
  availability: '',
  notes: ''
}

export default function CustomersView({
  userId
}: {
  userId: string
}) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [f, setF] = useState(empty)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setMsg('')

    const c = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)

    const s = await supabase
      .from('sales')
      .select('id,customer_id,sale_date,amount,status,product_category')
      .eq('user_id', userId)

    if (c.error) {
      setMsg('Could not load customers: ' + c.error.message)
    } else {
      setCustomers(
        ((c.data ?? []) as Customer[]).sort(
          (a, b) =>
            a.priority - b.priority ||
            b.potential_amount - a.potential_amount
        )
      )
    }

    if (!s.error) {
      setSales((s.data ?? []) as Sale[])
    }

    setLoading(false)
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    setMsg('')

    if (!f.name.trim()) {
      return setMsg('Customer name is required.')
    }

    const pot = f.potential === '' ? 0 : Number(f.potential)

    if (!Number.isFinite(pot) || pot < 0) {
      return setMsg('Potential must be a number.')
    }

    setBusy(true)

    const { error } = await supabase
      .from('customers')
      .insert({
        user_id: userId,
        name: f.name.trim(),
        customer_type: f.type.trim() || null,
        phone: f.phone.trim() || null,
        address: f.address.trim() || null,
        potential_amount: pot,
        priority: Number(f.priority),
        usual_availability: f.availability || null,
        notes: null
      })

    setBusy(false)

    if (error) {
      return setMsg('Could not save: ' + error.message)
    }

    setF(empty)
    setAdding(false)
    await load()
  }

  async function archive(id: string) {
    if (!window.confirm('Remove this customer from your list?')) {
      return
    }

    const { error } = await supabase
      .from('customers')
      .update({ active: false })
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      return setMsg('Could not remove: ' + error.message)
    }

    setSelected(null)
    await load()
  }

  const sel = customers.find(c => c.id === selected)

  if (sel) {
    const mine = sales.filter(
      s =>
        s.customer_id === sel.id &&
        s.status !== 'cancelled'
    )

    const last = [...mine].sort(
      (a, b) => b.sale_date.localeCompare(a.sale_date)
    )[0]

    const avg = mine.length
      ? mine.reduce((t, s) => t + Number(s.amount), 0) / mine.length
      : 0

    return (
      <div className="card">
        <button
          className="link"
          style={{ textAlign: 'left' }}
          onClick={() => setSelected(null)}
        >
          ← Back to customers
        </button>

        <h2>{sel.name}</h2>

        <p className="small">
          {sel.customer_type || 'Customer'} · Priority{' '}
          {sel.priority} (1 = highest)
        </p>

        <p>
          <b>Potential per month:</b>{' '}
          {inr(Number(sel.potential_amount))}
        </p>

        <p>
          <b>Last sale:</b>{' '}
          {last
            ? `${inr(Number(last.amount))} on ${last.sale_date}`
            : 'None yet'}
        </p>

        <p>
          <b>Average sale:</b>{' '}
          {mine.length ? inr(avg) : 'None yet'}
        </p>

        {sel.phone && (
          <p>
            <b>Phone:</b> {sel.phone}
          </p>
        )}

        {sel.usual_availability && (
          <p>
            <b>Best time to reach:</b>{' '}
            {sel.usual_availability}
          </p>
        )}

        {sel.address && (
          <p>
            <b>Address:</b> {sel.address}
          </p>
        )}

        {sel.notes && (
          <p>
            <b>Notes:</b> {sel.notes}
          </p>
        )}

        <div className="row">
          {sel.address && (
            <a
              className="btn"
              target="_blank"
              rel="noopener noreferrer"
              href={
                'https://www.google.com/maps/search/?api=1&query=' +
                encodeURIComponent(sel.address)
              }
            >
              Navigate
            </a>
          )}

          {sel.phone && (
            <a className="btn" href={'tel:' + sel.phone}>
              Call
            </a>
          )}
        </div>

        {msg && <p className="msg">{msg}</p>}

        <button
          className="link"
          onClick={() => archive(sel.id)}
        >
          Remove customer
        </button>
      </div>
    )
  }

  if (adding) {
    const set =
      (k: keyof typeof empty) =>
      (e: { target: { value: string } }) =>
        setF({ ...f, [k]: e.target.value })

    return (
      <div className="card">
        <h2>Add customer</h2>

        <label>
          Name
          <input
            value={f.name}
            onChange={set('name')}
          />
        </label>

        <label>
          Type
          <input
            placeholder="e.g. Retailer, Distributor, Clinic"
            value={f.type}
            onChange={set('type')}
          />
        </label>

        <label>
          Phone (optional)
          <input
            type="tel"
            inputMode="tel"
            value={f.phone}
            onChange={set('phone')}
          />
        </label>

        <label>
          Address
          <input
            value={f.address}
            onChange={set('address')}
          />
        </label>

        <label>
          Potential per month (₹)
          <input
            inputMode="numeric"
            value={f.potential}
            onChange={e =>
              setF({
                ...f,
                potential: e.target.value.replace(/[^0-9.]/g, '')
              })
            }
          />
        </label>

        <label>
          Priority
          <select
            value={f.priority}
            onChange={set('priority')}
          >
            <option value="1">1 - Highest</option>
            <option value="2">2 - High</option>
            <option value="3">3 - Normal</option>
            <option value="4">4 - Low</option>
            <option value="5">5 - Lowest</option>
          </select>
        </label>

        <label>
          Best time to reach
          <input
            type="time"
            value={f.availability}
            onChange={set('availability')}
          />
        </label>

        {msg && <p className="msg">{msg}</p>}

        <button
          className="primary"
          disabled={busy}
          onClick={save}
        >
          {busy ? 'Saving…' : 'Save customer'}
        </button>

        <button
          className="link"
          onClick={() => {
            setAdding(false)
            setMsg('')
            setF(empty)
          }}
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="stack">
      <button
        className="primary"
        onClick={() => {
          setAdding(true)
          setMsg('')
          setF(empty)
        }}
      >
        + Add customer
      </button>

      {msg && <p className="msg">{msg}</p>}

      {loading ? (
        <div className="card">
          <p>Loading…</p>
        </div>
      ) : customers.length === 0 ? (
        <div className="card">
          <p>No customers yet. Tap "Add customer" to start.</p>
        </div>
      ) : (
        customers.map(c => (
          <button
            key={c.id}
            className="item"
            onClick={() => setSelected(c.id)}
          >
            <span>
              <b>{c.name}</b>
              <br />
              <span className="small">
                {c.customer_type || 'Customer'} · Priority {c.priority}
              </span>
            </span>

            <span className="small">
              {inr(Number(c.potential_amount))}
            </span>
          </button>
        ))
      )}
    </div>
  )
}
