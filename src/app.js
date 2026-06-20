
//Authentication (การยืนยันตัวตน)
//Authorization (การกำหนดสิทธิ์)

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const db = require("./config/database");

const authRoutes = require("./routers/auth.routes");
const categoryRoutes = require("./routers/category.routes");
const unitRoutes = require("./routers/unit.routes");
const productRoutes = require("./routers/product.routes");
const supplierRoutes = require("./routers/supplier.routes");
const purchaseRoutes = require("./routers/purchase.routes");
const orderRoutes = require("./routers/order.routes");
const customerRoutes = require("./routers/customer.routes");
const paymentRoutes = require("./routers/payment.routes");
const batchRoutes = require("./routers/batch.routes");
const path = require("path");

const app = express();

//Middleware
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

// Pretty JSON
app.set("json spaces", 2);

//Routes
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/units", unitRoutes);
app.use("/api/products", productRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchases", purchaseRoutes)
app.use("/api/orders", orderRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/batches", batchRoutes);

// เปิดให้เข้าถึงไฟล์รูปสลิปได้ผ่าน URL
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

//Test routes
app.get("/", (req, res) => res.json({ message: "POS API is running" }));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

