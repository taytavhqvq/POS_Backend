
//Authentication (การยืนยันตัวตน)
//Authorization (การกำหนดสิทธิ์)

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const db = require("./config/database");

const authRoutes = require("./routers/auth.routes");

const app = express();

//Middleware
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

//Routes
app.use("/api/auth", authRoutes);

//Test routes
app.get("/", (req, res) => res.json({ message: "POS API is running" }));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

