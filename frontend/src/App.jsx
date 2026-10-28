import { useEffect, useState } from "react";
import {
  BarChart, Bar, Cell, LineChart, Line, PieChart, Pie, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const API = "http://localhost:3001";
const AREAS = ["All", "Metro Cebu", "North Cebu", "South Cebu"];
const AREA_LABEL = { All: "All of Cebu" };
const COLORS = { "Metro Cebu": "#23395B", "North Cebu": "#F2C94C", "South Cebu": "#D1495B" };

const legendText = (v) => <span style={{ color: "#14213D" }}>{v}</span>;

const peso = (n, d = 2) =>
  "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function App() {
  const [area, setArea] = useState("All");
  const [kpis, setKpis] = useState(null);
  const [couriers, setCouriers] = useState([]);
  const [monthly, setMonthly] = useState({ history: [], forecast: [] });
  const [rec, setRec] = useState(null);
    const [categories, setCategories] = useState([]);
  const [marketing, setMarketing] = useState([]);
    const [orders, setOrders] = useState([]);

  useEffect(() => {
    const q = area === "All" ? "" : `?area=${encodeURIComponent(area)}`;
    Promise.all([
      fetch(`${API}/api/kpis${q}`).then((r) => r.json()),
      fetch(`${API}/api/couriers${q}`).then((r) => r.json()),
      fetch(`${API}/api/monthly${q}`).then((r) => r.json()),
      fetch(`${API}/api/recommendation`).then((r) => r.json()),
    fetch(`${API}/api/categories${q}`).then((r) => r.json()),
      fetch(`${API}/api/marketing`).then((r) => r.json()),
      fetch(`${API}/api/orders${q}`).then((r) => r.json()),
    ]).then(([k, c, m, r, cat, mk, o]) => {
      setKpis(k);
      setCouriers(c);
      setMonthly(m);
      setRec(r);
      setCategories(cat);
      setMarketing(mk);
      setOrders(o);
    });
  }, [area]);

  const chartData = [
    ...monthly.history.map((r) => ({ month: r.month, orders: r.orders })),
    ...monthly.forecast.map((r) => ({ month: r.month, forecast: r.orders })),
  ];
  if (monthly.history.length > 0) {
    const last = monthly.history.length - 1;
    chartData[last].forecast = chartData[last].orders;
  }
  const nextMonth = monthly.forecast[0]?.orders;
  const nextThree = monthly.forecast.reduce((a, r) => a + r.orders, 0);

  const byArea = rec ? rec.by_area : [];
  const selected = byArea.find((r) => r.area === area);

  return (
    <main className="dash">
      <header className="top">
        <div className="tag">
          <h1>StyleIt</h1>
          <p>Cebu shipping dashboard</p>
        </div>
        <p className="ask">
          How do we lower shipping cost per order in Cebu without slowing delivery?
        </p>
      </header>

      <nav className="sizes" aria-label="Area filter">
        {AREAS.map((a) => (
          <button
            key={a}
            className={a === area ? "pill active" : "pill"}
            onClick={() => setArea(a)}
          >
            {AREA_LABEL[a] || a}
          </button>
        ))}
      </nav>

      {kpis && (
        <section className="kpis">
          <div className="card kpi">
            <div className="lbl">Orders shipped</div>
            <div className="num">{kpis.orders}</div>
          </div>
          <div className="card kpi">
            <div className="lbl">Total shipping cost</div>
            <div className="num">{peso(kpis.total_shipping, 0)}</div>
          </div>
          <div className="card kpi">
            <div className="lbl">Average fee per order</div>
            <div className="num">{peso(kpis.avg_fee)}</div>
          </div>
          <div className="card kpi">
            <div className="lbl">Shipping as share of sales</div>
            <div className="num">{kpis.shipping_pct_of_sales}%</div>
          </div>
        </section>
      )}

      <div className="grid">
        <section className="card c-line">
          <span className="step s-p">Predictive</span>
          <h2>Monthly orders and 3-month forecast</h2>
          <p className="sub">Oct 2025 to Sep 2026, then a linear trend to Dec 2026</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d5dbe5" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend formatter={legendText} />
              <Line dataKey="orders" name="Actual orders" stroke="#23395B" strokeWidth={3} />
              <Line dataKey="forecast" name="Forecast" stroke="#D1495B" strokeWidth={3} strokeDasharray="6 6" />
            </LineChart>
          </ResponsiveContainer>
          {nextMonth !== undefined && (
            <p className="fnote">
              Expect about <b>{nextMonth}</b> orders next month and <b>{nextThree}</b> over the next three months.
            </p>
          )}
        </section>

        <section className="card c-bars">
          <span className="step s-d">Descriptive</span>
          <h2>Average shipping fee by courier</h2>
          <p className="sub">Pesos per order in the selected area</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={couriers} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d5dbe5" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="courier" width={92} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => peso(v)} />
              <Bar dataKey="avg_fee" name="Average fee">
                {couriers.map((c) => (
                  <Cell
                    key={c.courier}
                    fill={selected && c.courier === selected.recommended_courier ? "#F2C94C" : "#23395B"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="note">
            <span className="key"></span>Recommended courier (shown when an area is selected)
          </p>
        </section>

        <section className="card c-pie">
          <span className="step s-d">Descriptive</span>
          <h2>Orders by area</h2>
          <p className="sub">The selected area stays in colour</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byArea} dataKey="orders" nameKey="area" innerRadius={50} outerRadius={90}>
                {byArea.map((r) => (
                  <Cell
                    key={r.area}
                    fill={area === "All" || area === r.area ? COLORS[r.area] : "#D5DBE5"}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend formatter={legendText} />
            </PieChart>
          </ResponsiveContainer>
        </section>

        {rec && (
          <section className="card c-rec">
            <span className="step s-r">Prescriptive</span>
            <h2>Recommended courier</h2>
            {selected ? (
              <>
                <div className="rec-name">{selected.recommended_courier}</div>
                <p className="sub">Cheapest courier in {selected.area} that averages 4 days or less.</p>
                <div className="facts">
                  <div className="fact">
                    Saved per order vs. today's average
                    <b>{peso(selected.saving_per_order)}</b>
                  </div>
                  <div className="fact">
                    Average delivery time
                    <b>{selected.avg_days} days</b>
                  </div>
                </div>
              </>
            ) : (
              <>
                <ul className="rec-list">
                  {byArea.map((r) => (
                    <li key={r.area}>
                      {r.area}: <b>{r.recommended_courier}</b> ({peso(r.avg_fee)}, {r.avg_days} days)
                    </li>
                  ))}
                </ul>
                <div className="facts">
                  <div className="fact">
                    Average saving across Cebu, per order
                    <b>{peso(rec.saving_per_order_overall)}</b>
                  </div>
                </div>
              </>
            )}
            <p className="rule">
              Next step: test a free-shipping minimum (for example ₱800) and compare the subsidy cost.
            </p>
          </section>
        )}
                <section className="card c-half">
          <span className="step s-d">Descriptive</span>
          <h2>Sales by product category</h2>
          <p className="sub">Pesos in the selected area</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={categories} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d5dbe5" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${v / 1000}k`} />
              <YAxis type="category" dataKey="category" width={92} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => peso(v, 0)} />
              <Bar dataKey="sales" name="Sales" fill="#23395B" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card c-half">
          <span className="step s-d">Descriptive</span>
          <h2>Marketing cost per order by channel</h2>
          <p className="sub">Pesos spent for each order a channel brought in (all of Cebu)</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={marketing} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d5dbe5" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="channel" width={92} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => peso(v)} />
              <Bar dataKey="cost_per_order" name="Cost per order" fill="#D1495B" />
            </BarChart>
          </ResponsiveContainer>
        </section>

               <section className="card c-full">
          <span className="step s-d">Records</span>
          <h2>Orders</h2>
          <p className="sub">{orders.length} orders in the selected area, newest first</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>City</th>
                  <th className="r">Total</th>
                  <th>Courier</th>
                  <th className="r">Shipping fee</th>
                  <th className="r">Days</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.order_id}>
                    <td>#{o.order_id}</td>
                    <td>{o.order_date}</td>
                    <td>{o.customer}</td>
                    <td>{o.city}</td>
                    <td className="r">{peso(o.total_amount, 0)}</td>
                    <td>{o.courier}</td>
                    <td className="r">{peso(o.shipping_fee)}</td>
                    <td className="r">{o.delivery_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </main>
  );
}