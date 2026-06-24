
//Authentication (การยืนยันตัวตน)
//Authorization (การกำหนดสิทธิ์)

require("dotenv").config();
const express = require("express");
const http = require('http');
const { Server } = require('socket.io');
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const db = require("./config/database");
const path = require("path");

const { startExpiryChecker } = require('./utils/expiryChecker');


const app = express();
// ต้องใช้ http.createServer แทน app.listen ตรงๆ เพราะ socket.io ต้องการ http server
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' } // ตอน production ควรระบุ origin ให้ชัดเจน
});

// เก็บ io ไว้ใช้ใน controller อื่น (inject ผ่าน app.locals)
app.locals.io = io;

// Pretty JSON
app.set("json spaces", 2);

//Middleware
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
// เปิดให้เข้าถึงไฟล์รูปสลิปได้ผ่าน URL
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

//Routes
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
const userRoutes = require("./routers/user.routes");
const notificationRoutes = require('./routers/notification.routes');

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
app.use("/api/users", userRoutes);
app.use('/api/notifications', notificationRoutes);

app.get("/", (req, res) => res.json({ message: "POS API is running" }));

// Socket.io connection
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Admin join ห้อง 'admin' เพื่อรับแจ้งเตือนเฉพาะ Admin
    socket.on('join_admin', () => {
        socket.join('admin');
        console.log(`Admin joined room: ${socket.id}`);
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startExpiryChecker(io); // เริ่มตรวจสอบวันหมดอายุทันที
});
