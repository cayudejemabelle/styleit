const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
app.use(cors());
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "styleit",
  decimalNumbers: true,
});

const AREAS = ["Metro Cebu", "North Cebu", "South Cebu"];
const MAX_DAYS = 4; 

function forecast(values, n = 3) {
  const len = values.length;
  const xs = values.map((_, i) => i + 1);          // months numbered 1, 2, 3...
  const mx = xs.reduce((a, b) => a + b, 0) / len;  // average month number
  const my = values.reduce((a, b) => a + b, 0) / len; // average orders
  let num = 0, den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (values[i] - my);
    den += (x - mx) ** 2;
  });
  const slope = num / den;
  const intercept = my - slope * mx;
  return Array.from({ length: n }, (_, k) =>
    Math.max(0, Math.round(intercept + slope * (len + k + 1)))
  );
}

function areaFilter(req) {
  const area = req.query.area;
  if (AREAS.includes(area)) return { sql: "AND c.area = ?", params: [area] };
  return { sql: "", params: [] };
}

app.get("/", (req, res) => res.send("StyleIt API is running"));
app.get("/api/kpis", async (req, res) => {
  try {
    const f = areaFilter(req);
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS orders,
              ROUND(SUM(s.shipping_fee), 2) AS total_shipping,
              ROUND(AVG(s.shipping_fee), 2) AS avg_fee,
              ROUND(AVG(s.delivery_days), 1) AS avg_days,
              ROUND(SUM(s.shipping_fee) / SUM(o.total_amount) * 100, 1) AS shipping_pct_of_sales
       FROM shipments s
       JOIN orders o    ON o.order_id = s.order_id
       JOIN customers c ON c.customer_id = o.customer_id
       WHERE 1=1 ${f.sql}`,
      f.params
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/couriers", async (req, res) => {
  try {
    const f = areaFilter(req);
    const [rows] = await pool.query(
      `SELECT cr.name AS courier,
              COUNT(*) AS shipments,
              ROUND(AVG(s.shipping_fee), 2) AS avg_fee,
              ROUND(AVG(s.delivery_days), 1) AS avg_days
       FROM shipments s
       JOIN orders o    ON o.order_id = s.order_id
       JOIN customers c ON c.customer_id = o.customer_id
       JOIN couriers cr ON cr.courier_id = s.courier_id
       WHERE 1=1 ${f.sql}
       GROUP BY cr.courier_id, cr.name
       ORDER BY avg_fee`,
      f.params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/monthly", async (req, res) => {
  try {
    const f = areaFilter(req);
    const [found] = await pool.query(
      `SELECT DATE_FORMAT(o.order_date, '%Y-%m') AS month,
              COUNT(*) AS orders,
              ROUND(SUM(s.shipping_fee), 2) AS shipping_cost
       FROM shipments s
       JOIN orders o    ON o.order_id = s.order_id
       JOIN customers c ON c.customer_id = o.customer_id
       WHERE 1=1 ${f.sql}
       GROUP BY month
       ORDER BY month`,
      f.params
    );

    // fill months that had zero orders (SQL leaves them out)
    const history = [];
    let [y, m] = found[0].month.split("-").map(Number);
    const last = found[found.length - 1].month;
    while (true) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      history.push(found.find((r) => r.month === key) || { month: key, orders: 0, shipping_cost: 0 });
      if (key === last) break;
      m++;
      if (m > 12) { m = 1; y++; }
    }

    // label the forecast months
    const next = forecast(history.map((r) => r.orders));
    const forecastRows = next.map((orders, i) => {
      const d = new Date(y, m - 1 + i + 1, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { month, orders };
    });

    res.json({ history, forecast: forecastRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/recommendation", async (req, res) => {
  try {
    // average fee and delivery time for every courier in every area
    const [stats] = await pool.query(
      `SELECT c.area, cr.name AS courier,
              COUNT(*) AS shipments,
              ROUND(AVG(s.shipping_fee), 2) AS avg_fee,
              ROUND(AVG(s.delivery_days), 1) AS avg_days
       FROM shipments s
       JOIN orders o    ON o.order_id = s.order_id
       JOIN customers c ON c.customer_id = o.customer_id
       JOIN couriers cr ON cr.courier_id = s.courier_id
       GROUP BY c.area, cr.name`
    );

    // what each area pays today, on average
    const [current] = await pool.query(
      `SELECT c.area, COUNT(*) AS orders, AVG(s.shipping_fee) AS avg_fee
       FROM shipments s
       JOIN orders o    ON o.order_id = s.order_id
       JOIN customers c ON c.customer_id = o.customer_id
       GROUP BY c.area`
    );

    const result = AREAS.map((area) => {
      const best = stats
        .filter((r) => r.area === area && Number(r.avg_days) <= MAX_DAYS)
        .sort((a, b) => a.avg_fee - b.avg_fee)[0];
      const now = current.find((r) => r.area === area);
      return {
        area,
        recommended_courier: best.courier,
        avg_fee: Number(best.avg_fee),
        avg_days: Number(best.avg_days),
        saving_per_order: Number((now.avg_fee - best.avg_fee).toFixed(2)),
        orders: now.orders,
      };
    });

    // overall saving, weighted so busy areas count more
    const totalOrders = result.reduce((a, r) => a + r.orders, 0);
    const overall =
      result.reduce((a, r) => a + r.saving_per_order * r.orders, 0) / totalOrders;

    const area = req.query.area;
    if (AREAS.includes(area)) return res.json(result.find((r) => r.area === area));
    res.json({ by_area: result, saving_per_order_overall: Number(overall.toFixed(2)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/categories", async (req, res) => {
  try {
    const f = areaFilter(req);
    const [rows] = await pool.query(
      `SELECT p.category,
              SUM(oi.quantity) AS units,
              ROUND(SUM(oi.quantity * p.price), 2) AS sales
       FROM order_items oi
       JOIN products p  ON p.product_id = oi.product_id
       JOIN orders o    ON o.order_id = oi.order_id
       JOIN customers c ON c.customer_id = o.customer_id
       WHERE 1=1 ${f.sql}
       GROUP BY p.category
       ORDER BY sales DESC`,
      f.params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/marketing", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT channel,
              SUM(cost) AS total_cost,
              SUM(orders_generated) AS orders_generated,
              ROUND(SUM(cost) / SUM(orders_generated), 2) AS cost_per_order
       FROM marketing
       GROUP BY channel
       ORDER BY cost_per_order`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const f = areaFilter(req);
    const [rows] = await pool.query(
      `SELECT o.order_id,
              DATE_FORMAT(o.order_date, '%Y-%m-%d') AS order_date,
              c.name AS customer, c.city, c.area,
              o.total_amount,
              cr.name AS courier, s.shipping_fee, s.delivery_days
       FROM orders o
       JOIN customers c ON c.customer_id = o.customer_id
       JOIN shipments s ON s.order_id = o.order_id
       JOIN couriers cr ON cr.courier_id = s.courier_id
       WHERE 1=1 ${f.sql}
       ORDER BY o.order_date DESC, o.order_id DESC`,
      f.params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log("API on http://localhost:3001"));